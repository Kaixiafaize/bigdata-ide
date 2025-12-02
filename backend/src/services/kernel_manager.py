import asyncio
import json
import uuid
from typing import Dict, Any, Optional
import subprocess
from pathlib import Path
import sys
from io import StringIO
import os

# 导入虚拟环境管理器
try:
    from .venv_manager import VenvManager
except ImportError:
    from venv_manager import VenvManager

class Kernel:
    """单个内核实例
    
    支持多种语言和引擎的组合：
    - language: 'python' 或 'sql'
    - engine: None (无引擎)、'spark'、'flink'
    """
    def __init__(self, kernel_id: str, language: str, engine: Optional[str] = None):
        self.kernel_id = kernel_id
        self.language = language  # 'python' 或 'sql'
        self.engine = engine      # None, 'spark', 'flink'
        self.process = None
        self.connection_file = None
        self.clients = []  # 连接的WebSocket客户端
        self.venv_manager = VenvManager()
        
    async def start(self):
        """启动内核进程"""
        kernel_dir = Path(f"/tmp/kernels/{self.kernel_id}")
        kernel_dir.mkdir(parents=True, exist_ok=True)
        
        # 生成连接配置文件
        self.connection_file = kernel_dir / "connection.json"
        connection_info = {
            "shell_port": 57503,
            "iopub_port": 57504,
            "stdin_port": 57505,
            "hb_port": 57506,
            "ip": "127.0.0.1",
            "key": str(uuid.uuid4()),
            "transport": "tcp",
            "signature_scheme": "hmac-sha256",
            "kernel_name": self.get_kernel_name()
        }
        
        with open(self.connection_file, 'w') as f:
            json.dump(connection_info, f)
        
        # 启动内核进程
        cmd = self.get_start_command()
        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(kernel_dir)
        )
        
        return connection_info
    
    def get_kernel_name(self):
        """获取内核名称"""
        if self.language == 'python':
            if self.engine == 'spark':
                return 'pyspark'
            elif self.engine == 'flink':
                return 'pyflink'
            else:
                return 'python3'
        elif self.language == 'sql':
            if self.engine == 'spark':
                return 'spark-sql'
            elif self.engine == 'flink':
                return 'flink-sql'
            else:
                return 'sql'  # 普通 SQL
        return 'python3'
    
    def get_start_command(self):
        """获取启动命令
        
        根据语言和引擎组合返回相应的启动命令
        """
        if self.language == 'python':
            # 获取对应虚拟环境的 Python 可执行文件
            if self.engine == 'spark':
                venv_type = 'pyspark'
            elif self.engine == 'flink':
                venv_type = 'pyflink'
            else:
                venv_type = 'python'
            
            python_exe = self.venv_manager.get_python_executable(venv_type)
            if python_exe:
                return [python_exe, '-m', 'ipykernel', '-f', str(self.connection_file)]
            else:
                # 回退到系统 Python
                return ['python', '-m', 'ipykernel', '-f', str(self.connection_file)]
        
        elif self.language == 'sql':
            # SQL 全部使用 Python 的 sqlite3，不需要外部命令
            # 返回一个 Python 脚本作为伪内核
            return ['python', '-m', 'ipykernel', '-f', str(self.connection_file)]
        
        return ['python', '-m', 'ipykernel', '-f', str(self.connection_file)]

