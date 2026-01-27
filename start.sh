#!/bin/bash

# BigData IDE 启动脚本

echo "🚀 BigData IDE - 多引擎代码执行平台"
echo "=================================="
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 清理旧进程和端口
echo "🧹 清理旧进程..."
pkill -f "node.*vite" 2>/dev/null || true
pkill -f "python.*uvicorn.*main:app" 2>/dev/null || true
pkill -f "python.*-m uvicorn.*main:app" 2>/dev/null || true
# 强制释放端口
if command -v fuser >/dev/null 2>&1; then
    fuser -k 3000/tcp 2>/dev/null || true
    fuser -k 8888/tcp 2>/dev/null || true
fi
if command -v lsof >/dev/null 2>&1; then
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    lsof -ti:8888 | xargs kill -9 2>/dev/null || true
fi
sleep 1
echo "✅ 旧进程已清理"
echo ""

# 检查 Python
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ 错误: 未找到 Python 3"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    exit 1
fi

echo "✅ Python 已安装 ($PYTHON_CMD)"
echo "✅ Node.js 已安装 ($(node --version))"
echo ""

# 检查并创建 .env 文件
if [ ! -f "backend/.env" ]; then
    echo "📝 创建 backend/.env 文件..."
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example backend/.env
        echo "✅ 已从 .env.example 创建 .env 文件"
    else
        echo "⚠️  警告: backend/.env.example 不存在，请手动创建 backend/.env"
    fi
    echo ""
fi

# 安装后端依赖
echo "📦 安装后端依赖..."
cd backend
if [ -f "requirements.txt" ]; then
    $PYTHON_CMD -m pip install -q --upgrade pip 2>/dev/null || true
    $PYTHON_CMD -m pip install -q -r requirements.txt || {
        echo "⚠️  警告: 部分依赖安装失败，尝试安装核心依赖..."
        $PYTHON_CMD -m pip install -q fastapi uvicorn[standard] jupyter-client jupyter-core ipykernel pydantic python-multipart ipython-sql sqlalchemy psycopg2-binary pymysql minio || {
            echo "❌ 错误: 依赖安装失败"
            exit 1
        }
    }
else
    echo "⚠️  警告: requirements.txt 不存在，安装核心依赖..."
    $PYTHON_CMD -m pip install -q fastapi uvicorn[standard] jupyter-client jupyter-core ipykernel pydantic python-multipart ipython-sql sqlalchemy psycopg2-binary pymysql minio || {
        echo "❌ 错误: 依赖安装失败"
        exit 1
    }
fi
echo "✅ 后端依赖已安装"
echo ""

# 启动 FastAPI 后端
echo "📦 启动 FastAPI 后端服务器..."
# 从 backend 目录运行，确保导入路径正确
$PYTHON_CMD -m uvicorn main:app --reload --port 8888 --host 0.0.0.0 > /tmp/bigdata-ide-backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ FastAPI 后端已启动 (PID: $BACKEND_PID)"
echo "   API: http://localhost:8888"
echo "   文档: http://localhost:8888/docs"
echo "   日志: /tmp/bigdata-ide-backend.log"
echo ""

# 等待后端启动
echo "⏳ 等待后端服务启动..."
for i in {1..10}; do
    if curl -s http://localhost:8888/docs > /dev/null 2>&1; then
        echo "✅ 后端服务已就绪"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "⚠️  警告: 后端服务可能未完全启动，请检查日志"
    fi
    sleep 1
done
echo ""

# 启动前端
echo "🎨 启动前端开发服务器..."
cd ../frontend
if [ -f "package.json" ]; then
    npm install -q 2>/dev/null || {
        echo "⚠️  警告: npm install 失败，尝试继续..."
    }
    npm run dev > /tmp/bigdata-ide-frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo "✅ 前端已启动 (PID: $FRONTEND_PID)"
    echo "   App: http://localhost:3000"
    echo "   日志: /tmp/bigdata-ide-frontend.log"
else
    echo "❌ 错误: frontend/package.json 不存在"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi
echo ""

echo "=================================="
echo "🎉 所有服务已启动！"
echo ""
echo "📝 提示:"
echo "  - 在浏览器中打开: http://localhost:3000"
echo "  - 快捷键: Ctrl+Enter 执行代码"
echo "  - API 文档: http://localhost:8888/docs"
echo "  - 后端日志: tail -f /tmp/bigdata-ide-backend.log"
echo "  - 前端日志: tail -f /tmp/bigdata-ide-frontend.log"
echo ""
echo "⏹️  要停止服务，运行: ./stop.sh 或按 Ctrl+C"
echo ""

# 等待中断
trap "echo ''; echo '🛑 正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true; exit 0" INT TERM
wait
