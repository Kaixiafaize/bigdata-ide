"""
执行历史记录路由：需登录，仅操作当前用户自己的历史
"""
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query

from models.schemas import ExecutionHistory
from routers.auth import get_current_user_required
from services.history_service import history_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bigdata-ide", tags=["history"])


@router.get("/history", response_model=List[ExecutionHistory])
async def get_execution_history(
    limit: int = Query(100, ge=1, le=1000, description="返回记录数"),
    offset: int = Query(0, ge=0, description="偏移量"),
    current_user: str = Depends(get_current_user_required),
):
    """获取当前用户的执行历史记录列表"""
    try:
        history = history_service.get_history(limit=limit, offset=offset, username=current_user)
        return history
    except Exception as e:
        logger.error(f"Error getting history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{history_id}", response_model=ExecutionHistory)
async def get_history_by_id(
    history_id: str,
    current_user: str = Depends(get_current_user_required),
):
    """根据 ID 获取历史记录详情（仅本人）"""
    try:
        history = history_service.get_history_by_id(history_id, username=current_user)
        if not history:
            raise HTTPException(status_code=404, detail="History not found")
        return history
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting history by id: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history/{history_id}")
async def delete_history(
    history_id: str,
    current_user: str = Depends(get_current_user_required),
):
    """删除当前用户的一条历史记录"""
    try:
        success = history_service.delete_history(history_id, username=current_user)
        if not success:
            raise HTTPException(status_code=404, detail="History not found")
        return {'status': 'ok', 'id': history_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history")
async def clear_history(current_user: str = Depends(get_current_user_required)):
    """清空当前用户的所有历史记录"""
    try:
        count = history_service.clear_history(username=current_user)
        return {'status': 'ok', 'deleted_count': count}
    except Exception as e:
        logger.error(f"Error clearing history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/count")
async def get_history_count(current_user: str = Depends(get_current_user_required)):
    """获取当前用户的历史记录总数"""
    try:
        count = history_service.get_history_count(username=current_user)
        return {'count': count}
    except Exception as e:
        logger.error(f"Error getting history count: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
