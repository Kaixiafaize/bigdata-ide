"""
执行历史记录路由
"""
import logging
from typing import List

from fastapi import APIRouter, HTTPException, Query

from models.schemas import ExecutionHistory
from services.history_service import history_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bigdata-ide", tags=["history"])


@router.get("/history", response_model=List[ExecutionHistory])
async def get_execution_history(
    limit: int = Query(100, ge=1, le=1000, description="返回记录数"),
    offset: int = Query(0, ge=0, description="偏移量")
):
    """获取执行历史记录列表"""
    try:
        history = history_service.get_history(limit=limit, offset=offset)
        return history
    except Exception as e:
        logger.error(f"Error getting history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{history_id}", response_model=ExecutionHistory)
async def get_history_by_id(history_id: str):
    """根据 ID 获取历史记录详情"""
    try:
        history = history_service.get_history_by_id(history_id)
        if not history:
            raise HTTPException(status_code=404, detail="History not found")
        return history
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting history by id: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history/{history_id}")
async def delete_history(history_id: str):
    """删除历史记录"""
    try:
        success = history_service.delete_history(history_id)
        if not success:
            raise HTTPException(status_code=404, detail="History not found")
        return {'status': 'ok', 'id': history_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history")
async def clear_history():
    """清空所有历史记录"""
    try:
        count = history_service.clear_history()
        return {'status': 'ok', 'deleted_count': count}
    except Exception as e:
        logger.error(f"Error clearing history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/count")
async def get_history_count():
    """获取历史记录总数"""
    try:
        count = history_service.get_history_count()
        return {'count': count}
    except Exception as e:
        logger.error(f"Error getting history count: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
