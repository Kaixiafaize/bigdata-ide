"""
文件管理路由 (MinIO)，需登录，按当前用户做权限校验
"""
import logging
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse

from services.file_service import file_service
from routers.auth import get_current_user_required

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bigdata-ide", tags=["files"])


def _handle_file_errors(e: Exception):
    if isinstance(e, PermissionError):
        raise HTTPException(status_code=403, detail=str(e))
    if isinstance(e, FileNotFoundError):
        raise HTTPException(status_code=404, detail=str(e))
    if isinstance(e, ValueError):
        raise HTTPException(status_code=400, detail=str(e))
    if isinstance(e, RuntimeError):
        raise HTTPException(status_code=503, detail=str(e))
    raise HTTPException(status_code=500, detail=str(e))


@router.get("/files")
async def list_files(
    path: str = "",
    current_user: str = Depends(get_current_user_required),
):
    """列出文件/目录（按当前用户 read 权限过滤）"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    try:
        files = file_service.list_files(path, current_user=current_user)
        return {'files': files, 'path': path, 'status': 'ok'}
    except Exception as e:
        _handle_file_errors(e)


@router.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    path: str = Form(""),
    current_user: str = Depends(get_current_user_required),
):
    """上传文件（新文件将当前用户设为 owner）"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    try:
        path = path.strip('/')
        object_name = f"{path}/{file.filename}" if path else file.filename
        file_content = await file.read()
        result = file_service.upload_file(
            file_content,
            object_name,
            file.content_type or 'application/octet-stream',
            current_user=current_user,
        )
        result['status'] = 'ok'
        return result
    except Exception as e:
        _handle_file_errors(e)


@router.get("/files/download")
async def download_file(
    path: str,
    current_user: str = Depends(get_current_user_required),
):
    """下载文件（校验 read 权限）"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    try:
        file_content, metadata = file_service.download_file(path, current_user=current_user)
        return StreamingResponse(
            BytesIO(file_content),
            media_type=metadata['content_type'],
            headers={
                "Content-Disposition": f'attachment; filename="{metadata["filename"]}"',
                "Content-Length": str(metadata['size'])
            }
        )
    except Exception as e:
        _handle_file_errors(e)


@router.delete("/files")
async def delete_file(
    path: str,
    current_user: str = Depends(get_current_user_required),
):
    """删除文件或目录（校验 delete 权限）"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    try:
        file_service.delete_file(path, current_user=current_user)
        return {'status': 'ok', 'path': path}
    except Exception as e:
        _handle_file_errors(e)


@router.post("/files/mkdir")
async def create_directory(
    path: str,
    current_user: str = Depends(get_current_user_required),
):
    """创建目录（父路径需 write 权限）"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    try:
        file_service.create_directory(path, current_user=current_user)
        return {'status': 'ok', 'path': path}
    except Exception as e:
        _handle_file_errors(e)


@router.post("/files/rename")
async def rename_file(
    old_path: str,
    new_path: str,
    current_user: str = Depends(get_current_user_required),
):
    """重命名/移动（需 write 权限）"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    try:
        file_service.rename_file(old_path, new_path, current_user=current_user)
        return {'status': 'ok', 'old_path': old_path, 'new_path': new_path}
    except Exception as e:
        _handle_file_errors(e)


@router.get("/files/permissions")
async def get_file_permissions(
    path: str,
    current_user: str = Depends(get_current_user_required),
):
    """获取文件权限"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    try:
        permissions = file_service.get_permissions(path)
        return {'path': path, 'permissions': permissions, 'status': 'ok'}
    except Exception as e:
        _handle_file_errors(e)


@router.post("/files/permissions")
async def set_file_permissions(
    path: str,
    read: bool = True,
    write: bool = True,
    delete: bool = True,
    owner: Optional[str] = None,
    current_user: str = Depends(get_current_user_required),
):
    """设置文件权限（仅资源 owner 可设置）"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    try:
        file_service.set_permissions(path, read, write, delete, owner, current_user=current_user)
        return {'status': 'ok', 'path': path}
    except Exception as e:
        _handle_file_errors(e)
