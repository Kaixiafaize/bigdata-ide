"""
Kernel 管理服务
"""
import asyncio
import logging
import uuid
from typing import Dict, Any, Optional

from jupyter_client import AsyncKernelManager, AsyncKernelClient
from jupyter_client.kernelspec import KernelSpecManager, KernelSpec

from config import KERNEL_CONFIGS

logger = logging.getLogger(__name__)


class KernelService:
    """Kernel 管理服务类"""
    
    def __init__(self):
        self.kernel_managers: Dict[str, AsyncKernelManager] = {}
        self.kernel_clients: Dict[str, AsyncKernelClient] = {}
        self.session_to_kernel: Dict[str, str] = {}  # session_id -> kernel_id
        self.session_to_kernel_type: Dict[str, str] = {}  # session_id -> kernel_type
        self.kernel_spec_manager = KernelSpecManager()
    
    async def initialize_ipython_sql(self, kc: AsyncKernelClient, kernel_type: str, config: Dict[str, Any]):
        """初始化 ipython-sql 扩展"""
        init_code = """
# 加载 ipython-sql 扩展
%load_ext sql

# 根据 kernel 类型设置默认连接（用户可以在代码中修改）
"""
        
        if kernel_type == 'postgres':
            init_code += """
# PostgreSQL 连接示例（需要用户提供实际连接信息）
# %sql postgresql://user:password@localhost/dbname
print("PostgreSQL SQL 环境已初始化")
print("使用 %sql 或 %%sql 执行 SQL 查询")
print("示例: %sql SELECT 1")
"""
        elif kernel_type == 'starrocks':
            init_code += """
# StarRocks 连接示例（使用 MySQL 协议）
# %sql mysql+pymysql://user:password@host:port/database
print("StarRocks SQL 环境已初始化")
print("使用 %sql 或 %%sql 执行 SQL 查询")
print("示例: %sql SELECT 1")
"""
        
        # 执行初始化代码
        try:
            msg_id = kc.execute(init_code)
            # 等待执行完成
            while True:
                try:
                    msg = await asyncio.wait_for(kc.get_iopub_msg(), timeout=2.0)
                    if msg['header']['msg_type'] == 'status' and msg['content'].get('execution_state') == 'idle':
                        break
                except asyncio.TimeoutError:
                    break
            logger.info(f"Initialized ipython-sql for {kernel_type}")
        except Exception as e:
            logger.warning(f"Failed to initialize ipython-sql: {e}")
    
    def wrap_sql_code(self, code: str, kernel_type: str) -> str:
        """包装 SQL 代码为 ipython-sql magic 命令"""
        # 如果代码已经包含 %sql 或 %%sql，直接返回
        if code.strip().startswith('%sql') or code.strip().startswith('%%sql'):
            return code
        
        # 检查是否是 SQL 语句（简单检测）
        sql_keywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 
                       'WITH', 'EXPLAIN', 'SHOW', 'DESC', 'DESCRIBE']
        code_upper = code.strip().upper()
        is_sql = any(code_upper.startswith(kw) for kw in sql_keywords)
        
        if is_sql:
            # 多行 SQL 使用 %%sql
            if '\n' in code.strip():
                return f"%%sql\n{code}"
            else:
                # 单行 SQL 使用 %sql
                return f"%sql {code}"
        
        # 如果不是明显的 SQL，也尝试用 %sql 包装（让 ipython-sql 处理）
        return f"%sql {code}"
    
    async def create_session(
        self,
        kernel_type: str,
        path: Optional[str] = None,
        python_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """创建会话。python_path 不为空时使用该 Python 启动 kernel（用于虚拟环境）。"""
        if kernel_type not in KERNEL_CONFIGS:
            raise ValueError(f"Unsupported kernel type: {kernel_type}")
        
        config = KERNEL_CONFIGS[kernel_type]
        kernel_name = config['name']
        
        # 生成 session_id 和 kernel_id
        session_id = path or f"session_{uuid.uuid4().hex[:8]}"
        kernel_id = f"kernel_{uuid.uuid4().hex[:8]}"
        
        if python_path:
            # 使用指定 Python（虚拟环境）启动 kernel
            spec = KernelSpec(
                argv=[python_path, "-m", "ipykernel", "-f", "{connection_file}"],
                display_name=config.get('display_name', 'Python') + f" ({python_path})",
                language=config.get('language', 'python'),
            )
            km = AsyncKernelManager(kernel_spec=spec)
        else:
            # 使用系统 kernel spec
            try:
                specs = self.kernel_spec_manager.get_all_specs()
                if kernel_name not in specs:
                    if 'fallback' in config:
                        kernel_name = config['fallback']
                        logger.info(f"Kernel '{config['name']}' not found, using fallback '{kernel_name}'")
                    else:
                        raise ValueError(f"Kernel '{kernel_name}' not available")
            except Exception as e:
                logger.warning(f"Error checking kernel spec: {e}")
            km = AsyncKernelManager(kernel_name=kernel_name)
        
        await km.start_kernel()
        
        # 创建 kernel client
        kc = km.client()
        kc.start_channels()
        
        # 保存映射
        self.kernel_managers[kernel_id] = km
        self.kernel_clients[kernel_id] = kc
        self.session_to_kernel[session_id] = kernel_id
        self.session_to_kernel_type[session_id] = kernel_type
        
        # 如果是 SQL kernel，初始化 ipython-sql
        if config.get('use_ipython_sql'):
            await self.initialize_ipython_sql(kc, kernel_type, config)
        
        logger.info(f"Created session {session_id} with kernel {kernel_id} (type: {kernel_type}, name: {kernel_name})")
        
        return {
            'id': session_id,
            'kernel': {
                'id': kernel_id,
                'name': kernel_name,
            },
            'kernel_type': kernel_type,
            'kernel_config': config,
        }
    
    def get_session(self, session_id: str) -> Dict[str, Any]:
        """获取会话信息"""
        if session_id not in self.session_to_kernel:
            raise ValueError("Session not found")
        
        kernel_id = self.session_to_kernel[session_id]
        if kernel_id not in self.kernel_managers:
            raise ValueError("Kernel not found")
        
        km = self.kernel_managers[kernel_id]
        
        return {
            'id': session_id,
            'kernel': {
                'id': kernel_id,
                'name': km.kernel_name,
            },
        }
    
    async def delete_session(self, session_id: str):
        """删除会话"""
        if session_id not in self.session_to_kernel:
            raise ValueError("Session not found")
        
        kernel_id = self.session_to_kernel[session_id]
        
        # 关闭 kernel client
        if kernel_id in self.kernel_clients:
            kc = self.kernel_clients[kernel_id]
            kc.stop_channels()
            del self.kernel_clients[kernel_id]
        
        # 关闭 kernel manager
        if kernel_id in self.kernel_managers:
            km = self.kernel_managers[kernel_id]
            await km.shutdown_kernel(now=True)
            del self.kernel_managers[kernel_id]
        
        # 删除映射
        del self.session_to_kernel[session_id]
        self.session_to_kernel_type.pop(session_id, None)
        
        logger.info(f"Deleted session {session_id} and kernel {kernel_id}")
    
    def get_kernel_client(self, session_id: str) -> AsyncKernelClient:
        """获取 kernel client"""
        if session_id not in self.session_to_kernel:
            raise ValueError("Session not found")
        
        kernel_id = self.session_to_kernel[session_id]
        if kernel_id not in self.kernel_clients:
            raise ValueError("Kernel client not found")
        
        return self.kernel_clients[kernel_id]
    
    def get_kernel_type(self, session_id: str) -> str:
        """获取 kernel 类型"""
        return self.session_to_kernel_type.get(session_id, 'python')
    
    async def shutdown_all(self):
        """关闭所有 kernel"""
        logger.info("Shutting down all kernels...")
        for kernel_id, km in list(self.kernel_managers.items()):
            try:
                await km.shutdown_kernel(now=True)
            except Exception as e:
                logger.error(f"Error shutting down kernel {kernel_id}: {e}")
        self.kernel_managers.clear()
        self.kernel_clients.clear()
        self.session_to_kernel.clear()
        self.session_to_kernel_type.clear()


# 全局 kernel 服务实例
kernel_service = KernelService()
