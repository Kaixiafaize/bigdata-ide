"""
执行历史记录服务：读写业务库 data/service.db 的 execution_history 表
"""
import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from services.db import get_conn

logger = logging.getLogger(__name__)

_MAX_HISTORY = 1000


class HistoryService:
    """执行历史记录管理服务"""

    def add_history(
        self,
        code: str,
        kernel_type: str,
        language: str,
        output: str = '',
        errors: str = '',
        status: str = 'success',
        execution_time: float = 0.0,
        session_id: Optional[str] = None,
        file_path: Optional[str] = None,
        username: Optional[str] = None,
    ) -> str:
        """添加执行历史记录"""
        history_id = str(uuid.uuid4())
        created_at = datetime.utcnow().isoformat()
        with get_conn() as c:
            c.execute(
                """
                INSERT INTO execution_history
                (id, code, kernel_type, language, output, errors, status, execution_time, created_at, session_id, file_path, username)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (history_id, code, kernel_type, language, output, errors, status, execution_time, created_at, session_id, file_path, username),
            )
            count = c.execute("SELECT COUNT(*) FROM execution_history").fetchone()[0]
            if count > _MAX_HISTORY:
                c.execute(
                    """
                    DELETE FROM execution_history WHERE id IN (
                        SELECT id FROM execution_history ORDER BY created_at ASC LIMIT ?
                    )
                    """,
                    (int(_MAX_HISTORY * 0.1),),
                )
        logger.info("Added execution history: %s", history_id)
        return history_id

    def get_history(self, limit: int = 100, offset: int = 0, username: Optional[str] = None) -> List[Dict]:
        """获取执行历史记录列表，按创建时间倒序；若传 username 则只返回该用户的记录。"""
        with get_conn() as c:
            if username is not None:
                rows = c.execute(
                    """
                    SELECT id, code, kernel_type, language, output, errors, status,
                           execution_time, created_at, session_id, file_path, username
                    FROM execution_history WHERE username = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
                    """,
                    (username, limit, offset),
                ).fetchall()
            else:
                rows = c.execute(
                    """
                    SELECT id, code, kernel_type, language, output, errors, status,
                           execution_time, created_at, session_id, file_path, username
                    FROM execution_history ORDER BY created_at DESC LIMIT ? OFFSET ?
                    """,
                    (limit, offset),
                ).fetchall()
        return [
            {
                "id": r["id"],
                "code": r["code"],
                "kernel_type": r["kernel_type"],
                "language": r["language"],
                "output": r["output"] or "",
                "errors": r["errors"] or "",
                "status": r["status"],
                "execution_time": r["execution_time"] or 0,
                "created_at": r["created_at"],
                "session_id": r["session_id"],
                "file_path": r["file_path"],
                "username": r["username"],
            }
            for r in rows
        ]

    def get_history_by_id(self, history_id: str, username: Optional[str] = None) -> Optional[Dict]:
        """根据 ID 获取历史记录；若传 username 则仅当记录属于该用户时返回。"""
        with get_conn() as c:
            row = c.execute(
                "SELECT id, code, kernel_type, language, output, errors, status, execution_time, created_at, session_id, file_path, username FROM execution_history WHERE id = ?",
                (history_id,),
            ).fetchone()
        if row is None:
            return None
        if username is not None and row["username"] != username:
            return None
        return {
            "id": row["id"],
            "code": row["code"],
            "kernel_type": row["kernel_type"],
            "language": row["language"],
            "output": row["output"] or "",
            "errors": row["errors"] or "",
            "status": row["status"],
            "execution_time": row["execution_time"] or 0,
            "created_at": row["created_at"],
            "session_id": row["session_id"],
            "file_path": row["file_path"],
            "username": row["username"],
        }

    def delete_history(self, history_id: str, username: Optional[str] = None) -> bool:
        """删除历史记录；若传 username 则仅当记录属于该用户时删除。"""
        with get_conn() as c:
            if username is not None:
                c.execute("DELETE FROM execution_history WHERE id = ? AND username = ?", (history_id, username))
            else:
                c.execute("DELETE FROM execution_history WHERE id = ?", (history_id,))
            return c.rowcount > 0

    def clear_history(self, username: Optional[str] = None) -> int:
        """清空历史记录；若传 username 则只清空该用户的记录。"""
        with get_conn() as c:
            if username is not None:
                count = c.execute("SELECT COUNT(*) FROM execution_history WHERE username = ?", (username,)).fetchone()[0]
                c.execute("DELETE FROM execution_history WHERE username = ?", (username,))
            else:
                count = c.execute("SELECT COUNT(*) FROM execution_history").fetchone()[0]
                c.execute("DELETE FROM execution_history")
        logger.info("Cleared execution history (%s records)", count)
        return count

    def get_history_count(self, username: Optional[str] = None) -> int:
        """获取历史记录总数；若传 username 则只计该用户的记录。"""
        with get_conn() as c:
            if username is not None:
                return c.execute("SELECT COUNT(*) FROM execution_history WHERE username = ?", (username,)).fetchone()[0]
            return c.execute("SELECT COUNT(*) FROM execution_history").fetchone()[0]


history_service = HistoryService()
