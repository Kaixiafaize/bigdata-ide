# Kernel 与后端解耦 — 设计方案

## 1. 背景与目标

### 1.1 问题

当前 BigData IDE 的代码执行依赖 **本机 Jupyter Kernel**：每个会话在 FastAPI 所在进程内通过 `AsyncKernelManager` 启动一个 ipykernel 子进程，会话与 Kernel 映射保存在内存字典中。带来的限制：

- **单机瓶颈**：用户/会话数上升时，单机内存与 CPU 无法支撑大量 kernel 进程。
- **无法水平扩展**：多实例 FastAPI 时，会话状态不共享，且每台机器都会起 kernel，无法统一调度。
- **耦合**：Kernel 生命周期与后端进程绑定，运维与扩容不灵活。

### 1.2 目标

- **Kernel 与后端解耦**：代码执行进程（Kernel）由独立集群或服务管理，后端只做「路由/代理」。
- **会话状态外置**：支持多实例 FastAPI 无状态部署，会话与 Kernel 映射存 Redis（或等价存储）。
- **可扩展**：Kernel 层可独立扩容（K8s/容器池），后端层可水平扩容。

---

## 2. 现状架构（简要）

```
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI (单实例)                                                 │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐  │
│  │ kernel_service  │───▶│ kernel_managers / kernel_clients    │  │
│  │ (内存 dict)     │    │ session_to_kernel (内存)            │  │
│  └────────┬────────┘    └─────────────────────────────────────┘  │
│           │ start_kernel()                                        │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ ipykernel 子进程  │  (本机，与后端同机)                         │
│  └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

- 创建会话：`create_session()` → `AsyncKernelManager.start_kernel()` → 本机起子进程，映射写内存。
- 执行：`get_kernel_client(session_id)` 从内存取 `KernelClient`，发 `execute(code)`。
- 删除会话：本机 `shutdown_kernel()`，从内存删映射。

---

## 3. 目标架构（解耦后）

```
┌──────────────┐     ┌──────────────────────────────────────────────────┐
│  前端        │     │  FastAPI (可多实例，无状态)                         │
│  WebSocket   │────▶│  - 鉴权、文件、历史、会话 API                      │
│  / HTTP      │     │  - 创建会话 → 向「Kernel 层」要 kernel，写 Redis   │
└──────────────┘     │  - 执行 → 从 Redis 取连接信息，转发到对应 kernel   │
                     └─────────────────────┬────────────────────────────┘
                                            │
                     ┌──────────────────────┼──────────────────────┐
                     │  Redis               │  Kernel 层            │
                     │  session_id →        │  (独立部署，可扩展)   │
                     │  kernel_id /         │  - EG 或 自建 Pool    │
                     │  connection_info     │  - 按需起 kernel      │
                     └──────────────────────┘  - 返回连接信息       │
                                                └──────────────────────┘
