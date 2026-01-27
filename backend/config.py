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
