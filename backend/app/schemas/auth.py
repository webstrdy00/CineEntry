"""
Authentication Schemas
인증 관련 요청/응답 스키마
"""
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


# ===========================
# 요청 스키마
# ===========================

class RegisterRequest(BaseModel):
    """이메일 회원가입 요청"""
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    display_name: str = Field(..., min_length=1, max_length=100)


class LoginRequest(BaseModel):
    """이메일 로그인 요청"""
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    """토큰 갱신 요청"""
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    """비밀번호 변경 요청"""
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=100)


class PasswordResetRequest(BaseModel):
    """비밀번호 재설정 요청"""
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    """비밀번호 재설정 완료 요청"""
    token: str
    new_password: str = Field(..., min_length=6, max_length=100)


class OAuthCallbackRequest(BaseModel):
    """OAuth 콜백 요청"""
    code: str
    state: Optional[str] = None


# ===========================
# 응답 스키마
# ===========================

class TokenResponse(BaseModel):
    """토큰 응답"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # 초 단위


class AuthUserResponse(BaseModel):
    """인증된 사용자 정보"""
    id: str
    email: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    avatar_storage_url: Optional[str] = None
    auth_provider: str
    auth_methods: list[str] = Field(default_factory=list)
    email_verified: bool
    has_password: bool

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    """로그인 응답 (토큰 + 사용자 정보)"""
    user: AuthUserResponse
    tokens: TokenResponse


class OAuthUrlResponse(BaseModel):
    """OAuth 시작 URL 응답"""
    url: str
    state: str
