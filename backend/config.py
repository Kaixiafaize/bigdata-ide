"""
配置管理模块
"""
import os
import logging

logger = logging.getLogger(__name__)

# MinIO 配置
MINIO_ENDPOINT = os.getenv('MINIO_ENDPOINT', 'localhost:9000')
MINIO_ACCESS_KEY = os.getenv('MINIO_ACCESS_KEY', 'minioadmin')
MINIO_SECRET_KEY = os.getenv('MINIO_SECRET_KEY', 'minioadmin')
MINIO_SECURE = os.getenv('MINIO_SECURE', 'false').lower() == 'true'
MINIO_BUCKET = os.getenv('MINIO_BUCKET', 'bigdata-ide')

# 虚拟环境：本地缓存目录（创建/解压 venv 的目录）
_script_dir = os.path.dirname(os.path.abspath(__file__))
VENV_BASE_DIR = os.getenv('VENV_BASE_DIR', os.path.normpath(os.path.join(_script_dir, '..', '.venvs')))
# 是否将虚拟环境持久化到 MinIO（True 时创建后上传、使用时按需下载到本地缓存）
VENV_USE_MINIO = os.getenv('VENV_USE_MINIO', 'true').lower() == 'true'
# MinIO 中 venv 归档对象前缀，单对象名为 {VENV_MINIO_PREFIX}{venv_id}.tar.gz
VENV_MINIO_PREFIX = os.getenv('VENV_MINIO_PREFIX', 'venvs/')

# Kernel 配置映射
KERNEL_CONFIGS = {
    'python': {
        'name': 'python3',
        'display_name': 'Python 3',
        'language': 'python',
    },
    'pyspark': {
        'name': 'pyspark3',
        'display_name': 'PySpark',
        'language': 'python',
        'fallback': 'python3',
    },
    'postgres': {
        'name': 'python3',  # 使用 python3 kernel
        'display_name': 'PostgreSQL',
        'language': 'sql',
        'use_ipython_sql': True,  # 使用 ipython-sql
        'connection_string': 'postgresql://',  # 默认连接字符串，用户可以在代码中修改
    },
    'starrocks': {
        'name': 'python3',  # 使用 python3 kernel
        'display_name': 'StarRocks',
        'language': 'sql',
        'use_ipython_sql': True,  # 使用 ipython-sql
        'connection_string': 'mysql+pymysql://',  # StarRocks 兼容 MySQL 协议
    },
}
