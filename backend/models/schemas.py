"""
数据模型定义
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel


class SessionCreate(BaseModel):
    kernel_type: str = 'python'
    path: Optional[str] = None


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
