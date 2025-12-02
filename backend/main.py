import asyncio
import json
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import sys
import os

# 添加src目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.services.kernel_manager import KernelManager, Kernel

# 初始化FastAPI应用
app = FastAPI(title="BigData IDE Kernel Gateway", version="0.1.0")

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局内核管理器
kernel_manager = KernelManager()

# 数据模型
from typing import Optional

class ExecuteRequest(BaseModel):
    language: str = "python"  # python 或 sql
    engine: Optional[str] = None  # None, spark, flink
    code: str
    session_id: Optional[str] = None

class ExecuteResponse(BaseModel):
    status: str  # ok, error
    output: str
    errors: str
    execution_id: str

class SessionResponse(BaseModel):
    session_id: str
    language: str
    engine: Optional[str]
    kernel_id: str

# 活跃会话存储
sessions = {}

@app.get("/")
async def root():
    """健康检查端点"""
    return {
        "status": "healthy",
        "service": "BigData IDE Kernel Gateway",
        "version": "0.1.0"
    }

@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "ok"}

@app.post("/api/sessions", response_model=SessionResponse)
async def create_session(language: str = "python", engine: Optional[str] = None):
    """
    创建新的执行会话
    
    - **language**: 编程语言 (python 或 sql)
    - **engine**: 执行引擎 (None, spark, flink)
    """
    # 验证语言
    if language not in ["python", "sql"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language: {language}. Use python or sql"
        )
    
    # 验证引擎
    if engine and engine not in [None, "spark", "flink"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported engine: {engine}. Use None, spark, or flink"
        )
    
    session_id = str(uuid.uuid4())
    kernel_id = await kernel_manager.create_kernel(language, engine)
    
    sessions[session_id] = {
        "language": language,
        "engine": engine,
        "kernel_id": kernel_id,
        "created_at": asyncio.get_event_loop().time()
    }
    
    return SessionResponse(
        session_id=session_id,
        language=language,
        engine=engine,
        kernel_id=kernel_id
    )

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """获取会话信息"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_info = sessions[session_id]
    return {
        "session_id": session_id,
        "language": session_info["language"],
        "engine": session_info["engine"],
        "kernel_id": session_info["kernel_id"],
        "status": "active"
    }

@app.post("/api/execute", response_model=ExecuteResponse)
async def execute_code(request: ExecuteRequest):
    """
    执行代码
    
    - **language**: 编程语言 (python 或 sql)
    - **engine**: 执行引擎 (None, spark, flink)
    - **code**: 要执行的代码
    - **session_id**: 可选，如果提供则使用已有会话
    """
    
    # 确保会话存在
    if request.session_id:
        if request.session_id not in sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        session = sessions[request.session_id]
        kernel_id = session["kernel_id"]
        language = session["language"]
        engine = session["engine"]
    else:
        # 创建新会话
        kernel_id = await kernel_manager.create_kernel(request.language, request.engine)
        language = request.language
        engine = request.engine
    
    try:
        # 执行代码
        result = await kernel_manager.execute_code(kernel_id, request.code)
        
        execution_id = str(uuid.uuid4())
        
        if result is not None:
            return ExecuteResponse(
                status=result.get('status', 'ok'),
                output=result.get('output', ''),
                errors=result.get('errors', ''),
                execution_id=execution_id
            )
        else:
            return ExecuteResponse(
                status="error",
                output="",
                errors="No result returned from kernel execution.",
                execution_id=execution_id
            )
    except Exception as e:
        return ExecuteResponse(
            status="error",
            output="",
            errors=str(e),
            execution_id=str(uuid.uuid4())
        )

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """删除会话"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions.pop(session_id)
    kernel = kernel_manager.get_kernel(session["kernel_id"])
    
    if kernel:
        # 尝试优雅停止（会取消心跳并终止子进程）
        try:
            await kernel.stop()
        except Exception:
            if getattr(kernel, 'process', None):
                try:
                    kernel.process.terminate()
                except Exception:
                    pass
    
    return {"status": "deleted", "session_id": session_id}

@app.websocket("/ws/sessions/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket端点，用于实时执行和流式结果
    """
    if session_id not in sessions:
        await websocket.close(code=4004, reason="Session not found")
        return
    
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                code = message.get("code", "")
                
                if not code:
                    await websocket.send_json({
                        "status": "error",
                        "message": "Code is required"
                    })
                    continue
                
                # 执行代码
                session = sessions[session_id]
                kernel_id = session["kernel_id"]
                
                result = await kernel_manager.execute_code(kernel_id, code)
                
                if result is not None:
                    await websocket.send_json({
                        "status": result.get('status', 'ok'),
                        "output": result.get('output', ''),
                        "errors": result.get('errors', '')
                    })
                else:
                    await websocket.send_json({
                        "status": "error",
                        "output": "",
                        "errors": "No result returned from kernel execution."
                    })
                
            except json.JSONDecodeError:
                await websocket.send_json({
                    "status": "error",
                    "message": "Invalid JSON"
                })
            except Exception as e:
                await websocket.send_json({
                    "status": "error",
                    "message": str(e)
                })
    
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await websocket.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8888)
