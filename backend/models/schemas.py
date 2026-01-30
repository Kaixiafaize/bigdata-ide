"""
数据模型定义
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel


class SessionCreate(BaseModel):
    kernel_type: str = 'python'
    path: Optional[str] = None
    venv_id: Optional[str] = None  # 选中的虚拟环境 id，kernel 将使用该环境的 Python


class ExecuteRequest(BaseModel):
    session_id: str
    code: str


class ExecuteResponse(BaseModel):
    status: str
    output: str = ''
    errors: str = ''


class FileItem(BaseModel):
    name: str
    path: str
    type: str  # 'file' or 'directory'
    size: Optional[int] = None
    modified: Optional[str] = None
    permissions: Optional[Dict[str, Any]] = None  # 权限信息


class FilePermission(BaseModel):
    path: str
    read: bool = True
    write: bool = True
    delete: bool = True
    owner: Optional[str] = None


class SaveCodeRequest(BaseModel):
    path: str
    content: str


class DatabaseConnection(BaseModel):
    name: str
    type: str  # 'postgres', 'starrocks', 'mysql', etc.
    host: str
    port: int
    database: str
    username: str
    password: str
    connection_string: Optional[str] = None


class DatabaseConnectionResponse(BaseModel):
    id: str
    name: str
    type: str
    connection_string: str
    created_at: Optional[str] = None


class VenvCreate(BaseModel):
    name: str  # 环境名称，对应目录名


class VenvItem(BaseModel):
    id: str  # 目录名
    name: str
    path: str  # 绝对路径
    python_path: str  # Python 可执行文件路径


class ExecutionHistory(BaseModel):
    id: str
    code: str
    kernel_type: str
    language: str
    output: str = ''
    errors: str = ''
    status: str  # 'success', 'error', 'running'
    execution_time: float  # 执行耗时（秒）
    created_at: str
    session_id: Optional[str] = None
    file_path: Optional[str] = None  # 执行的代码所在文件路径（文件管理下的路径，如 folder/foo.py）
