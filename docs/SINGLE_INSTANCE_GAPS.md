# 单实例当前功能缺口

本文档列出在**不扩容、单实例**前提下，当前系统仍缺少或未闭环的功能，便于按优先级补齐。

---

## 1. 权限授权 API（permission_grants）

**现状**  
- 已有 `permission_grants` 表与 `permission_store`（`set_grant`、`get_grant`、`delete_grant`），鉴权时已使用（owner → 查 grants → 再 fallback 到 file_permissions）。  
- **缺少**：HTTP API 让资源 owner「给指定用户授权/撤销授权」。

**建议**  
- 新增例如：  
  - `POST /files/permissions/grants`：body `{ path, username, read, write, delete }`，仅 path 的 owner 可调，内部调 `permission_store.set_grant`。  
  - `DELETE /files/permissions/grants`：query `path` + `username`，撤销某用户对该 path 的授权。  
  - 可选：`GET /files/permissions/grants?path=xxx`：列出该 path 下所有被授权用户（仅 owner 可查）。  
- 前端：在文件/目录「权限」弹窗中增加「授权用户」列表与「添加/删除授权」操作。

---

## 2. 数据库连接：鉴权 + 持久化

**现状**  
- `routers/database.py` 使用内存 dict `_db_connections` 存储连接；注释已注明「实际应用中应该使用数据库」。  
- 无登录校验：未登录也可 list/create/delete 连接。  
- 重启后连接信息丢失；密码明文在内存中。

**建议**  
- **鉴权**：所有 database 相关接口加 `Depends(get_current_user_required)`，连接按 `username` 隔离（只可见、可操作自己的连接）。  
- **持久化**：在 `data/service.db` 中新增表（如 `database_connections`：id, username, name, type, host, port, database, username_conn, password_encrypted, created_at），密码需加密后存（如用 AUTH_SECRET 或专用 key 做对称加密）。  
- 启动时从 DB 加载到内存或按需查库；创建/更新/删除时写回 DB。

---

## 3. Kernel / 终端 鉴权（可选）

**现状**  
- `POST /sessions`、`POST /execute`、WebSocket 执行、终端 WebSocket 均未强制登录。  
- 前端在未登录时不会进入主界面，故实际请求通常带 token；但 API 层未校验，存在未鉴权即可执行代码/开终端的风险。

**建议**  
- 若希望「必须登录才能执行代码、开终端」：在 `routers/kernel.py` 的 create_session、execute、WebSocket 入口以及 `routers/terminal.py` 的 WebSocket 入口增加 `Depends(get_current_user_required)`（或至少 `get_current_user`，未登录返回 401）。  
- WebSocket 需从 query/cookie 或首帧消息中解析 token 并校验用户。

---

## 4. 虚拟环境 list/delete 鉴权（可选）

**现状**  
- 仅 `POST /envs`（创建）需要登录；`GET /envs`、`GET /envs/{id}`、`DELETE /envs/{id}` 未鉴权。  
- 若希望「仅登录用户可查看/删除环境」或「仅创建者可删除」：需为 list/get/delete 加鉴权，并在 delete 时校验 `created_by == current_user`（若要做「仅创建者可删」）。

---

## 5. 其他可选项

- **连接密码**：数据库连接密码若落库，必须加密存储（见第 2 点）。  
- **审计日志**：关键操作（如删文件、改权限、删用户）记一条审计日志（表或文件），便于追溯。  
- **限流**：对登录、执行、创建会话等接口做简单限流，防止滥用。  
- **前端**：权限管理页（用户列表、禁用/启用）、授权管理弹窗（permission_grants 的增删）若尚未做，可视为单实例功能缺口的一部分。

---

## 汇总表

| 项目 | 优先级建议 | 说明 |
|------|------------|------|
| 权限授权 API（grants 增删查） | 高 | 表与逻辑已有，只差 API 与前端 |
| 数据库连接鉴权 + 持久化 | 高 | 安全与体验必备 |
| Kernel/终端鉴权 | 中 | 与「必须登录才能用 IDE」一致 |
| 虚拟环境 list/delete 鉴权 | 低 | 视是否多租户/敏感而定 |
| 审计 / 限流 / 密码加密 | 低 | 按合规与规模再补 |

以上为单实例下建议补齐的功能清单；多实例/扩容仍参见 `KERNEL_SCALING_DESIGN.md`。
