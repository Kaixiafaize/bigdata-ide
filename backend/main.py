"""
BigData IDE - 应用入口
基于 FastAPI 和 Jupyter Client 的多 Kernel IDE 后端服务
支持 Python、PySpark、PostgreSQL、StarRocks 等多种内核
支持 MinIO 文件管理
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import kernel, files, editor, database, history
from services.kernel_service import kernel_service

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时执行
    logger.info("BigData IDE 服务启动")
    yield
    # 关闭时执行
    logger.info("BigData IDE 服务关闭，正在清理所有 kernel...")
    await kernel_service.shutdown_all()
    logger.info("所有 kernel 已关闭")


# 创建 FastAPI 应用
app = FastAPI(title="BigData IDE API", lifespan=lifespan)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(kernel.router)
app.include_router(files.router)
app.include_router(editor.router)
app.include_router(database.router)
app.include_router(history.router)


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8888)
