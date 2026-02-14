"""
Authentication Middleware
자체 JWT 토큰 검증
"""
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.services.auth_service import verify_access_token

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    """
    Access Token을 검증하고 user_id를 반환

    Args:
        credentials: HTTP Bearer token from Authorization header

    Returns:
        user_id (str): 사용자 UUID

    Raises:
        HTTPException: 401 if token is invalid or expired
    """
    token = credentials.credentials

    user_id = verify_access_token(token)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 토큰입니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_id


# Alias for consistency
get_current_user_id = get_current_user


# Optional security for routes that allow optional authentication
security_optional = HTTPBearer(auto_error=False)


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Security(security_optional),
) -> str | None:
    """
    토큰이 제공되면 user_id를 반환, 없으면 None

    인증 선택적인 라우트에 사용
    """
    if not credentials:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
