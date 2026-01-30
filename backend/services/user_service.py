"""
用户管理：读写业务库 users 表，登录校验、CRUD、从环境变量种子
"""
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any

import bcrypt

from services.db import get_conn

logger = logging.getLogger(__name__)


def _bcrypt_hash(password: str) -> str:
    raw = password.encode("utf-8")[:72]
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def _bcrypt_verify(password: str, hashed: str) -> bool:
    raw = password.encode("utf-8")[:72]
    return bcrypt.checkpw(raw, hashed.encode("utf-8"))


def get_by_username(username: str) -> Optional[Dict[str, Any]]:
    """按用户名查用户，无则返回 None。"""
    with get_conn() as c:
        row = c.execute(
            "SELECT id, username, created_at, disabled FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "username": row["username"],
        "created_at": row["created_at"],
        "disabled": bool(row["disabled"]),
    }


def get_password_hash(username: str) -> Optional[str]:
    """获取用户密码哈希（用于校验），无则返回 None。"""
    with get_conn() as c:
        row = c.execute("SELECT password_hash FROM users WHERE username = ?", (username,)).fetchone()
    return row["password_hash"] if row else None


def verify(username: str, password: str) -> bool:
    """校验用户名与密码；用户不存在、已禁用或密码错误返回 False。"""
    user = get_by_username(username)
    if user is None or user.get("disabled"):
        return False
    hashed = get_password_hash(username)
    if not hashed:
        return False
    return _bcrypt_verify(password, hashed)


def list_users() -> List[Dict[str, Any]]:
    """列出所有用户（不含密码）。"""
    with get_conn() as c:
        rows = c.execute(
            "SELECT id, username, created_at, disabled FROM users ORDER BY id"
        ).fetchall()
    return [
        {
            "id": r["id"],
            "username": r["username"],
            "created_at": r["created_at"],
            "disabled": bool(r["disabled"]),
        }
        for r in rows
    ]


def create_user(username: str, password: str) -> Dict[str, Any]:
    """创建用户；用户名已存在则抛出 ValueError。"""
    username = username.strip()
    if not username:
        raise ValueError("用户名为空")
    if get_by_username(username) is not None:
        raise ValueError("用户名已存在")
    password_hash = _bcrypt_hash(password)
    created_at = datetime.utcnow().isoformat()
    with get_conn() as c:
        c.execute(
            "INSERT INTO users (username, password_hash, created_at, disabled) VALUES (?, ?, ?, 0)",
            (username, password_hash, created_at),
        )
        row = c.execute(
            "SELECT id, username, created_at, disabled FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    logger.info("Created user: %s", username)
    return {
        "id": row["id"],
        "username": row["username"],
        "created_at": row["created_at"],
        "disabled": bool(row["disabled"]),
    }


def update_password(username: str, new_password: str) -> bool:
    """修改用户密码；用户不存在返回 False。"""
    if get_by_username(username) is None:
        return False
    password_hash = _bcrypt_hash(new_password)
    with get_conn() as c:
        c.execute("UPDATE users SET password_hash = ? WHERE username = ?", (password_hash, username))
    logger.info("Updated password for user: %s", username)
    return True


def set_disabled(username: str, disabled: bool) -> bool:
    """启用/禁用用户；用户不存在返回 False。"""
    if get_by_username(username) is None:
        return False
    with get_conn() as c:
        c.execute("UPDATE users SET disabled = ? WHERE username = ?", (1 if disabled else 0, username))
    logger.info("Set user %s disabled=%s", username, disabled)
    return True


def delete_user(username: str) -> bool:
    """删除用户（物理删除）；用户不存在返回 False。"""
    if get_by_username(username) is None:
        return False
    with get_conn() as c:
        c.execute("DELETE FROM users WHERE username = ?", (username,))
    logger.info("Deleted user: %s", username)
    return True
