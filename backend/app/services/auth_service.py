"""
Authentication Service
JWT 생성/검증, 비밀번호 해싱 등 인증 관련 유틸리티
"""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Optional
from uuid import UUID

import bcrypt
import jwt

from app.config import settings, get_jwt_secret_key


def _normalize_password(password: str) -> bytes:
    """
    bcrypt는 72 bytes 제한이 있으므로 초과 시 SHA-256으로 정규화합니다.
    동일 로직을 hash/verify 양쪽에 적용해 일관성을 유지합니다.
    """
    raw = password.encode("utf-8")
    if len(raw) <= 72:
        return raw
    return sha256(raw).hexdigest().encode("utf-8")


def hash_password(password: str) -> str:
    """비밀번호를 해싱합니다."""
    password_bytes = _normalize_password(password)
    hashed = bcrypt.hashpw(password_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """비밀번호를 검증합니다."""
    if not hashed_password:
        return False

    try:
        password_bytes = _normalize_password(plain_password)
        return bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: UUID) -> str:
    """
    Access Token 생성 (짧은 수명)

    Args:
        user_id: 사용자 UUID

    Returns:
        JWT Access Token
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }

    return jwt.encode(
        payload,
        get_jwt_secret_key(),
        algorithm=settings.JWT_ALGORITHM
    )


def create_refresh_token(user_id: UUID, token_version: int) -> str:
    """
    Refresh Token 생성 (긴 수명, token_version 포함)

    Args:
        user_id: 사용자 UUID
        token_version: 현재 사용자의 token_version (강제 로그아웃용)

    Returns:
        JWT Refresh Token
    """
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
    )

    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "token_version": token_version,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }

    return jwt.encode(
        payload,
        get_jwt_secret_key(),
        algorithm=settings.JWT_ALGORITHM
    )


def create_tokens(user_id: UUID, token_version: int) -> dict:
    """
    Access Token과 Refresh Token을 함께 생성

    Args:
        user_id: 사용자 UUID
        token_version: 현재 사용자의 token_version

    Returns:
        {
            "access_token": str,
            "refresh_token": str,
            "token_type": "bearer",
            "expires_in": int (초)
        }
    """
    return {
        "access_token": create_access_token(user_id),
        "refresh_token": create_refresh_token(user_id, token_version),
        "token_type": "bearer",
        "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


def decode_token(token: str) -> Optional[dict]:
    """
    JWT 토큰을 디코딩합니다.

    Args:
        token: JWT 토큰

    Returns:
        디코딩된 payload 또는 None (유효하지 않은 경우)
    """
    try:
        payload = jwt.decode(
            token,
            get_jwt_secret_key(),
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def verify_access_token(token: str) -> Optional[str]:
    """
    Access Token을 검증하고 user_id를 반환합니다.

    Args:
        token: Access Token

    Returns:
        user_id 문자열 또는 None
    """
    payload = decode_token(token)

    if not payload:
        return None

    if payload.get("type") != "access":
        return None

    return payload.get("sub")


def verify_refresh_token(token: str) -> Optional[dict]:
    """
    Refresh Token을 검증합니다.

    Args:
        token: Refresh Token

    Returns:
        {"user_id": str, "token_version": int} 또는 None
    """
    payload = decode_token(token)

    if not payload:
        return None

    if payload.get("type") != "refresh":
        return None

    return {
        "user_id": payload.get("sub"),
        "token_version": payload.get("token_version"),
    }
