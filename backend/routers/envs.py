"""
虚拟环境管理 API
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from models.schemas import VenvCreate, VenvItem
from routers.auth import get_current_user_required
from services import venv_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bigdata-ide", tags=["envs"])


@router.get("/envs", response_model=list)
async def list_envs():
    """列举所有虚拟环境。"""
    try:
        items = venv_service.list_venvs()
        return items
    except Exception as e:
        logger.exception("List envs error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/envs", response_model=dict)
async def create_env(body: VenvCreate, current_user: str = Depends(get_current_user_required)):
    """创建新虚拟环境（需登录，记录创建者）。"""
    try:
        return venv_service.create_venv(body.name, created_by=current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Create env error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/envs/{venv_id}")
async def get_env(venv_id: str):
    """获取单个虚拟环境信息（含 python_path）。"""
    items = venv_service.list_venvs()
    for item in items:
        if item["id"] == venv_id:
            return item
    raise HTTPException(status_code=404, detail="虚拟环境不存在")


@router.delete("/envs/{venv_id}")
async def delete_env(venv_id: str):
    """删除虚拟环境。"""
    try:
        venv_service.delete_venv(venv_id)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Delete env error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
