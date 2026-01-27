"""
文件管理路由 (MinIO)
"""
import logging
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse

from services.file_service import file_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bigdata-ide", tags=["files"])


@router.get("/files")
async def list_files(path: str = ""):
    """列出文件/目录"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    
    try:
        files = file_service.list_files(path)
        return {'files': files, 'path': path, 'status': 'ok'}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error listing files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    path: str = Form("")
):
    """上传文件"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    
    try:
        # 规范化路径
        path = path.strip('/')
        object_name = f"{path}/{file.filename}" if path else file.filename
        
        # 读取文件内容
        file_content = await file.read()
        
        # 上传到 MinIO
        result = file_service.upload_file(
            file_content,
            object_name,
            file.content_type or 'application/octet-stream'
        )
        
        result['status'] = 'ok'
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error uploading file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/download")
async def download_file(path: str):
    """下载文件"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    
    try:
        file_content, metadata = file_service.download_file(path)
        
        return StreamingResponse(
            BytesIO(file_content),
            media_type=metadata['content_type'],
            headers={
                "Content-Disposition": f'attachment; filename="{metadata["filename"]}"',
                "Content-Length": str(metadata['size'])
            }
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error downloading file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/files")
async def delete_file(path: str):
    """删除文件或目录"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    
    try:
        file_service.delete_file(path)
        return {'status': 'ok', 'path': path}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File or directory not found")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files/mkdir")
async def create_directory(path: str):
    """创建目录"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    
    try:
        file_service.create_directory(path)
        return {'status': 'ok', 'path': path}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating directory: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files/rename")
async def rename_file(old_path: str, new_path: str):
    """重命名/移动文件或目录"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    
    try:
        file_service.rename_file(old_path, new_path)
        # 更新权限记录
        if old_path in file_service.permissions:
            file_service.permissions[new_path] = file_service.permissions.pop(old_path)
        return {'status': 'ok', 'old_path': old_path, 'new_path': new_path}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File or directory not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error renaming file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/permissions")
async def get_file_permissions(path: str):
    """获取文件权限"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    
    try:
        permissions = file_service.get_permissions(path)
        return {'path': path, 'permissions': permissions, 'status': 'ok'}
    except Exception as e:
        logger.error(f"Error getting permissions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files/permissions")
async def set_file_permissions(
    path: str,
    read: bool = True,
    write: bool = True,
    delete: bool = True,
    owner: Optional[str] = None
):
    """设置文件权限"""
    if not file_service.is_available():
        raise HTTPException(status_code=503, detail="MinIO client not available")
    
    try:
        file_service.set_permissions(path, read, write, delete, owner)
        return {'status': 'ok', 'path': path}
    except Exception as e:
        logger.error(f"Error setting permissions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
