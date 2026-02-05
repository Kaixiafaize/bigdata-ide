"""
虚拟环境管理：本地缓存 + 可选 MinIO 持久化 + 业务库 venv_meta 表。
- 创建：本地建 venv → 打包上传 MinIO，写入 venv_meta。
- 列举：从 MinIO 列举（若启用），path/python_path 仅在本机已缓存时填充。
- 使用：get_venv_python 时若本地无则从 MinIO 下载解压到缓存再返回路径。
- 删除：从 MinIO、本地缓存、venv_meta 同时删除。
"""
import os
import sys
import logging
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path
from io import BytesIO
from typing import List, Optional

from config import VENV_BASE_DIR, VENV_USE_MINIO, VENV_MINIO_PREFIX
from services.db import get_conn

logger = logging.getLogger(__name__)


def _venv_python(venv_root: Path) -> Optional[Path]:
    """返回 venv 内 Python 可执行文件路径，不存在返回 None。"""
    if sys.platform == "win32":
        exe = venv_root / "Scripts" / "python.exe"
    else:
        exe = venv_root / "bin" / "python"
    return exe if exe.is_file() else None


def _venv_object_key(venv_id: str) -> str:
    """MinIO 中该 venv 归档的对象键。"""
    return f"{VENV_MINIO_PREFIX.rstrip('/')}/{venv_id}.tar.gz"


def _minio_available() -> bool:
    if not VENV_USE_MINIO:
        return False
    try:
        from services.file_service import file_service
        return file_service.is_available()
    except Exception:
        return False


def ensure_base_dir() -> Path:
    """确保 VENV_BASE_DIR 存在并返回 Path。"""
    p = Path(VENV_BASE_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _ensure_local_venv(venv_id: str) -> Optional[Path]:
    """
    确保 venv 在本地缓存存在；若 MinIO 启用且本地无则下载解压。
    返回本地 venv 根目录 Path，不存在或不可用则返回 None。
    """
    base = Path(VENV_BASE_DIR)
    venv_root = base / venv_id
    if venv_root.is_dir() and _venv_python(venv_root):
        return venv_root
    if not _minio_available():
        return venv_root if venv_root.is_dir() else None
    from services.file_service import file_service
    key = _venv_object_key(venv_id)
    try:
        data = file_service.client.get_object(file_service.bucket, key)
        buf = BytesIO(data.read())
        data.close()
        base.mkdir(parents=True, exist_ok=True)
        with tarfile.open(fileobj=buf, mode="r:gz") as tar:
            tar.extractall(path=base)
        if venv_root.is_dir() and _venv_python(venv_root):
            logger.info("Venv %s restored from MinIO to local cache", venv_id)
            return venv_root
    except Exception as e:
        logger.warning("Failed to restore venv %s from MinIO: %s", venv_id, e)
    return None


def list_venvs() -> List[dict]:
    """列举虚拟环境。启用 MinIO 时从 MinIO 列举，path/python_path 仅在本机已缓存时填充。"""
    base = ensure_base_dir()
    if _minio_available():
        from services.file_service import file_service
        prefix = VENV_MINIO_PREFIX if VENV_MINIO_PREFIX.endswith("/") else VENV_MINIO_PREFIX + "/"
        objects = file_service.client.list_objects(
            file_service.bucket, prefix=prefix, recursive=True
        )
        result = []
        suffix = ".tar.gz"
        for obj in objects:
            name = getattr(obj, "object_name", None) or ""
            if not name.endswith(suffix) or not name.startswith(prefix):
                continue
            venv_id = name[len(prefix): -len(suffix)].strip("/")
            if "/" in venv_id:
                continue
            if not venv_id:
                continue
            venv_root = base / venv_id
            python_path = _venv_python(venv_root) if venv_root.is_dir() else None
            result.append({
                "id": venv_id,
                "name": venv_id,
                "path": str(venv_root.resolve()) if venv_root.is_dir() else None,
                "python_path": str(python_path.resolve()) if python_path else None,
            })
        _merge_venv_meta(result)
        return sorted(result, key=lambda x: x["name"])
    # 仅本地
    result = []
    for child in base.iterdir():
        if not child.is_dir():
            continue
        python_path = _venv_python(child)
        if python_path is None:
            continue
        result.append({
            "id": child.name,
            "name": child.name,
            "path": str(child.resolve()),
            "python_path": str(python_path.resolve()),
        })
    _merge_venv_meta(result)
    return sorted(result, key=lambda x: x["name"])


def _merge_venv_meta(items: List[dict]) -> None:
    """从 venv_meta 表补充 created_by 到列表项（就地修改）。"""
    if not items:
        return
    with get_conn() as c:
        rows = c.execute("SELECT id, created_by FROM venv_meta").fetchall()
    meta = {r["id"]: r["created_by"] for r in rows}
    for item in items:
        item["created_by"] = meta.get(item["id"])


def create_venv(name: str, created_by: Optional[str] = None) -> dict:
    """创建名为 name 的虚拟环境；启用 MinIO 时会上传归档并保留本地缓存。"""
    base = ensure_base_dir()
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name).strip() or "venv"
    venv_root = base / safe_name
    if venv_root.exists():
        raise ValueError(f"虚拟环境已存在: {safe_name}")
    subprocess.run(
        [sys.executable, "-m", "venv", str(venv_root)],
        check=True,
        capture_output=True,
    )
    python_path = _venv_python(venv_root)
    if not python_path:
        raise RuntimeError(f"创建后未找到 Python: {venv_root}")
    if _minio_available():
        from services.file_service import file_service
        key = _venv_object_key(safe_name)
        buf = BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            tar.add(venv_root, arcname=safe_name)
        buf.seek(0)
        file_service.client.put_object(
            file_service.bucket, key, buf, length=buf.getbuffer().nbytes
        )
        logger.info("Venv %s uploaded to MinIO: %s", safe_name, key)
    with get_conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO venv_meta (id, name, created_at, created_by) VALUES (?, ?, ?, ?)",
            (safe_name, safe_name, datetime.now(timezone.utc).isoformat(), created_by),
        )
    return {
        "id": safe_name,
        "name": safe_name,
        "path": str(venv_root.resolve()),
        "python_path": str(python_path.resolve()),
        "created_by": created_by,
    }


def get_venv_python(venv_id: str) -> Optional[str]:
    """根据 venv_id 返回该环境的 Python 可执行路径；启用 MinIO 时若本地无会先下载到缓存。"""
    venv_root = _ensure_local_venv(venv_id)
    if venv_root is None:
        return None
    p = _venv_python(venv_root)
    return str(p.resolve()) if p else None


def delete_venv(venv_id: str) -> None:
    """删除指定虚拟环境（MinIO 中归档 + 本地缓存）。"""
    import shutil
    base = Path(VENV_BASE_DIR)
    venv_root = base / venv_id
    if _minio_available():
        from services.file_service import file_service
        key = _venv_object_key(venv_id)
        try:
            file_service.client.remove_object(file_service.bucket, key)
            logger.info("Removed venv from MinIO: %s", key)
        except Exception as e:
            logger.warning("MinIO remove_object %s: %s", key, e)
    if not venv_root.is_dir():
        if not _minio_available():
            raise ValueError(f"虚拟环境不存在: {venv_id}")
        with get_conn() as c:
            c.execute("DELETE FROM venv_meta WHERE id = ?", (venv_id,))
        return
    shutil.rmtree(venv_root)
    with get_conn() as c:
        c.execute("DELETE FROM venv_meta WHERE id = ?", (venv_id,))
    logger.info("Deleted venv: %s", venv_id)
