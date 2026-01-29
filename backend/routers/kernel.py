"""
Kernel 相关路由
"""
import asyncio
import json
import logging
import re
from typing import Dict, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from jupyter_client.kernelspec import KernelSpecManager

import time

from config import KERNEL_CONFIGS
from models.schemas import SessionCreate, ExecuteRequest, ExecuteResponse
from services.kernel_service import kernel_service
from services.history_service import history_service
from services.venv_service import get_venv_python

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bigdata-ide", tags=["kernel"])


ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*m")


def strip_ansi(text: str) -> str:
    """去掉 Jupyter 返回中的 ANSI 颜色控制符，避免前端出现乱码。"""
    if not isinstance(text, str):
        return text
    return ANSI_ESCAPE_RE.sub("", text)


@router.get("/kernel-types")
async def get_kernel_types():
    """获取可用的 kernel 类型"""
    try:
        specs = kernel_service.kernel_spec_manager.get_all_specs()
        available_kernels = set(specs.keys())
    except Exception as e:
        logger.warning(f"Error getting kernel specs: {e}")
        available_kernels = set()
    
    kernel_types = []
    for key, config in KERNEL_CONFIGS.items():
        kernel_name = config['name']
        is_available = kernel_name in available_kernels
        
        # 如果不可用但有 fallback，标记为可用但使用 fallback
        if not is_available and 'fallback' in config:
            is_available = config['fallback'] in available_kernels
            kernel_name = config['fallback']
        # 如果使用 ipython-sql，只需要 python3 kernel
        elif config.get('use_ipython_sql'):
            is_available = 'python3' in available_kernels
            kernel_name = 'python3'
        
        kernel_types.append({
            'id': key,
            'name': config['display_name'],
            'language': config['language'],
            'kernel_spec': kernel_name,
            'available': is_available,
        })
    
    return {'kernel_types': kernel_types, 'status': 'ok'}


@router.post("/sessions")
async def create_session(session_data: SessionCreate):
    """创建会话。可选 venv_id：使用该虚拟环境的 Python 启动 kernel。"""
    python_path = None
    if session_data.venv_id:
        python_path = get_venv_python(session_data.venv_id)
        if not python_path:
            raise HTTPException(status_code=400, detail=f"虚拟环境不存在: {session_data.venv_id}")
    try:
        result = await kernel_service.create_session(
            session_data.kernel_type,
            session_data.path,
            python_path=python_path,
        )
        result['status'] = 'ok'
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """获取会话信息"""
    try:
        result = kernel_service.get_session(session_id)
        result['status'] = 'ok'
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """删除会话"""
    try:
        await kernel_service.delete_session(session_id)
        return {'status': 'ok'}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/execute", response_model=ExecuteResponse)
