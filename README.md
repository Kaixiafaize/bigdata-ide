# BigData IDE - 多引擎代码执行平台

一个支持 Spark、Flink、Python、SQL 多种计算引擎的在线代码编辑和执行平台。

## 🎯 MVP 功能（已实现）✅

### 后端功能
- ✅ FastAPI REST API
- ✅ 会话管理（创建、查询、删除）
- ✅ Python 代码执行引擎
- ✅ Spark/Flink 代码执行接口
- ✅ WebSocket 实时执行支持
- ✅ 完整错误处理

### 前端功能
- ✅ React + Vite 应用框架
- ✅ Monaco 编辑器集成
- ✅ 多引擎切换（Python/Spark/Flink/SQL）
- ✅ 实时代码编辑和执行
- ✅ 结果显示面板
- ✅ 响应式布局设计

### 测试覆盖
- ✅ 15+ 单元测试用例
- ✅ 会话管理测试
- ✅ 代码执行测试
- ✅ 所有测试 PASSED

---

## 🚀 快速开始

### 安装依赖

```bash
# 后端
cd backend && pip install fastapi uvicorn pydantic pytest httpx

# 前端
cd frontend && npm install
```

### 启动服务

**后端（端口8888）：**
```bash
cd backend
python -m uvicorn main:app --reload --port 8888 --host 0.0.0.0
```

**前端（端口3000）：**
```bash
cd frontend
npm run dev
```

**打开浏览器：** http://localhost:3000

---

## 📝 快速示例

在编辑器中输入 Python 代码：
```python
x = 5
y = 3
print(f"结果: {x + y}")
```

点击 Execute 或按 Ctrl+Enter，右侧输出：
```
结果: 8
```

---

## 🧪 运行测试

```bash
cd backend && python -m pytest tests/test_mvp.py -v
```

**结果：15 passed ✅**

---

## 📡 主要 API

| 方法 | 端点 | 描述 |
|-----|------|------|
| GET | `/health` | 健康检查 |
| POST | `/api/sessions?engine=python` | 创建会话 |
| POST | `/api/execute` | 执行代码 |
| WS | `/ws/sessions/{session_id}` | WebSocket 实时执行 |

---

## 📁 项目结构

```
bigdata-ide/
├── backend/
│   ├── main.py                    # FastAPI 主应用
│   ├── src/services/kernel_manager.py  # 内核管理器
│   ├── tests/test_mvp.py          # 单元测试（15个）
│   └── .env
├── frontend/
│   ├── src/App.jsx                # 主应用
│   ├── src/components/EnhancedMonacoEditor.jsx
│   ├── vite.config.js
│   ├── package.json
│   └── .env
└── README.md
```

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite |
| 编辑器 | Monaco Editor |
| HTTP 客户端 | Axios |
| 后端框架 | FastAPI + Uvicorn |
| 数据验证 | Pydantic |
| 测试 | Pytest |
| 计算引擎 | Python, Spark, Flink, SQL |

---

## 📊 开发进度

- [x] **Day 1-2**: Monaco 编辑器深度集成 + Kernel 网关基础架构
- [x] **Day 3-4**: 引擎切换 UI + Python 内核执行器
- [x] **Day 5-6**: 结果输出面板 + 会话管理
- [x] **Day 7**: 错误处理 + 样式优化
- [ ] **Day 8+**: Spark 完整集成、数据可视化、性能优化

---

## 💡 使用技巧

- **快捷键**: Ctrl+Enter 快速执行代码
- **引擎切换**: 左侧按钮切换执行引擎
- **会话管理**: 每个引擎独立会话，互不影响
- **错误查看**: 错误详情在右侧红色面板中

---

## 🔧 故障排除

| 问题 | 解决方案 |
|------|--------|
| 端口被占用 | 修改 main.py/vite.config.js 中的端口号 |
| 前端无法连接后端 | 检查 frontend/.env 中的 VITE_API_URL |
| 依赖安装失败 | 删除 node_modules 和 package-lock.json，重新 npm install |

---

**状态：MVP 完成 ✅**  
**最后更新：2025-12-02**
