"""
用户认证：登录（查 users 表）、JWT、当前用户依赖；用户管理 API
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel

from config import AUTH_SECRET
from services import user_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bigdata-ide", tags=["auth"])

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 天


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


def _verify_user(username: str, password: str) -> bool:
    return bool(username and user_service.verify(username, password))


def _create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, AUTH_SECRET, algorithm=ALGORITHM)


def _decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, AUTH_SECRET, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[str]:
    """从 Bearer token 解析当前用户名，无效或缺失返回 None（未登录）。"""
    if not credentials or not credentials.credentials:
        return None
    return _decode_token(credentials.credentials)


async def get_current_user_required(
    current_user: Optional[str] = Depends(get_current_user),
) -> str:
    """需要登录，未登录返回 401。"""
    if not current_user:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    return current_user


@router.post("/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """登录，返回 JWT。"""
    if not _verify_user(req.username, req.password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = _create_token(req.username)
    return LoginResponse(access_token=token, username=req.username)


class RegisterRequest(BaseModel):
    username: str
    password: str


@router.post("/auth/register", response_model=LoginResponse)
async def register(req: RegisterRequest):
    """注册新用户（无需登录），创建成功后返回 JWT，可直接当登录使用。"""
    try:
        user_service.create_user(req.username.strip(), req.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    token = _create_token(req.username.strip())
    return LoginResponse(access_token=token, username=req.username.strip())


@router.get("/auth/me")
async def me(current_user: Optional[str] = Depends(get_current_user)):
    """获取当前登录用户，未登录返回 null。"""
    if not current_user:
        return {"username": None}
    return {"username": current_user}


# ---------- 用户管理（需登录） ----------


class UserCreateBody(BaseModel):
    username: str
    password: str


class UserUpdateBody(BaseModel):
    password: Optional[str] = None
    disabled: Optional[bool] = None


@router.get("/auth/users", response_model=List[dict])
async def list_users(current_user: str = Depends(get_current_user_required)):
    """列举所有用户（不含密码）。"""
    return user_service.list_users()


@router.post("/auth/users", response_model=dict)
async def create_user(body: UserCreateBody, current_user: str = Depends(get_current_user_required)):
    """创建用户。"""
    try:
        return user_service.create_user(body.username, body.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/auth/users/{username}", response_model=dict)
async def update_user(username: str, body: UserUpdateBody, current_user: str = Depends(get_current_user_required)):
    """修改用户：改密码或启用/禁用。"""
    if user_service.get_by_username(username) is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if body.password is not None:
        user_service.update_password(username, body.password)
    if body.disabled is not None:
        user_service.set_disabled(username, body.disabled)
    out = user_service.get_by_username(username)
    return out


@router.delete("/auth/users/{username}")
async def delete_user(username: str, current_user: str = Depends(get_current_user_required)):
    """删除用户（物理删除）。"""
    if not user_service.delete_user(username):
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"status": "ok"}
