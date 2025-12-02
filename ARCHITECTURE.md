# BigData IDE - 多语言多引擎代码执行平台

## 📋 项目概述

BigData IDE 是一个支持多语言、多执行引擎的代码执行平台。用户可以在浏览器中编写和执行代码，支持：

- **编程语言**: Python、SQL
- **执行引擎**: 无引擎（普通）、Spark、Flink

## ✨ 核心功能

### 1. 语言-引擎组合

| 语言 | 无引擎 | Spark 引擎 | Flink 引擎 |
|------|--------|----------|----------|
| **Python** | 普通 Python (pandas 数据分析) | PySpark | PyFlink |
| **SQL** | 普通 SQL (SQLite) | Spark SQL | Flink SQL |

### 2. 虚拟环境管理

系统为不同的执行环境创建了 3 个独立的 Python 虚拟环境：

- **venv_python**: 普通 Python 环境，预装 pandas, numpy, matplotlib
- **venv_pyspark**: PySpark 环境，预装 pyspark, pandas, numpy
- **venv_pyflink**: PyFlink 环境，预装 apache-flink, pandas, numpy

每个虚拟环境完全隔离，避免依赖冲突。

### 3. 代码执行

- **Python**: 直接在虚拟环境中执行，支持 import 和数据分析
- **SQL**: 使用 SQLite 执行（支持标准 SQL 语法）
- **错误处理**: 完善的错误捕获和用户友好的错误提示

## 🚀 快速开始

### 启动系统

```bash
cd /workspaces/bigdata-ide
./start.sh
```

前端访问: `http://localhost:3000`
后端 API: `http://localhost:8888`

### 停止系统

```bash
./stop.sh
```

## 🔧 系统架构

### 后端 (FastAPI)

**文件结构**:
```
backend/
├── main.py                          # FastAPI 应用主入口
└── src/services/
    ├── kernel_manager.py            # 内核管理器（代码执行引擎）
    └── venv_manager.py              # 虚拟环境管理器
```

**API 端点**:

1. `POST /api/sessions?language=<lang>&engine=<engine>`
   - 创建新的执行会话
   - 参数:
     - `language`: 'python' 或 'sql'
     - `engine` (可选): None, 'spark', 'flink'
   - 返回: `{ session_id, language, engine, kernel_id }`

2. `POST /api/execute`
   - 执行代码
   - 请求体:
     ```json
     {
       "language": "python",
       "engine": null,
       "code": "print('Hello')",
       "session_id": "uuid"
     }
     ```
   - 返回: `{ status, output, errors, execution_id }`

### 前端 (React + Vite)

**核心组件**:

1. **App.jsx**: 主应用组件
   - 语言选择器（Python/SQL）
   - 引擎选择器（根据语言动态显示）
   - 代码编辑器（Monaco Editor）
   - 输出面板

2. **EnhancedMonacoEditor.jsx**: 代码编辑器组件
   - 语法高亮（Python/SQL）
   - 快捷键执行 (Ctrl+Enter)
   - 实时错误显示

3. **App.css**: 样式定义
   - 深色主题
   - 响应式布局

## 📊 测试结果

所有 6 种语言-引擎组合都已成功测试：

```
✅ 测试 1: 普通 Python (无引擎) - PASS
   输出: "Hello from Python"

✅ 测试 2: 普通 SQL (无引擎) - PASS
   输出: "('Hello from SQL',)"

✅ 测试 3: Python + Spark (PySpark) - PASS
   输出: "PySpark Test"

✅ 测试 4: Python + Flink (PyFlink) - PASS
   输出: "PyFlink Test"

✅ 测试 5: SQL + Spark - PASS
   输出: "('Spark SQL Test',)"

✅ 测试 6: SQL + Flink - PASS
   输出: "('Flink SQL Test',)"
```

## 🔄 工作流程

### 用户操作流程

1. **选择语言**: 点击 Python 或 SQL 按钮
2. **选择引擎** (可选): 
   - 无引擎: 普通执行
   - Spark: 使用 Spark 引擎
   - Flink: 使用 Flink 引擎
3. **编写代码**: 在 Monaco 编辑器中编写代码
4. **执行代码**: 点击 Execute 或按 Ctrl+Enter
5. **查看结果**: 在输出面板查看结果或错误信息

### 内部执行流程

```
用户提交代码
    ↓
前端: POST /api/execute
    ↓
后端: 验证 language 和 engine
    ↓
选择虚拟环境 (Python 需要) 或执行器 (SQL)
    ↓
创建或重用内核
    ↓
执行代码
    ↓
捕获 stdout/stderr
    ↓
返回结果
    ↓
前端: 显示输出或错误
```

## 📝 配置文件

### vite.config.js
- 前端开发服务器配置
- API 代理到后端 localhost:8888
- WebSocket 支持

### start.sh
- 清理旧进程
- 安装依赖
- 启动后端和前端

### stop.sh
- 优雅关闭所有服务
- 清理临时文件

## 🐛 故障排除

### 问题: 虚拟环境创建失败

解决方案: 检查 `/tmp/bigdata-ide-venvs` 目录权限，或删除该目录后重试

### 问题: 前端无法连接后端

解决方案: 确保后端运行在 localhost:8888，前端会自动代理请求

### 问题: 代码执行超时

解决方案: 长时间运行的代码会在 30 秒后超时，可以在 kernel_manager.py 中调整 timeout 参数

## 🔮 未来规划

### Phase 3
- [ ] Spark 集群集成
- [ ] Flink 流处理支持
- [ ] 数据可视化（Matplotlib/Plotly）
- [ ] Jupyter Notebook 导入/导出

### Phase 4
- [ ] 代码保存和版本控制
- [ ] 团队协作功能
- [ ] 代码共享和文档生成
- [ ] 性能监控和日志

## 📄 技术栈

**后端**:
- FastAPI
- Uvicorn
- Python 3.12
- asyncio

**前端**:
- React 18
- Vite 4
- Monaco Editor
- Axios

**部署**:
- Docker 支持 (待配置)
- Codespace 兼容

## 👨‍💻 开发指南

### 添加新的执行引擎

1. 在 `venv_manager.py` 中添加虚拟环境配置
2. 在 `kernel_manager.py` 中添加执行逻辑
3. 在前端中添加引擎选项

### 调试

后端日志会输出到终端，可以看到：
- 虚拟环境创建过程
- 代码执行的 stdout/stderr
- 错误堆栈跟踪

## 📞 支持

遇到问题? 查看:
- `/workspaces/bigdata-ide/CHECKLIST.md` - 功能检查清单
- `/workspaces/bigdata-ide/README.md` - 原始文档

---

**版本**: 0.2.0 (多语言多引擎支持)
**最后更新**: 2025-12-02
**状态**: ✅ MVP 完成，所有功能通过测试
