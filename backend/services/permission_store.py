"""
文件/目录权限：读写业务库 data/service.db 的 file_permissions 表
"""
import logging
from typing import Optional, Dict, Any

from services.db import get_conn

logger = logging.getLogger(__name__)


def get(path: str) -> Optional[Dict[str, Any]]:
    """获取路径权限，无记录返回 None"""
    path = path.strip("/")
    with get_conn() as c:
        row = c.execute(
            "SELECT read_, write_, delete_, owner FROM file_permissions WHERE path = ?",
            (path,),
        ).fetchone()
    if row is None:
        return None
    return {
        "read": bool(row["read_"]),
        "write": bool(row["write_"]),
        "delete": bool(row["delete_"]),
        "owner": row["owner"],
    }


def set(path: str, read: bool = False, write: bool = False, delete: bool = False, owner: Optional[str] = None):
    """设置路径权限（新建或覆盖）"""
    path = path.strip("/")
    with get_conn() as c:
        c.execute(
            """
            INSERT INTO file_permissions (path, read_, write_, delete_, owner)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                read_ = excluded.read_,
                write_ = excluded.write_,
                delete_ = excluded.delete_,
                owner = COALESCE(excluded.owner, owner)
            """,
            (path, 1 if read else 0, 1 if write else 0, 1 if delete else 0, owner),
        )
    logger.debug("Set permission for %s: read=%s write=%s delete=%s owner=%s", path, read, write, delete, owner)


def delete_path(path: str):
    """删除单条权限记录及该路径上的所有授权"""
    path = path.strip("/")
    with get_conn() as c:
        c.execute("DELETE FROM file_permissions WHERE path = ?", (path,))
        c.execute("DELETE FROM permission_grants WHERE path = ?", (path,))


def delete_prefix(prefix: str):
    """删除路径及其下所有子路径的权限记录与授权（删除目录时用）"""
    prefix = prefix.strip("/")
    if not prefix:
        return
    with get_conn() as c:
        c.execute("DELETE FROM file_permissions WHERE path = ? OR path LIKE ?", (prefix, prefix + "/%"))
        c.execute("DELETE FROM permission_grants WHERE path = ? OR path LIKE ?", (prefix, prefix + "/%"))


def rename_path(old_path: str, new_path: str):
    """单条路径重命名（含 file_permissions 与 permission_grants）"""
    old_path = old_path.strip("/")
    new_path = new_path.strip("/")
    with get_conn() as c:
        c.execute("UPDATE file_permissions SET path = ? WHERE path = ?", (new_path, old_path))
        c.execute("UPDATE permission_grants SET path = ? WHERE path = ?", (new_path, old_path))


def rename_prefix(old_prefix: str, new_prefix: str):
    """目录重命名：将所有 path = old_prefix 或 path LIKE old_prefix/% 改为 new_prefix 或 new_prefix/%"""
    old_prefix = old_prefix.strip("/")
    new_prefix = new_prefix.strip("/")
    with get_conn() as c:
        rows = c.execute(
            "SELECT path FROM file_permissions WHERE path = ? OR path LIKE ?",
            (old_prefix, old_prefix + "/%"),
        ).fetchall()
        for row in rows:
            p = row["path"]
            if p == old_prefix:
                new_p = new_prefix
            else:
                new_p = new_prefix + p[len(old_prefix):]
            c.execute("UPDATE file_permissions SET path = ? WHERE path = ?", (new_p, p))
        # 同步更新 permission_grants
        rows = c.execute(
            "SELECT path, username FROM permission_grants WHERE path = ? OR path LIKE ?",
            (old_prefix, old_prefix + "/%"),
        ).fetchall()
        for row in rows:
            p = row["path"]
            uname = row["username"]
            if p == old_prefix:
                new_p = new_prefix
            else:
                new_p = new_prefix + p[len(old_prefix):]
            c.execute(
                "UPDATE permission_grants SET path = ? WHERE path = ? AND username = ?",
                (new_p, p, uname),
            )


# ---------- permission_grants：用户对路径的授权 ----------


def get_grant(path: str, username: str) -> Optional[Dict[str, Any]]:
    """获取某用户对某路径的授权；无记录返回 None。"""
    path = path.strip("/")
    with get_conn() as c:
        row = c.execute(
            "SELECT read_, write_, delete_ FROM permission_grants WHERE path = ? AND username = ?",
            (path, username),
        ).fetchone()
    if row is None:
        return None
    return {
        "read": bool(row["read_"]),
        "write": bool(row["write_"]),
        "delete": bool(row["delete_"]),
    }


def set_grant(path: str, username: str, read: bool = False, write: bool = False, delete: bool = False):
    """设置某用户对某路径的授权（新建或覆盖）"""
    path = path.strip("/")
    with get_conn() as c:
        c.execute(
            """
            INSERT INTO permission_grants (path, username, read_, write_, delete_)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(path, username) DO UPDATE SET
                read_ = excluded.read_,
                write_ = excluded.write_,
                delete_ = excluded.delete_
            """,
            (path, username, 1 if read else 0, 1 if write else 0, 1 if delete else 0),
        )
    logger.debug("Set grant for %s -> %s: read=%s write=%s delete=%s", path, username, read, write, delete)


def delete_grant(path: str, username: str):
    """删除某用户对某路径的授权"""
    path = path.strip("/")
    with get_conn() as c:
        c.execute("DELETE FROM permission_grants WHERE path = ? AND username = ?", (path, username))


def delete_grant_prefix(prefix: str):
    """删除路径及其下所有子路径的授权（删除目录时用）"""
    prefix = prefix.strip("/")
    if not prefix:
        return
    with get_conn() as c:
        c.execute("DELETE FROM permission_grants WHERE path = ? OR path LIKE ?", (prefix, prefix + "/%"))


def check_permission_for_user(path: str, permission: str, username: str, base_perms: Dict[str, Any]) -> bool:
    """
    根据 file_permissions + permission_grants 判断用户对该路径是否有 permission（read/write/delete）。
    base_perms 为 permission_store.get(path) 的结果；若为 None 调用方传 _DEFAULT_PERMS。
    """
    owner = base_perms.get("owner")
    if owner and username == owner:
        return True
    grant = get_grant(path, username)
    if grant is not None:
        return grant.get(permission, False)
    return base_perms.get(permission, True)
