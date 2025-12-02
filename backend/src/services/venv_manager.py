"""
虚拟环境管理模块
支持为不同的引擎创建和管理独立的虚拟环境
"""

import subprocess
import sys
import os
from pathlib import Path
from typing import Optional, Dict
import json


class VenvManager:
    """虚拟环境管理器"""
    
    def __init__(self, base_dir: str = "/tmp/bigdata-ide-venvs"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        
        # 虚拟环境配置
        self.venvs = {
            'python': {
                'path': self.base_dir / 'venv_python',
                'packages': ['pandas', 'numpy', 'matplotlib'],
                'description': '普通 Python 环境'
            },
            'pyspark': {
                'path': self.base_dir / 'venv_pyspark',
                'packages': ['pyspark', 'pandas', 'numpy'],
                'description': 'PySpark 环境'
            },
            'pyflink': {
                'path': self.base_dir / 'venv_pyflink',
                'packages': ['apache-flink', 'pandas', 'numpy'],
                'description': 'PyFlink 环境'
            }
        }
        
    def get_venv_path(self, venv_type: str) -> Optional[Path]:
        """获取虚拟环境路径"""
        if venv_type not in self.venvs:
            return None
        return self.venvs[venv_type]['path']
    
    def get_python_executable(self, venv_type: str) -> Optional[str]:
        """获取虚拟环境的 Python 可执行文件路径"""
        venv_path = self.get_venv_path(venv_type)
        if not venv_path:
            return None
        
        python_path = venv_path / 'bin' / 'python'
        if python_path.exists():
            return str(python_path)
        
        # 在 Windows 上会在 Scripts 目录
        python_path = venv_path / 'Scripts' / 'python.exe'
        if python_path.exists():
            return str(python_path)
        
        return None
    
    def venv_exists(self, venv_type: str) -> bool:
        """检查虚拟环境是否已存在"""
        python_executable = self.get_python_executable(venv_type)
        return python_executable is not None and Path(python_executable).exists()
    
    def create_venv(self, venv_type: str, force: bool = False) -> bool:
        """
        创建虚拟环境
        
        Args:
            venv_type: 虚拟环境类型 (python, pyspark, pyflink)
            force: 是否强制重新创建
        
        Returns:
            bool: 是否创建成功
        """
        if venv_type not in self.venvs:
            print(f"❌ 未知的虚拟环境类型: {venv_type}")
            return False
        
        venv_info = self.venvs[venv_type]
        venv_path = venv_info['path']
        
        # 如果已存在且不强制重新创建，直接返回
        if self.venv_exists(venv_type) and not force:
            print(f"✅ 虚拟环境已存在: {venv_path}")
            return True
        
        # 移除旧的虚拟环境
        if venv_path.exists():
            print(f"🧹 移除旧虚拟环境: {venv_path}")
            subprocess.run(['rm', '-rf', str(venv_path)], check=False)
        
        # 创建新虚拟环境
        print(f"📦 创建虚拟环境: {venv_type} ({venv_info['description']})")
        try:
            subprocess.run(
                [sys.executable, '-m', 'venv', str(venv_path)],
                check=True,
                capture_output=True
            )
            print(f"✅ 虚拟环境创建成功: {venv_path}")
            
            # 安装所需包
            return self.install_packages(venv_type)
        
        except subprocess.CalledProcessError as e:
            print(f"❌ 创建虚拟环境失败: {e}")
            return False
    
    def install_packages(self, venv_type: str) -> bool:
        """
        安装虚拟环境所需的包
        
        Args:
            venv_type: 虚拟环境类型
        
        Returns:
            bool: 是否安装成功
        """
        if venv_type not in self.venvs:
            return False
        
        packages = self.venvs[venv_type]['packages']
        python_executable = self.get_python_executable(venv_type)
        
        if not python_executable:
            print(f"❌ 找不到虚拟环境: {venv_type}")
            return False
        
        print(f"📥 为 {venv_type} 安装包: {', '.join(packages)}")
        try:
            subprocess.run(
                [python_executable, '-m', 'pip', 'install', '-q', '--upgrade', 'pip'],
                check=True,
                capture_output=True
            )
            
            for package in packages:
                print(f"   安装 {package}...")
                try:
                    subprocess.run(
                        [python_executable, '-m', 'pip', 'install', '-q', package],
                        check=True,
                        capture_output=True,
                        timeout=120
                    )
                except subprocess.TimeoutExpired:
                    print(f"   ⏱️ {package} 安装超时，跳过")
                except subprocess.CalledProcessError as e:
                    print(f"   ⚠️  {package} 安装失败，继续...")
            
            print(f"✅ 包安装完成")
            return True
        
        except subprocess.CalledProcessError as e:
            print(f"❌ 安装失败: {e}")
            return False
    
    def get_environment(self, venv_type: str) -> Optional[Dict[str, str]]:
        """
        获取虚拟环境的环境变量
        
        Returns:
            dict: 环境变量，可直接用于 subprocess
        """
        python_executable = self.get_python_executable(venv_type)
        if not python_executable:
            return None
        
        env = os.environ.copy()
        venv_path = self.get_venv_path(venv_type)
        
        # 设置虚拟环境相关的环境变量
        env['VIRTUAL_ENV'] = str(venv_path)
        bin_path = venv_path / 'bin'
        env['PATH'] = f"{bin_path}:{env.get('PATH', '')}"
        
        return env
    
    def initialize_all_venvs(self) -> bool:
        """
        初始化所有虚拟环境
        通常在启动时调用一次
        
        Returns:
            bool: 是否全部初始化成功
        """
        print("🚀 初始化所有虚拟环境...")
        print("=" * 50)
        
        all_success = True
        for venv_type in self.venvs:
            if not self.create_venv(venv_type):
                all_success = False
        
        print("=" * 50)
        if all_success:
            print("✅ 所有虚拟环境初始化成功")
        else:
            print("⚠️  部分虚拟环境初始化失败")
        
        return all_success
    
    def get_status(self) -> Dict:
        """获取所有虚拟环境的状态"""
        status = {}
        for venv_type, info in self.venvs.items():
            exists = self.venv_exists(venv_type)
            status[venv_type] = {
                'exists': exists,
                'path': str(info['path']),
                'description': info['description'],
                'packages': info['packages']
            }
        return status
