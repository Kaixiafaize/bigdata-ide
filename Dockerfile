# BigData IDE - 多阶段构建：前端构建 + 后端运行（Linux 容器内终端 PTY 可用）
# 使用方式: docker build -t bigdata-ide . && docker run -p 8888:8888 bigdata-ide

# ========== 阶段 1: 构建前端 ==========
FROM node:20-slim AS frontend-build

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --omit=optional || npm install

COPY frontend/ ./
RUN npm run build

# ========== 阶段 2: 后端 + 静态前端 ==========
FROM python:3.11-slim

# 安装 bash（终端 PTY 需要）、curl（健康检查）
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 后端依赖与代码
COPY backend/ ./
RUN pip install --no-cache-dir -r requirements.txt

# 前端构建产物（覆盖 /app/static，由 main.py 提供静态服务）
COPY --from=frontend-build /build/dist ./static

EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -sf http://localhost:8888/api/bigdata-ide/kernel-types > /dev/null || exit 1

# 单端口：API 在 /api，前端在 /
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8888"]
