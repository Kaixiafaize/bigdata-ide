# BigData IDE 手动启动指南

本文档说明如何手动启动 BigData IDE 项目，而不是使用 `start.sh` 脚本。

## 前置要求

- Python 3.8+ (推荐 Python 3.10+)
- Node.js 16+ (推荐 Node.js 18+)
- pip (Python 包管理器)
- npm (Node.js 包管理器)

## 步骤 1: 配置环境变量

### 1.1 创建后端环境变量文件

在 `backend` 目录下创建 `.env` 文件：

```bash
cd backend
cp .env.example .env
```

### 1.2 编辑 `.env` 文件

根据你的 MinIO 配置修改 `backend/.env`：

```env
# MinIO 配置
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_SECURE=false
MINIO_BUCKET=bigdata-ide
```

**注意**: 如果 MinIO 未运行，文件管理功能将不可用，但代码执行功能仍然可用。

## 步骤 2: 安装后端依赖

### 2.1 进入后端目录

```bash
cd backend
```

### 2.2 安装 Python 依赖

```bash
# 使用 pip
pip install -r requirements.txt

# 或使用 pip3
pip3 install -r requirements.txt

# 或使用虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### 2.3 验证安装

```bash
python -m uvicorn --version
```

## 步骤 3: 启动后端服务

### 3.1 在 backend 目录下启动

```bash
# 开发模式（自动重载）
python -m uvicorn main:app --reload --port 8888 --host 0.0.0.0

# 或生产模式
python -m uvicorn main:app --port 8888 --host 0.0.0.0
```

### 3.2 验证后端启动

打开浏览器访问：
- API 文档: http://localhost:8888/docs
- 健康检查: http://localhost:8888/api/bigdata-ide/kernel-types

## 步骤 4: 安装前端依赖

### 4.1 打开新的终端窗口

保持后端服务运行，打开新的终端窗口。

### 4.2 进入前端目录

```bash
cd frontend
```

### 4.3 安装 Node.js 依赖

```bash
npm install
```

## 步骤 5: 启动前端服务

### 5.1 启动开发服务器

```bash
npm run dev
```

### 5.2 验证前端启动

前端服务通常会在 http://localhost:3000 启动。

打开浏览器访问: http://localhost:3000

## 完整启动命令示例

### 终端 1 - 后端服务

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或 venv\Scripts\activate  # Windows
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8888 --host 0.0.0.0
```

### 终端 2 - 前端服务

```bash
cd frontend
npm install
npm run dev
```

## 常见问题

### 1. 端口被占用

如果 8888 或 3000 端口被占用：

**后端端口冲突：**
```bash
# 使用其他端口
python -m uvicorn main:app --reload --port 8889 --host 0.0.0.0
```

然后修改 `frontend/vite.config.js` 中的代理配置。

**前端端口冲突：**
```bash
# Vite 会自动尝试下一个可用端口
# 或手动指定
npm run dev -- --port 3001
```

### 2. Python 模块导入错误

确保在 `backend` 目录下运行 uvicorn：

```bash
cd backend
python -m uvicorn main:app --reload
```

### 3. MinIO 连接失败

如果 MinIO 未运行，会看到警告日志，但代码执行功能仍然可用。文件管理功能将不可用。

启动 MinIO（如果已安装）：
```bash
# Docker 方式
docker run -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"
```

### 4. 前端无法连接后端

检查 `frontend/vite.config.js` 中的代理配置：

```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8888',
      changeOrigin: true,
    },
  },
}
```

### 5. Kernel 不可用

确保已安装相应的 kernel：

```bash
# 安装 Python kernel
python -m ipykernel install --user --name python3 --display-name "Python 3"

# 安装 PySpark kernel（如果使用）
# 需要先安装 PySpark
pip install pyspark
python -m ipykernel install --user --name pyspark3 --display-name "PySpark"
```

## 停止服务

### 停止后端

在运行后端的终端按 `Ctrl+C`

### 停止前端

在运行前端的终端按 `Ctrl+C`

### 强制停止（如果 Ctrl+C 无效）

```bash
# 查找进程
lsof -ti:8888  # 后端
lsof -ti:3000  # 前端

# 或使用
ps aux | grep uvicorn
ps aux | grep vite

# 终止进程
kill -9 <PID>
```

## 生产环境部署

### 后端生产模式

```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8888 --workers 4
```

### 前端生产构建

```bash
cd frontend
npm run build
# 构建产物在 dist/ 目录
```

使用 Nginx 或其他 Web 服务器提供静态文件服务。

## 开发模式 vs 生产模式

### 开发模式特点

- **后端**: `--reload` 参数启用自动重载
- **前端**: Vite 热模块替换 (HMR)
- **日志**: 详细的控制台输出

### 生产模式特点

- **后端**: 多进程 workers，无自动重载
- **前端**: 优化的静态文件
- **日志**: 可配置的日志级别

## 下一步

- 查看 API 文档: http://localhost:8888/docs
- 查看项目 README 了解更多功能
- 配置 MinIO 以启用文件管理功能
