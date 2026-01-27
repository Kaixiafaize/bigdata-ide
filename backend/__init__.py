"""
BigData IDE Backend Package

基于 FastAPI 和 Jupyter Client 的多 Kernel IDE 后端服务
支持 Python、PySpark、PostgreSQL、StarRocks 等多种内核
支持 MinIO 文件管理
"""

__version__ = "0.1.0"
__author__ = "BigData IDE Team"

# 导出主要模块
from . import config
from . import models
from . import services
from . import routers

__all__ = [
    "config",
    "models",
    "services",
    "routers",
]
