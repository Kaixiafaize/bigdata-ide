"""
文件管理服务 (MinIO)
"""
import logging
from io import BytesIO
from typing import List, Optional, Dict, Any

from minio import Minio
from minio.error import S3Error

from config import (
    MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY,
    MINIO_SECURE, MINIO_BUCKET
)
from models.schemas import FileItem

logger = logging.getLogger(__name__)


class FileService:
    """文件管理服务类"""
    
    def __init__(self):
        self.client: Optional[Minio] = None
        self.bucket = MINIO_BUCKET
        # 文件权限存储（实际应用中应该使用数据库）
        self.permissions: Dict[str, Dict[str, bool]] = {}  # path -> {read, write, delete, owner}
        self._initialize_client()
    
    def _initialize_client(self):
        """初始化 MinIO 客户端"""
        try:
            self.client = Minio(
                MINIO_ENDPOINT,
                access_key=MINIO_ACCESS_KEY,
                secret_key=MINIO_SECRET_KEY,
                secure=MINIO_SECURE
            )
            # 确保 bucket 存在
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
                logger.info(f"Created MinIO bucket: {self.bucket}")
            logger.info(f"MinIO client initialized: {MINIO_ENDPOINT}/{self.bucket}")
        except Exception as e:
            logger.error(f"Failed to initialize MinIO client: {e}")
            self.client = None
    
    def is_available(self) -> bool:
        """检查 MinIO 客户端是否可用"""
        return self.client is not None
    
    def list_files(self, path: str = "") -> List[FileItem]:
        """列出文件/目录"""
        if not self.client:
            raise RuntimeError("MinIO client not available")
        
        # 规范化路径
        path = path.strip('/')
        prefix = f"{path}/" if path else ""
        
        objects = self.client.list_objects(
            self.bucket,
            prefix=prefix,
            recursive=False
        )
        
        files = []
        directories = set()
        
        for obj in objects:
            # 获取相对路径
            relative_path = obj.object_name
            if prefix:
                relative_path = relative_path[len(prefix):]
            
            # 跳过空路径
            if not relative_path:
                continue
            
            # 处理目录（以 / 结尾的对象）
            if relative_path.endswith('/'):
                dir_name = relative_path.rstrip('/')
                if dir_name and dir_name not in directories:
                    directories.add(dir_name)
                    dir_path = f"{path}/{dir_name}" if path else dir_name
                    # 获取权限信息
                    dir_permissions = self.permissions.get(dir_path, {
                        'read': True,
                        'write': True,
                        'delete': True,
                        'owner': None
                    })
                    
                    files.append(FileItem(
                        name=dir_name,
                        path=dir_path,
                        type='directory',
                        permissions=dir_permissions
                    ))
            else:
                # 处理文件
                file_name = relative_path.split('/')[-1]
                file_path = f"{path}/{relative_path}" if path else relative_path
                # 获取权限信息
                file_permissions = self.permissions.get(file_path, {
                    'read': True,
                    'write': True,
                    'delete': True,
                    'owner': None
                })
                
                files.append(FileItem(
                    name=file_name,
                    path=file_path,
                    type='file',
                    size=obj.size,
                    modified=obj.last_modified.isoformat() if obj.last_modified else None,
                    permissions=file_permissions
                ))
        
        # 排序：目录在前，然后按名称排序
        files.sort(key=lambda x: (x.type != 'directory', x.name.lower()))
        
        return files
    
    def upload_file(self, file_content: bytes, object_name: str, content_type: str = 'application/octet-stream'):
        """上传文件"""
        if not self.client:
            raise RuntimeError("MinIO client not available")
        
        file_size = len(file_content)
        self.client.put_object(
            self.bucket,
            object_name,
            BytesIO(file_content),
            file_size,
            content_type=content_type
        )
        
        logger.info(f"Uploaded file: {object_name} ({file_size} bytes)")
        return {'path': object_name, 'size': file_size}
    
    def download_file(self, path: str) -> tuple[bytes, dict]:
        """下载文件，返回文件内容和元数据"""
        if not self.client:
            raise RuntimeError("MinIO client not available")
        
        # 规范化路径
        path = path.strip('/')
        
        # 检查文件是否存在并获取元数据
        try:
            stat = self.client.stat_object(self.bucket, path)
        except S3Error as e:
            if e.code == 'NoSuchKey':
                raise FileNotFoundError("File not found")
            raise
        
        # 获取文件
        response = self.client.get_object(self.bucket, path)
        file_content = response.read()
        response.close()
        response.release_conn()
        
        metadata = {
            'content_type': stat.content_type or 'application/octet-stream',
            'size': stat.size,
            'filename': path.split('/')[-1]
        }
        
        return file_content, metadata
    
    def delete_file(self, path: str):
        """删除文件或目录"""
        if not self.client:
            raise RuntimeError("MinIO client not available")
        
        # 规范化路径
        path = path.strip('/')
        
        # 检查是文件还是目录
        try:
            stat = self.client.stat_object(self.bucket, path)
            # 是文件，直接删除
            self.client.remove_object(self.bucket, path)
            logger.info(f"Deleted file: {path}")
        except S3Error as e:
            if e.code == 'NoSuchKey':
                # 可能是目录，尝试删除目录下的所有对象
                prefix = f"{path}/"
                objects = self.client.list_objects(self.bucket, prefix=prefix, recursive=True)
                deleted_count = 0
                for obj in objects:
                    self.client.remove_object(self.bucket, obj.object_name)
                    deleted_count += 1
                if deleted_count > 0:
                    logger.info(f"Deleted directory: {path} ({deleted_count} objects)")
                else:
                    raise FileNotFoundError("File or directory not found")
            else:
                raise
    
    def create_directory(self, path: str):
        """创建目录"""
        if not self.client:
            raise RuntimeError("MinIO client not available")
        
        # 规范化路径，确保以 / 结尾
        path = path.strip('/')
        if not path:
            raise ValueError("Directory name cannot be empty")
        
        # MinIO 中目录是通过以 / 结尾的对象表示的
        dir_path = f"{path}/"
        
        # 创建目录标记对象
        self.client.put_object(
            self.bucket,
            dir_path,
            BytesIO(b''),
            0,
            content_type='application/x-directory'
        )
        
        logger.info(f"Created directory: {path}")
    
    def rename_file(self, old_path: str, new_path: str):
        """重命名/移动文件或目录"""
        if not self.client:
            raise RuntimeError("MinIO client not available")
        
        old_path = old_path.strip('/')
        new_path = new_path.strip('/')
        
        if not old_path or not new_path:
            raise ValueError("Paths cannot be empty")
        
        # 检查是文件还是目录
        try:
            stat = self.client.stat_object(self.bucket, old_path)
            # 是文件，复制后删除
            response = self.client.get_object(self.bucket, old_path)
            file_content = response.read()
            response.close()
            response.release_conn()
            
            self.client.put_object(
                self.bucket,
                new_path,
                BytesIO(file_content),
                stat.size,
                content_type=stat.content_type
            )
            self.client.remove_object(self.bucket, old_path)
            logger.info(f"Renamed file: {old_path} -> {new_path}")
        except S3Error as e:
            if e.code == 'NoSuchKey':
                # 可能是目录，复制所有对象
                prefix = f"{old_path}/"
                objects = list(self.client.list_objects(self.bucket, prefix=prefix, recursive=True))
                if not objects:
                    raise FileNotFoundError("File or directory not found")
                
                for obj in objects:
                    # 计算新路径
                    relative_path = obj.object_name[len(prefix):]
                    new_obj_path = f"{new_path}/{relative_path}"
                    
                    # 复制对象
                    response = self.client.get_object(self.bucket, obj.object_name)
                    content = response.read()
                    response.close()
                    response.release_conn()
                    
                    self.client.put_object(
                        self.bucket,
                        new_obj_path,
                        BytesIO(content),
                        obj.size,
                        content_type=obj.content_type
                    )
                    self.client.remove_object(self.bucket, obj.object_name)
                
                logger.info(f"Renamed directory: {old_path} -> {new_path} ({len(objects)} objects)")
            else:
                raise
    
    def get_permissions(self, path: str) -> Dict[str, Any]:
        """获取文件权限"""
        return self.permissions.get(path, {
            'read': True,
            'write': True,
            'delete': True,
            'owner': None
        })
    
    def set_permissions(self, path: str, read: bool = True, write: bool = True, 
                       delete: bool = True, owner: Optional[str] = None):
        """设置文件权限"""
        self.permissions[path] = {
            'read': read,
            'write': write,
            'delete': delete,
            'owner': owner
        }
        logger.info(f"Set permissions for {path}: read={read}, write={write}, delete={delete}, owner={owner}")
    
    def check_permission(self, path: str, permission: str) -> bool:
        """检查权限"""
        perms = self.permissions.get(path, {
            'read': True,
            'write': True,
            'delete': True,
            'owner': None
        })
        return perms.get(permission, True)


# 全局文件服务实例
file_service = FileService()
