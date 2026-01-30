"""
业务库统一入口：data/service.db
表：users、file_permissions、permission_grants、resources、venv_meta、execution_history
"""
import logging
import sqlite3
from pathlib import Path
from typing import Optional

from config import SERVICE_DB_PATH

logger = logging.getLogger(__name__)


def _ensure_db_dir():
    Path(SERVICE_DB_PATH).parent.mkdir(parents=True, exist_ok=True)


def get_conn() -> sqlite3.Connection:
    """获取业务库连接（调用方负责 close 或 with）"""
    _ensure_db_dir()
    conn = sqlite3.connect(SERVICE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """创建/校验所有业务表"""
    _ensure_db_dir()
    with get_conn() as c:
        # 用户表（预留，登录可后续迁入）
        c.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        # 文件夹/文件路径表：path + 类型 + owner + 创建时间
        c.execute("""
            CREATE TABLE IF NOT EXISTS resources (
                path TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                owner TEXT,
                created_at TEXT NOT NULL
            )
        """)
        # 权限表：path -> read, write, delete, owner
        c.execute("""
            CREATE TABLE IF NOT EXISTS file_permissions (
                path TEXT PRIMARY KEY,
                read_ INTEGER NOT NULL DEFAULT 0,
                write_ INTEGER NOT NULL DEFAULT 0,
                delete_ INTEGER NOT NULL DEFAULT 0,
                owner TEXT
            )
        """)
        # 用户对路径的授权关联表：某用户对某路径被授予的权限
        c.execute("""
            CREATE TABLE IF NOT EXISTS permission_grants (
                path TEXT NOT NULL,
                username TEXT NOT NULL,
                read_ INTEGER NOT NULL DEFAULT 0,
                write_ INTEGER NOT NULL DEFAULT 0,
                delete_ INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (path, username)
            )
        """)
        # 虚拟环境元数据表
        c.execute("""
            CREATE TABLE IF NOT EXISTS venv_meta (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                created_by TEXT
            )
        """)
        # 执行历史表
        c.execute("""
            CREATE TABLE IF NOT EXISTS execution_history (
                id TEXT PRIMARY KEY,
                code TEXT NOT NULL,
                kernel_type TEXT NOT NULL,
                language TEXT NOT NULL,
                output TEXT DEFAULT '',
                errors TEXT DEFAULT '',
                status TEXT NOT NULL,
                execution_time REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                session_id TEXT,
                file_path TEXT,
                username TEXT
            )
        """)
        _migrate_columns(c)
    logger.info("Service DB initialized: %s", SERVICE_DB_PATH)


def _migrate_columns(c: sqlite3.Connection):
    """为已有数据库补充新列（兼容旧库）。"""
    # users.disabled
    cur = c.execute("PRAGMA table_info(users)")
    cols = [row[1] for row in cur.fetchall()]
    if "disabled" not in cols:
        c.execute("ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0")
    # venv_meta.created_by
    cur = c.execute("PRAGMA table_info(venv_meta)")
    cols = [row[1] for row in cur.fetchall()]
    if "created_by" not in cols:
        c.execute("ALTER TABLE venv_meta ADD COLUMN created_by TEXT")
    # execution_history.username
    cur = c.execute("PRAGMA table_info(execution_history)")
    cols = [row[1] for row in cur.fetchall()]
    if "username" not in cols:
        c.execute("ALTER TABLE execution_history ADD COLUMN username TEXT")


# 模块加载时建表
init_db()
