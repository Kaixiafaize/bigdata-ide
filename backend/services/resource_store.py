"""
文件夹/文件路径表：业务库 resources 表，记录 path、type(file/directory)、owner、created_at
"""
import logging
from datetime import datetime
from typing import Optional

from services.db import get_conn

logger = logging.getLogger(__name__)


def insert(path: str, type_: str, owner: Optional[str] = None):
    """插入或更新一条 path 记录"""
    path = path.strip("/")
    now = datetime.utcnow().isoformat()
    with get_conn() as c:
        c.execute(
            """
            INSERT INTO resources (path, type, owner, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET type = excluded.type, owner = COALESCE(excluded.owner, owner)
            """,
            (path, type_, owner, now),
        )


def delete_path(path: str):
    """删除单条 path 记录"""
    path = path.strip("/")
    with get_conn() as c:
        c.execute("DELETE FROM resources WHERE path = ?", (path,))


def delete_prefix(prefix: str):
    """删除路径及其下所有子路径（删除目录时用）"""
    prefix = prefix.strip("/")
    if not prefix:
        return
    with get_conn() as c:
        c.execute("DELETE FROM resources WHERE path = ? OR path LIKE ?", (prefix, prefix + "/%"))


def rename_path(old_path: str, new_path: str):
    """单条路径重命名"""
    old_path = old_path.strip("/")
    new_path = new_path.strip("/")
    with get_conn() as c:
        c.execute("UPDATE resources SET path = ? WHERE path = ?", (new_path, old_path))


def rename_prefix(old_prefix: str, new_prefix: str):
    """目录重命名：批量更新 path"""
    old_prefix = old_prefix.strip("/")
    new_prefix = new_prefix.strip("/")
    with get_conn() as c:
        rows = c.execute(
            "SELECT path FROM resources WHERE path = ? OR path LIKE ?",
            (old_prefix, old_prefix + "/%"),
        ).fetchall()
        for row in rows:
            p = row["path"]
            if p == old_prefix:
                new_p = new_prefix
            else:
                new_p = new_prefix + p[len(old_prefix):]
            c.execute("UPDATE resources SET path = ? WHERE path = ?", (new_p, p))
