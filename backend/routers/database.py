"""
数据库连接管理路由
"""
import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException

from models.schemas import DatabaseConnection, DatabaseConnectionResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bigdata-ide", tags=["database"])

# 临时存储数据库连接（实际应用中应该使用数据库）
_db_connections: Dict[str, Dict] = {}


def _build_connection_string(conn: DatabaseConnection) -> str:
    """构建数据库连接字符串"""
    if conn.connection_string:
        return conn.connection_string
    
    if conn.type == 'postgres':
        return f"postgresql://{conn.username}:{conn.password}@{conn.host}:{conn.port}/{conn.database}"
    elif conn.type in ['starrocks', 'mysql']:
        return f"mysql+pymysql://{conn.username}:{conn.password}@{conn.host}:{conn.port}/{conn.database}"
    else:
        raise ValueError(f"Unsupported database type: {conn.type}")


@router.get("/database/connections")
async def list_connections():
    """列出所有数据库连接"""
    connections = []
    for conn_id, conn_data in _db_connections.items():
        connections.append(DatabaseConnectionResponse(
            id=conn_id,
            name=conn_data['name'],
            type=conn_data['type'],
            connection_string=conn_data['connection_string'],
            created_at=conn_data.get('created_at')
        ))
    return {'connections': connections, 'status': 'ok'}


@router.post("/database/connections")
async def create_connection(conn: DatabaseConnection):
    """创建数据库连接"""
    try:
        connection_string = _build_connection_string(conn)
        conn_id = str(uuid.uuid4())
        
        _db_connections[conn_id] = {
            'id': conn_id,
            'name': conn.name,
            'type': conn.type,
            'host': conn.host,
            'port': conn.port,
            'database': conn.database,
            'username': conn.username,
            'password': conn.password,  # 实际应用中应该加密存储
            'connection_string': connection_string,
            'created_at': datetime.now().isoformat()
        }
        
        logger.info(f"Created database connection: {conn.name} ({conn.type})")
        
        return DatabaseConnectionResponse(
            id=conn_id,
            name=conn.name,
            type=conn.type,
            connection_string=connection_string,
            created_at=_db_connections[conn_id]['created_at']
        )
    except Exception as e:
        logger.error(f"Error creating connection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/database/connections/{conn_id}")
async def get_connection(conn_id: str):
    """获取数据库连接详情（包含完整信息）"""
    if conn_id not in _db_connections:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    conn_data = _db_connections[conn_id]
    # 返回完整信息用于编辑（注意：实际应用中密码应该加密存储）
    return {
        'id': conn_id,
        'name': conn_data['name'],
        'type': conn_data['type'],
        'host': conn_data['host'],
        'port': conn_data['port'],
        'database': conn_data['database'],
        'username': conn_data['username'],
        'password': conn_data['password'],  # 实际应用中应该解密
        'connection_string': conn_data['connection_string'],
        'created_at': conn_data.get('created_at')
    }


@router.put("/database/connections/{conn_id}")
async def update_connection(conn_id: str, conn: DatabaseConnection):
    """更新数据库连接"""
    if conn_id not in _db_connections:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        connection_string = _build_connection_string(conn)
        
        _db_connections[conn_id].update({
            'name': conn.name,
            'type': conn.type,
            'host': conn.host,
            'port': conn.port,
            'database': conn.database,
            'username': conn.username,
            'password': conn.password,
            'connection_string': connection_string,
        })
        
        logger.info(f"Updated database connection: {conn.name}")
        
        return DatabaseConnectionResponse(
            id=conn_id,
            name=conn.name,
            type=conn.type,
            connection_string=connection_string,
            created_at=_db_connections[conn_id].get('created_at')
        )
    except Exception as e:
        logger.error(f"Error updating connection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/database/connections/{conn_id}")
async def delete_connection(conn_id: str):
    """删除数据库连接"""
    if conn_id not in _db_connections:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    conn_name = _db_connections[conn_id]['name']
    del _db_connections[conn_id]
    
    logger.info(f"Deleted database connection: {conn_name}")
    return {'status': 'ok', 'id': conn_id}


@router.post("/database/connections/{conn_id}/test")
async def test_connection(conn_id: str):
    """测试数据库连接"""
    if conn_id not in _db_connections:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    try:
        conn_data = _db_connections[conn_id]
        connection_string = conn_data['connection_string']
        
        # 尝试连接数据库
        from sqlalchemy import create_engine, text
        
        engine = create_engine(connection_string)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        return {'status': 'ok', 'message': 'Connection successful'}
    except Exception as e:
        logger.error(f"Connection test failed: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")
