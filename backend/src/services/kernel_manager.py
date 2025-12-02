import asyncio
import json
import uuid
from typing import Dict, Any
import subprocess
from pathlib import Path
import sys
from io import StringIO

class Kernel:
    """单个内核实例"""
    def __init__(self, kernel_id: str, kernel_type: str):
        self.kernel_id = kernel_id
        self.kernel_type = kernel_type
        self.process = None
        self.connection_file = None
        self.clients = []  # 连接的WebSocket客户端
        
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
        kernels = {
            'python': 'python3',
            'spark': 'apache_toree_scala',
            'spark-sql': 'spark-sql',
            'flink': 'flink-sql'  # 需要自定义
        }
        return kernels.get(self.kernel_type, 'python3')
    
    def get_start_command(self):
        """获取启动命令"""
        if self.kernel_type == 'python':
            return ['python', '-m', 'ipykernel', '-f', str(self.connection_file)]
        elif self.kernel_type == 'spark':
            # 使用Toree内核
            return [
                'jupyter', 'toree', '--profile', 'spark',
                '--SparkContextInitializer', 'org.apache.toree.kernel.init.SparkInit',
                '--connection-file', str(self.connection_file)
            ]
        else:
            return ['python', '-m', 'ipykernel', '-f', str(self.connection_file)]

class KernelManager:
    """内核管理器"""
    def __init__(self):
        self.kernels: Dict[str, Kernel] = {}
        
    async def create_kernel(self, kernel_type: str) -> str:
        """创建新内核"""
        kernel_id = str(uuid.uuid4())
        kernel = Kernel(kernel_id, kernel_type)
        
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
        
        # 这里实现具体的代码执行逻辑
        # 使用jupyter_client与内核通信
        if kernel.kernel_type == 'python':
            return await self._execute_python(kernel, code)
        elif kernel.kernel_type == 'spark':
            return await self._execute_spark(kernel, code)
    
    async def _execute_python(self, kernel: Kernel, code: str):
        """执行Python代码"""
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
            # 使用compile检查语法
            compile(code, '<string>', 'exec')
            # 执行代码
            exec(code, {})
            result = output.getvalue()
            errors = error_output.getvalue()
            return {
                'status': 'ok',
                'output': result,
                'errors': errors
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
    
    async def _execute_spark(self, kernel: Kernel, code: str):
        """执行Spark代码"""
        try:
            # 这是一个简化的实现
            # 实际环境中应该通过jupyter_client与Spark内核通信
            return {
                'status': 'ok',
                'output': 'Spark execution not yet fully implemented',
                'errors': ''
            }
        except Exception as e:
            return {
                'status': 'error',
                'output': '',
                'errors': str(e)
            }