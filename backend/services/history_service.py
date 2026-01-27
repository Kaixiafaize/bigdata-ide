"""
执行历史记录服务
"""
import logging
import uuid
import time
from datetime import datetime
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class HistoryService:
    """执行历史记录管理服务"""
    
    def __init__(self):
        # 内存存储（实际应用中应该使用数据库）
        self._history: Dict[str, Dict] = {}
        self._max_history = 1000  # 最大保存记录数
    
    def add_history(
        self,
        code: str,
        kernel_type: str,
        language: str,
        output: str = '',
        errors: str = '',
        status: str = 'success',
        execution_time: float = 0.0,
        session_id: Optional[str] = None
    ) -> str:
        """添加执行历史记录"""
        history_id = str(uuid.uuid4())
        
        history_item = {
            'id': history_id,
            'code': code,
            'kernel_type': kernel_type,
            'language': language,
            'output': output,
            'errors': errors,
            'status': status,
            'execution_time': execution_time,
            'created_at': datetime.now().isoformat(),
            'session_id': session_id
        }
        
        self._history[history_id] = history_item
        
        # 如果超过最大记录数，删除最旧的记录
        if len(self._history) > self._max_history:
            # 按创建时间排序，删除最旧的
            sorted_items = sorted(
                self._history.items(),
                key=lambda x: x[1]['created_at']
            )
            # 删除最旧的 10%
            to_remove = int(self._max_history * 0.1)
            for i in range(to_remove):
                del self._history[sorted_items[i][0]]
        
        logger.info(f"Added execution history: {history_id}")
        return history_id
    
    def get_history(self, limit: int = 100, offset: int = 0) -> List[Dict]:
        """获取执行历史记录列表"""
        # 按创建时间倒序排序
        sorted_items = sorted(
            self._history.values(),
            key=lambda x: x['created_at'],
            reverse=True
        )
        
        return sorted_items[offset:offset + limit]
    
    def get_history_by_id(self, history_id: str) -> Optional[Dict]:
        """根据 ID 获取历史记录"""
        return self._history.get(history_id)
    
    def delete_history(self, history_id: str) -> bool:
        """删除历史记录"""
        if history_id in self._history:
            del self._history[history_id]
            logger.info(f"Deleted execution history: {history_id}")
            return True
        return False
    
    def clear_history(self) -> int:
        """清空所有历史记录"""
        count = len(self._history)
        self._history.clear()
        logger.info(f"Cleared all execution history ({count} records)")
        return count
    
    def get_history_count(self) -> int:
        """获取历史记录总数"""
        return len(self._history)


# 全局单例
history_service = HistoryService()