async def execute_code(request: ExecuteRequest):
    """执行代码"""
    try:
        kc = kernel_service.get_kernel_client(request.session_id)
        kernel_type = kernel_service.get_kernel_type(request.session_id)
        config = KERNEL_CONFIGS.get(kernel_type, {})
        
        # 如果是 SQL kernel，包装代码
        code_to_execute = request.code
        if config.get('use_ipython_sql'):
            code_to_execute = kernel_service.wrap_sql_code(request.code, kernel_type)
        
        # 执行代码
        msg_id = kc.execute(code_to_execute)
        
        # 等待执行结果
        output = []
        errors = []
        execution_state = 'busy'
        
        # 获取 iopub 消息
        while True:
            try:
                msg = await asyncio.wait_for(kc.get_iopub_msg(), timeout=1.0)
                msg_type = msg['header']['msg_type']
                content = msg['content']
                
                if msg_type == 'stream':
                    text = strip_ansi(content.get('text', ''))
                    output.append(text)
                elif msg_type == 'execute_result':
                    data = content.get('data', {})
                    result = data.get('text/plain', '') or data.get('text/html', '') or str(data)
                    result = strip_ansi(result)
                    output.append(result)
                elif msg_type == 'display_data':
                    data = content.get('data', {})
                    display_text = data.get('text/plain', '') or data.get('text/html', '') or str(data)
                    display_text = strip_ansi(display_text)
                    output.append(display_text)
                elif msg_type == 'error':
                    traceback = content.get('traceback', [])
                    if traceback:
                        errors.append(strip_ansi('\n'.join(traceback)))
                    else:
                        errors.append(strip_ansi(f"{content.get('ename', 'Error')}: {content.get('evalue', '')}"))
                elif msg_type == 'status':
                    execution_state = content.get('execution_state', 'idle')
                    if execution_state == 'idle':
                        break
            except asyncio.TimeoutError:
                # 检查 shell 消息
                try:
                    shell_msg = await asyncio.wait_for(kc.get_shell_msg(timeout=0.1), timeout=0.1)
                    if shell_msg['header']['msg_type'] == 'execute_reply':
                        if shell_msg['content'].get('status') == 'error':
                            traceback = shell_msg['content'].get('traceback', [])
                            if traceback:
                                errors.append(strip_ansi('\n'.join(traceback)))
                        break
                except asyncio.TimeoutError:
                    break
        
        # 获取最终的 shell 消息
        try:
            shell_msg = await asyncio.wait_for(kc.get_shell_msg(timeout=0.5), timeout=0.5)
            if shell_msg['header']['msg_type'] == 'execute_reply':
                if shell_msg['content'].get('status') == 'error':
                    traceback = shell_msg['content'].get('traceback', [])
                    if traceback and not errors:
                        errors.append(strip_ansi('\n'.join(traceback)))
        except asyncio.TimeoutError:
            pass
        
        return ExecuteResponse(
            status='ok' if not errors else 'error',
            output=''.join(output) if output else '',
            errors='\n'.join(errors) if errors else '',
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error executing code: {e}", exc_info=True)
        return ExecuteResponse(
            status='error',
            output='',
            errors=str(e),
        )


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket 端点，用于实时代码执行"""
    await websocket.accept()
    
    try:
        kc = kernel_service.get_kernel_client(session_id)
        kernel_type = kernel_service.get_kernel_type(session_id)
        config = KERNEL_CONFIGS.get(kernel_type, {})
    except ValueError as e:
        await websocket.close(code=1008, reason=str(e))
        return
    
    try:
        while True:
            # 接收消息
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get('type') == 'execute':
                code = message.get('code', '')
                start_time = time.time()
                
                # 如果是 SQL kernel，包装代码
                code_to_execute = code
                if config.get('use_ipython_sql'):
                    code_to_execute = kernel_service.wrap_sql_code(code, kernel_type)
                
                # 执行代码
                msg_id = kc.execute(code_to_execute)
                
                # 发送执行开始消息
                await websocket.send_json({
                    'type': 'status',
                    'status': 'executing'
                })
                
                # 处理执行结果
                output = []
                errors = []
                
                while True:
                    try:
                        msg = await asyncio.wait_for(kc.get_iopub_msg(), timeout=1.0)
                        msg_type = msg['header']['msg_type']
                        content = msg['content']
                        
                        if msg_type == 'stream':
                            text = strip_ansi(content.get('text', ''))
                            output.append(text)
                            await websocket.send_json({
                                'type': 'stream',
                                'output': text
                            })
                        elif msg_type == 'execute_result':
                            data = content.get('data', {})
                            result = data.get('text/plain', '') or data.get('text/html', '') or str(data)
                            result = strip_ansi(result)
                            output.append(result)
                            await websocket.send_json({
                                'type': 'result',
                                'output': result
                            })
                        elif msg_type == 'error':
                            traceback = content.get('traceback', [])
                            if traceback:
                                error_msg = strip_ansi('\n'.join(traceback))
                            else:
                                error_msg = strip_ansi(f"{content.get('ename', 'Error')}: {content.get('evalue', '')}")
                            errors.append(error_msg)
                            await websocket.send_json({
                                'type': 'error',
                                'error': error_msg
                            })
                        elif msg_type == 'status':
                            exec_state = content.get('execution_state', 'idle')
                            await websocket.send_json({
                                'type': 'status',
                                'status': exec_state
                            })
                            if exec_state == 'idle':
                                break
                    except asyncio.TimeoutError:
                        # 检查 shell 消息
                        try:
                            shell_msg = await asyncio.wait_for(kc.get_shell_msg(timeout=0.1), timeout=0.1)
                            if shell_msg['header']['msg_type'] == 'execute_reply':
                                if shell_msg['content'].get('status') == 'error':
                                    traceback = shell_msg['content'].get('traceback', [])
                                    if traceback:
                                        error_msg = strip_ansi('\n'.join(traceback))
                                        errors.append(error_msg)
                                        await websocket.send_json({
                                            'type': 'error',
                                            'error': error_msg
                                        })
                                await websocket.send_json({
                                    'type': 'status',
                                    'status': 'idle'
                                })
                                break
                        except asyncio.TimeoutError:
                            break
                
                # 计算执行时间
                execution_time = time.time() - start_time
                
                # 准备最终结果
                final_output = ''.join(output)
                final_errors = '\n'.join(errors) if errors else ''
                
                # 发送完成消息（不重复发送输出，因为已经通过 stream/result 发送过了）
                await websocket.send_json({
                    'type': 'complete',
                    'status': 'ok' if not final_errors else 'error'
                })
                
                # 记录执行历史
                try:
                    language = config.get('language', 'python')
                    status = 'error' if final_errors else 'success'
                    history_service.add_history(
                        code=code,
                        kernel_type=kernel_type,
                        language=language,
                        output=final_output,
                        errors=final_errors,
                        status=status,
                        execution_time=execution_time,
                        session_id=session_id
                    )
                except Exception as e:
                    logger.error(f"Error saving execution history: {e}", exc_info=True)
            
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        await websocket.close(code=1011, reason=str(e))
