#!/usr/bin/env bash
# stop.sh - 停止 BigData IDE 的前后端开发服务并清理临时内核目录
# 用法: ./stop.sh

set -euo pipefail

echo "Stopping BigData IDE services..."

# 函数：优雅停止并在需要时强制终止
terminate() {
  local pid=$1
  local name=$2
  if [ -z "$pid" ] || [ "$pid" = "" ]; then
    return
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "  [$name] PID $pid 不存在，跳过"
    return
  fi
  echo "  停止 [$name] (PID $pid) -> SIGTERM"
  kill -15 "$pid" 2>/dev/null || true
  sleep 2
  if kill -0 "$pid" 2>/dev/null; then
    echo "  [$name] PID $pid 未退出，发送 SIGKILL"
    kill -9 "$pid" 2>/dev/null || true
  else
    echo "  [$name] 已停止"
  fi
}

# 1) 尝试通过 pgrep/pkill 定位常见进程
# 后端 (uvicorn)
uvicorn_pids=$(pgrep -f "uvicorn main:app" || true)
if [ -n "$uvicorn_pids" ]; then
  for p in $uvicorn_pids; do
    terminate $p "uvicorn"
  done
else
  echo "  未检测到 uvicorn 进程"
fi

# 也尝试 python -m uvicorn
uvicorn_py_pids=$(pgrep -f "python.*-m uvicorn main:app" || true)
if [ -n "$uvicorn_py_pids" ]; then
  for p in $uvicorn_py_pids; do
    terminate $p "python -m uvicorn"
  done
fi

# 前端 (vite / npm run dev)
vite_pids=$(pgrep -f "vite" || true)
if [ -n "$vite_pids" ]; then
  for p in $vite_pids; do
    terminate $p "vite"
  done
else
  echo "  未检测到 vite 进程"
fi

npm_dev_pids=$(pgrep -f "npm run dev" || true)
if [ -n "$npm_dev_pids" ]; then
  for p in $npm_dev_pids; do
    terminate $p "npm run dev"
  done
fi

# 如果有使用 node 运行 dev server 的残留进程，也尝试匹配 frontend 目录下的 node 进程
frontend_dir="$PWD/frontend"
node_pids=$(pgrep -a node | awk '{print $1 " " substr($0, index($0,$2))}' | grep "$frontend_dir" | awk '{print $1}' || true)
if [ -n "$node_pids" ]; then
  for p in $node_pids; do
    terminate $p "node (frontend)"
  done
fi

# 2) 强制关闭占用端口（可选）
# 关闭 8888（后端）和 3000（前端）监听的进程
if command -v lsof >/dev/null 2>&1; then
  for port in 8888 3000; do
    listeners=$(lsof -t -i :$port || true)
    if [ -n "$listeners" ]; then
      echo "  端口 $port 被进程占用: $listeners，尝试终止"
      for pid in $listeners; do
        terminate $pid "port-$port"
      done
    fi
  done
fi

# 3) 清理临时内核目录（如果存在）
if [ -d "/tmp/kernels" ]; then
  echo "  清理 /tmp/kernels 下的内核目录"
  rm -rf /tmp/kernels || true
else
  echo "  /tmp/kernels 不存在，跳过"
fi

# 4) 清理可能的后台作业
if jobs -p >/dev/null 2>&1; then
  echo "  检查并停止当前 shell 的后台作业"
  for job in $(jobs -p); do
    terminate $job "job"
  done
fi

echo "All done. BigData IDE services stopped."
exit 0
