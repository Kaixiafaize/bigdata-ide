# BigData IDE - 多语言多引擎代码执行平台

一个支持 **Python/SQL** 语言和 **无引擎/Spark/Flink** 三种执行引擎的在线代码编辑和执行平台。

## 🎯 MVP 功能（已实现）✅

### 核心功能（Phase 2 新增）
- ✅ **语言支持**: Python、SQL
- ✅ **执行引擎**: 无引擎（普通）、Spark、Flink
- ✅ **虚拟环境管理**: 3 个独立 Python 虚拟环境隔离
  - venv_python: 普通 Python（pandas/numpy/matplotlib）
  - venv_pyspark: PySpark 环境
  - venv_pyflink: PyFlink 环境
- ✅ **SQL 执行**: SQLite 实现，支持 SQL 语法
- ✅ **动态引擎选择**: 根据语言自动显示可用引擎

### 后端功能
- ✅ FastAPI REST API
- ✅ 会话管理（创建、查询、删除）
- ✅ 多语言代码执行引擎
- ✅ 虚拟环境创建和管理
- ✅ 完整错误处理和异常捕获
- ✅ 异步任务执行

### 前端功能
- ✅ React + Vite 应用框架
- ✅ Monaco 编辑器集成（支持 Python/SQL 语法高亮）
- ✅ 语言选择器（Python/SQL）
- ✅ 动态引擎选择器（根据语言显示可用引擎）
- ✅ 实时代码编辑和执行
- ✅ 结果显示面板
- ✅ 响应式布局设计

### 测试覆盖
- ✅ 15+ 后端单元测试
- ✅ 6 种语言-引擎组合功能测试（全部通过）
- ✅ API 端点集成测试
- ✅ 虚拟环境创建测试

---

## 🚀 快速开始

### 方式 1: 一键启动

```bash
cd /workspaces/bigdata-ide
./start.sh
```

打开浏览器访问: `http://localhost:3000`

### 方式 2: 手动启动

**后端（端口8888）：**
```bash
cd backend
pip install fastapi uvicorn pydantic pytest httpx
python -m uvicorn main:app --reload --port 8888 --host 0.0.0.0
```

**前端（端口3000）：**
```bash
cd frontend
npm install
npm run dev
```

### 停止服务

```bash
./stop.sh
```
---

## 📝 使用示例

### 例 1: 普通 Python（数据分析）

语言: **Python** | 引擎: **无引擎**

```python
import pandas as pd
import numpy as np

# 创建示例数据
data = {
    'name': ['Alice', 'Bob', 'Charlie'],
    'age': [25, 30, 35],
    'salary': [50000, 60000, 70000]
}

df = pd.DataFrame(data)
print(df.mean())
```

### 例 2: PySpark（分布式处理）

语言: **Python** | 引擎: **Spark**

```python
# PySpark 代码示例
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("example").getOrCreate()
df = spark.createDataFrame([(1, 'a'), (2, 'b')], ['id', 'value'])
df.show()
```

### 例 3: SQL 查询

语言: **SQL** | 引擎: **无引擎**

```sql
SELECT name, age 
FROM (
    SELECT 'Alice' as name, 25 as age
    UNION ALL
    SELECT 'Bob', 30
) 
WHERE age > 25;
```

---

## 🧪 运行测试

**运行所有测试：**
```bash
cd backend && python -m pytest tests/test_mvp.py -v
```

**运行函数测试脚本：**
```bash
bash test_all_combinations.sh
```

测试结果：✅ **6/6 通过**

---

## 📡 API 文档

### 1. 创建会话

```bash
POST /api/sessions?language=python&engine=spark

# 响应
{
  "session_id": "uuid",
  "language": "python",
  "engine": "spark",
  "kernel_id": "kernel-uuid"
}
```

### 2. 执行代码

```bash
POST /api/execute

# 请求体
{
  "language": "python",
  "engine": null,
  "code": "print('Hello')",
  "session_id": "optional-uuid"
}

# 响应
{
  "status": "ok",
  "output": "Hello",
  "errors": "",
  "execution_id": "exec-uuid"
}
```

### 3. 获取会话信息

