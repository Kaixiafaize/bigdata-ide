"""
编辑器相关路由（代码保存、格式化等）
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.schemas import SaveCodeRequest
from services.file_service import file_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bigdata-ide", tags=["editor"])


class FormatCodeRequest(BaseModel):
    code: str
    language: str = 'python'


@router.post("/editor/save")
async def save_code(request: SaveCodeRequest):
    """保存代码到文件"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    
    try:
        # 上传文件内容到 MinIO
        file_content = request.content.encode('utf-8')
        result = file_service.upload_file(
            file_content,
            request.path,
            'text/plain'
        )
        return {'status': 'ok', 'path': request.path}
    except Exception as e:
        logger.error(f"Error saving code: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/editor/format")
async def format_code(request: FormatCodeRequest):
    """格式化代码（简单实现，实际应该使用语言特定的格式化工具）"""
    try:
        # 这里可以集成 autopep8 (Python), sqlformat (SQL) 等
        # 目前返回原代码，前端可以使用 Monaco Editor 的格式化功能
        formatted_code = request.code  # TODO: 实现实际的格式化逻辑
        
        return {
            'status': 'ok',
            'formatted_code': formatted_code
        }
    except Exception as e:
        logger.error(f"Error formatting code: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
