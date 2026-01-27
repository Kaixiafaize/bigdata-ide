"""
路由包

包含所有 API 路由模块
"""

from . import kernel
from . import files
from . import editor
from . import database
from . import history

__all__ = [
    "kernel",
    "files",
    "editor",
    "database",
    "history",
]