```

- **后端**：不再在本机 `start_kernel()`，只调用「Kernel 层」API 获取 kernel，并将 session ↔ kernel 映射写入 Redis。
- **执行**：根据 session_id 从 Redis 取 connection 信息，用 jupyter_client 连接至该 kernel（或通过 Kernel 层代理）执行代码。
- **多实例**：任意 FastAPI 实例都能通过 Redis 拿到同一会话的 kernel 连接信息，实现无状态水平扩展。

---

## 4. 方案对比

| 维度           | 方案 A：Jupyter Enterprise Gateway | 方案 B：自建 Kernel Pool        |
|----------------|-----------------------------------|----------------------------------|
| Kernel 生命周期 | EG 在 K8s/YARN 等上按需起/停      | 自建服务预起或按需起，放入池子   |
| 后端改造       | 调 EG API 创建/删除 kernel，写 Redis | 从 Redis 池取/还 kernel，写 Redis |
| 运维复杂度     | 需部署与维护 EG                   | 需实现并维护 Pool 服务           |
| 弹性与成熟度   | 成熟，易与 K8s 集成               | 自控，规模中等时足够             |
| 适用场景       | 有 K8s 或计划上 K8s，用户量大     | 无 K8s 或希望少依赖、先小步试    |

**推荐**：有或计划使用 K8s 时优先 **方案 A（Enterprise Gateway）**；否则或希望实现简单时可选用 **方案 B（自建 Kernel Pool）**。

---

## 5. 推荐方案 A：Enterprise Gateway 详细设计

### 5.1 组件角色

| 组件           | 职责 |
|----------------|------|
| **FastAPI**    | 认证、文件、历史、会话 API；创建会话时调 EG 起 kernel 并写 Redis；执行时从 Redis 取连接并转发 execute。 |
| **Redis**      | 存 `session_id → kernel_id`、`kernel_id → connection_info`（或仅 session → connection_info），TTL 与 EG kernel 生命周期一致。 |
| **Enterprise Gateway** | 提供「创建 kernel / 删除 kernel / 获取 connection」等 API；在 K8s/集群内启动 kernel 进程。 |
| **Kernel 进程** | 由 EG 在集群内启动，执行用户代码；与 FastAPI 不在同一节点。 |

### 5.2 数据流

**创建会话**

1. 前端请求 `POST /sessions`（kernel_type、可选 venv_id）。
2. FastAPI 校验鉴权，决定 kernel 类型与参数（若支持 venv，可映射为 EG 的 kernel profile）。
3. FastAPI 调 EG「创建 kernel」API，传入 kernel 类型（或 profile），EG 返回 `kernel_id` 及 `connection_info`（或可访问的 kernel URL）。
4. FastAPI 生成 `session_id`，将 `session_id → kernel_id`、`kernel_id → connection_info` 写入 Redis（可设 TTL，与 EG 侧 kernel 超时一致）。
5. 返回前端 `session_id`、kernel 信息（与现有响应结构兼容）。

**执行代码（HTTP 或 WebSocket）**

1. 前端带 `session_id` 发执行请求。
2. FastAPI 用 `session_id` 从 Redis 取 `connection_info`（或 kernel 访问地址）。
3. 使用 jupyter_client 根据 connection_info 构造 `KernelClient`（或请求 EG 的 kernel 代理端点），向该 kernel 发 `execute(code)`，接收 iopub/shell 消息。
4. 将执行结果返回前端（与现有逻辑一致）。

**删除会话**

1. 前端请求 `DELETE /sessions/{session_id}`。
2. FastAPI 从 Redis 取 `kernel_id`，调 EG「删除 kernel」API。
3. 删除 Redis 中该 session 与 kernel 的映射。

### 5.3 接口与存储约定

**Redis 键设计（示例）**

- `session:{session_id}` → Hash 或 JSON：`kernel_id`、`kernel_type`、`connection_info`（或仅 EG 的 kernel URL）、`created_at`；可选 TTL 与 EG kernel 超时对齐。
- 若 EG 仅返回 kernel_id 与访问 URL，可简化为：`session:{session_id}` → `{ "kernel_id": "...", "connection_url": "...", "kernel_type": "..." }`。

**EG 侧依赖**

- 需确认实际使用的 EG 版本与 API（如 REST 创建 kernel、返回 connection 或 proxy URL）。
- 若无现成 REST，则通过 EG 的「kernel 列表 + connection 文件」或 Gateway 的 WebSocket/HTTP 代理到 kernel，由 FastAPI 通过该代理发 execute；具体以 EG 文档为准。

**虚拟环境（venv）**

- 当前本机通过 `python_path` 起 kernel；接入 EG 后，需通过 EG 的 kernel profile 或镜像/环境配置对应不同 Python 环境。
- 若 EG 暂不支持按「用户指定 python_path」起 kernel，可一期只支持 EG 预置的若干 profile（如 python3、py3-venv-a），venv 选择与 profile 映射在 config 中配置。

### 5.4 后端改造清单

| 模块/文件 | 改造内容 |
|-----------|----------|
| **config** | 增加 `ENTERPRISE_GATEWAY_URL`、`REDIS_URL`（或主机/端口/库号）、可选 `USE_EG=true` 开关。 |
| **kernel_service** | 抽象「Kernel 提供方」：本机实现（现有逻辑） vs EG 实现（调 EG API + Redis）。根据配置选择实现；EG 实现中 `create_session` 调 EG、写 Redis，`get_kernel_client` 从 Redis 取 connection 并构造/复用 KernelClient，`delete_session` 调 EG 删 kernel、删 Redis。 |
| **新模块 eg_client** | 封装调用 EG 的 HTTP 客户端：创建 kernel、删除 kernel、获取 connection 或 proxy URL；请求/响应与 EG API 对齐。 |
| **新模块 session_store** | 封装 Redis：session → kernel_id / connection_info 的读写、TTL 设置；可选按 kernel_id 反查 session。 |
| **routers/kernel** | 保持现有 API 形态；内部仅通过 kernel_service 使用，无需改路由签名；若 EG 实现中 get_kernel_client 行为变化（如每次从 Redis 重建连接），需保证执行路径仍能拿到合法 KernelClient。 |
| **依赖** | 增加 `httpx`（或 `aiohttp`）、`redis`（如 `redis` 或 `aioredis`），并在 requirements 中声明。 |

### 5.5 配置开关与回退

- 通过 `USE_EG=false`（或未配置）保持现有「本机 Kernel」行为。
- `USE_EG=true` 且配置好 EG、Redis 时，走 EG + Redis 路径；便于分阶段上线与回退。

---

## 6. 备选方案 B：自建 Kernel Pool 要点

### 6.1 思路

- 独立 **Pool 服务**（或脚本）：在若干台机/容器上预起或按需起 ipykernel，将每个 kernel 的 `connection_file` 内容（或连接参数）写入 Redis 的「空闲池」结构（如 list/set）。
- FastAPI **创建会话**：从 Redis 池中「弹出」一个空闲 kernel 的 connection，绑定到 `session_id` 写入 Redis（占用关系）。
- **执行**：与方案 A 相同，从 Redis 取 connection，用 jupyter_client 连接该 kernel 执行。
- **删除会话**：将 kernel connection 还回池（或标记可复用）；若策略为用完即毁，则终止进程并从池中移除。

### 6.2 与方案 A 的差异

- 无 EG：不调 EG API，改为「从池取 / 还回池」或「向 Pool 服务要一个 kernel」。
- Pool 服务需实现：起 kernel、写 connection 入 Redis、回收/销毁、可选健康检查与池大小策略。
- FastAPI 侧仍需要 **session_store**（Redis）与 **kernel_service** 的「远程 kernel」实现，仅「获取 kernel」的来源从 EG 换成 Pool。

---

## 7. 实施阶段建议

| 阶段 | 内容 |
|------|------|
| **1. 准备** | 确定方案（A 或 B）；若 A：部署 EG 并确认创建/删除 kernel 及 connection 的 API；若 B：设计并实现 Pool 服务与 Redis 池结构。部署 Redis，在 config 中增加 Redis/EG 相关配置。 |
| **2. 后端抽象** | 新增 session_store（Redis）、若 A 则新增 eg_client；在 kernel_service 中抽象「Kernel 提供方」接口，本机实现保留。 |
| **3. EG/Pool 实现** | 实现 kernel_service 的 EG 版（或 Pool 版）：create_session、get_kernel_client、delete_session 使用 Redis + EG（或 Pool）。 |
| **4. 联调与开关** | 通过配置开关切换本机/EG（或 Pool）；单实例联调创建会话、执行、删除会话；核对执行结果与现有行为一致。 |
| **5. 多实例与上线** | 多实例部署 FastAPI，验证会话在实例间共享；监控 Redis 与 EG（或 Pool）负载，按需调优 TTL、池大小或 EG 资源配置。 |

---

## 8. 附录：当前相关代码位置

- 会话与 Kernel 管理：`backend/services/kernel_service.py`（`create_session`、`get_kernel_client`、`delete_session`、内存 dict）。
- 会话 API：`backend/routers/kernel.py`（`POST /sessions`、`GET /sessions/{id}`、`DELETE /sessions/{id}`，以及 `POST /execute`、WebSocket 执行）。
- Kernel 配置：`backend/config.py` 中 `KERNEL_CONFIGS`。
- 虚拟环境 Python 路径：`backend/services/venv_service.py` 的 `get_venv_python`，在 `routers/kernel.py` 的 create_session 中传入 `python_path`。

以上为 Kernel 与后端解耦的完整设计方案，可按阶段落地实施；具体 EG API 与 Redis 键结构需与所选 EG 版本及运维约定对齐。
