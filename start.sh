#!/bin/bash

# BigData IDE 启动脚本

echo "🚀 BigData IDE - 多引擎代码执行平台"
echo "=================================="
echo ""

# 检查 Python
if ! command -v python &> /dev/null; then
    echo "❌ 错误: 未找到 Python 3"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    exit 1
fi

echo "✅ Python 已安装"
echo "✅ Node.js 已安装"
echo ""

# 启动后端
echo "📦 启动后端服务器..."
cd backend
pip install -q fastapi uvicorn pydantic pytest httpx 2>/dev/null
python -m uvicorn main:app --reload --port 8888 --host 0.0.0.0 &
BACKEND_PID=$!
echo "✅ 后端已启动 (PID: $BACKEND_PID)"
echo "   API: http://localhost:8888"
echo "   文档: http://localhost:8888/docs"
echo ""

# 等待后端启动
sleep 2

# 启动前端
echo "🎨 启动前端开发服务器..."
cd ../frontend
npm install -q 2>/dev/null
npm run dev &
FRONTEND_PID=$!
echo "✅ 前端已启动 (PID: $FRONTEND_PID)"
echo "   App: http://localhost:3000"
echo ""

echo "=================================="
echo "🎉 所有服务已启动！"
echo ""
echo "📝 提示:"
echo "  - 在浏览器中打开: http://localhost:3000"
echo "  - 快捷键: Ctrl+Enter 执行代码"
echo "  - 查看 README.md 了解更多信息"
echo ""
echo "⏹️  要停止服务，按 Ctrl+C"
echo ""

# 等待中断
wait