```bash
GET /api/sessions/{session_id}

# 响应
{
  "session_id": "uuid",
  "language": "python",
  "engine": null,
  "kernel_id": "kernel-uuid",
  "status": "active"
}
```

| 方法 | 端点 | 描述 |
|-----|------|------|
| GET | `/health` | 健康检查 |
| POST | `/api/sessions` | 创建会话 |
| GET | `/api/sessions/{id}` | 获取会话 |
| DELETE | `/api/sessions/{id}` | 删除会话 |
| POST | `/api/execute` | 执行代码 |
| WS | `/ws/sessions/{id}` | WebSocket 实时执行 |

---

## 📁 项目结构

```
bigdata-ide/
├── backend/
│   ├── main.py                           # FastAPI 主应用
│   ├── src/services/
│   │   ├── kernel_manager.py             # 内核管理器
│   │   └── venv_manager.py               # 虚拟环境管理器
│   ├── tests/
│   │   └── test_mvp.py                   # 15+ 单元测试
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx                       # 主应用（语言+引擎选择）
│   │   ├── App.css                       # 样式
│   │   ├── components/
│   │   │   └── EnhancedMonacoEditor.jsx  # 编辑器组件
│   │   └── main.jsx
│   ├── vite.config.js                    # Vite 配置
│   ├── package.json
│   └── index.html
├── scripts/
│   └── test_frontend_request.js
├── start.sh                              # 一键启动脚本
├── stop.sh                               # 一键停止脚本
├── ARCHITECTURE.md                       # 架构文档
└── README.md                             # 本文件
```

---

## 🛠️ 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| **前端框架** | React + Vite | 18 + 4.5 |
| **代码编辑器** | Monaco Editor | 最新 |
| **HTTP 客户端** | Axios | 最新 |
| **样式** | CSS3 | - |
| **后端框架** | FastAPI + Uvicorn | - |
| **数据验证** | Pydantic | v2 |
| **Python 版本** | Python | 3.12 |
| **计算引擎** | Spark, Flink, SQL | 最新 |

---

## 🔮 Road Map

### Phase 3: 可视化与流处理
- [ ] Matplotlib/Plotly 集成
- [ ] Spark 集群支持
- [ ] Flink 流处理支持
- [ ] 实时数据流展示

### Phase 4: 协作与分享
- [ ] 代码版本控制
- [ ] 多用户协作编辑
- [ ] 代码共享和分享链接
- [ ] Jupyter Notebook 导入/导出

### Phase 5: 企业功能
- [ ] 权限管理和 SSO
- [ ] 审计日志
- [ ] 性能监控
- [ ] Docker/Kubernetes 部署

---

## 💡 使用技巧

- **快捷键**: Ctrl+Enter 快速执行代码
- **语言切换**: 点击左侧语言按钮自动重置引擎
- **引擎选择**: 根据语言自动显示可用引擎
- **会话管理**: 不同语言/引擎组合创建独立会话
- **错误调试**: 检查浏览器 Console 查看详细错误信息

---

## 🐛 故障排除

| 问题 | 原因 | 解决方案 |
|------|------|--------|
| 端口被占用 | 其他进程占用 | 修改 start.sh 中的端口号 |
| 前端连接失败 | 后端未启动或端口错误 | 检查后端是否运行在 8888 |
| 虚拟环境创建失败 | 权限问题或磁盘空间不足 | 删除 `/tmp/bigdata-ide-venvs` 重试 |
| 代码执行超时 | 代码运行时间过长 | 增加 kernel_manager.py 中的超时时间 |
| 依赖冲突 | Node/Python 版本不兼容 | 清理并重新安装依赖 |

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发工作流
1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📞 支持

遇到问题？
- 查看 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解系统架构
- 查看 [CHECKLIST.md](./CHECKLIST.md) 了解功能检查清单
- 查看后端日志（startup.log）排查问题

---

## 📄 许可证

MIT License

---

## 👨‍💻 作者

Kaixiafaize

---

**状态**: ✅ **MVP 完成** - 所有核心功能已实现并测试通过  
**版本**: 0.2.0 (多语言多引擎支持)  
**最后更新**: 2025-12-02

🎉 **感谢使用 BigData IDE！**