class KernelManager:
    """内核管理器
    
    支持多语言多引擎的内核创建和管理
    """
    def __init__(self):
        self.kernels: Dict[str, Kernel] = {}
        self.venv_manager = VenvManager()
        
    async def create_kernel(self, language: str, engine: Optional[str] = None) -> str:
        """创建新内核
        
        Args:
            language: 编程语言 ('python' 或 'sql')
            engine: 执行引擎 (None, 'spark', 'flink')
        
        Returns:
            内核 ID
        """
        # 验证语言和引擎的组合
        if language not in ['python', 'sql']:
            raise ValueError(f"Unsupported language: {language}")
        
        if engine and engine not in ['spark', 'flink']:
            raise ValueError(f"Unsupported engine: {engine}")
        
        # Python 需要虚拟环境，SQL 不需要
        if language == 'python':
            # 确定虚拟环境类型
            if engine == 'spark':
                venv_type = 'pyspark'
            elif engine == 'flink':
                venv_type = 'pyflink'
            else:
                venv_type = 'python'
            
            # 创建虚拟环境（如果不存在），有错误也继续
            try:
                if not self.venv_manager.venv_exists(venv_type):
                    print(f"[KernelManager] Creating venv for {venv_type}...")
                    self.venv_manager.create_venv(venv_type)
            except Exception as e:
                print(f"[KernelManager] Warning: Failed to create venv {venv_type}: {e}")
        
        kernel_id = str(uuid.uuid4())
        kernel = Kernel(kernel_id, language, engine)
        
        await kernel.start()
        self.kernels[kernel_id] = kernel
        
        return kernel_id
    
    def get_kernel(self, kernel_id: str):
        """获取内核实例"""
        return self.kernels.get(kernel_id)
    
    async def execute_code(self, kernel_id: str, code: str):
        """执行代码"""
        kernel = self.get_kernel(kernel_id)
        if not kernel:
            raise ValueError(f"Kernel {kernel_id} not found")
        
        # 根据语言选择不同的执行方式
        if kernel.language == 'python':
            return await self._execute_python(kernel, code)
        elif kernel.language == 'sql':
            return await self._execute_sql(kernel, code)
        else:
            raise ValueError(f"Unsupported language: {kernel.language}")
    
    async def _execute_python(self, kernel: Kernel, code: str):
        """执行 Python 代码
        
        支持普通 Python、PySpark、PyFlink
        """
        # 检查代码是否为空
        if not code or not code.strip():
            return {
                'status': 'ok',
                'output': '',
                'errors': ''
            }
        
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        sys.stdout = output = StringIO()
        sys.stderr = error_output = StringIO()
        
        try:
            # 获取对应虚拟环境的环境变量
            if kernel.engine == 'spark':
                venv_type = 'pyspark'
            elif kernel.engine == 'flink':
                venv_type = 'pyflink'
            else:
                venv_type = 'python'
            
            env = self.venv_manager.get_environment(venv_type)
            
            # 对于普通 Python，可以直接执行
            # 对于 PySpark/PyFlink，则需要通过虚拟环境运行
            if kernel.engine:
                # 使用虚拟环境中的 Python 执行
                python_exe = self.venv_manager.get_python_executable(venv_type)
                if python_exe:
                    # 通过子进程执行（这样可以完全隔离环境）
                    result = subprocess.run(
                        [python_exe, '-c', code],
                        capture_output=True,
                        text=True,
                        env=env,
                        timeout=30
                    )
                    return {
                        'status': 'ok' if result.returncode == 0 else 'error',
                        'output': result.stdout,
                        'errors': result.stderr
                    }
            
            # 普通 Python 直接在当前进程执行
            compile(code, '<string>', 'exec')
            exec(code, {})
            result = output.getvalue()
            errors = error_output.getvalue()
            return {
                'status': 'ok',
                'output': result,
                'errors': errors
            }
        except subprocess.TimeoutExpired:
            return {
                'status': 'error',
                'output': '',
                'errors': 'Execution timeout (30s)'
            }
        except SyntaxError as e:
            return {
                'status': 'error',
                'output': '',
                'errors': f'SyntaxError: {str(e)}'
            }
        except Exception as e:
            return {
                'status': 'error',
                'output': '',
                'errors': f'{type(e).__name__}: {str(e)}'
            }
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr
    
    async def _execute_sql(self, kernel: Kernel, code: str):
        """执行 SQL 代码
        
        支持普通 SQL、Spark SQL、Flink SQL
        注：Spark SQL 和 Flink SQL 也使用 SQLite 实现（完整功能需要完整的 Spark/Flink 环境）
        """
        # 检查代码是否为空
        if not code or not code.strip():
            return {
                'status': 'ok',
                'output': '',
                'errors': ''
            }
        
        try:
            # 所有 SQL 都使用 SQLite（作为通用 SQL 实现）
            return await self._execute_sqlite(code)
        
        except Exception as e:
            return {
                'status': 'error',
                'output': '',
                'errors': f'{type(e).__name__}: {str(e)}'
            }
    
    async def _execute_sqlite(self, code: str):
        """执行 SQLite SQL"""
        import sqlite3
        
        try:
            conn = sqlite3.connect(':memory:')
            cursor = conn.cursor()
            cursor.execute(code)
            
            # 获取结果
            if code.strip().upper().startswith('SELECT'):
                results = cursor.fetchall()
                output = '\n'.join([str(row) for row in results])
            else:
                output = f"Rows affected: {cursor.rowcount}"
            
            conn.close()
            return {
                'status': 'ok',
                'output': output,
                'errors': ''
            }
        
        except Exception as e:
            return {
                'status': 'error',
                'output': '',
                'errors': f'SQL Error: {str(e)}'
            }