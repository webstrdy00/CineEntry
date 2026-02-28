"""
User Pydantic schemas
사용자 관련 스키마
"""
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_serializer, field_validator


class UserBase(BaseModel):
    """User 기본 스키마"""
    email: EmailStr
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


class UserCreate(UserBase):
    """User 생성 스키마 (Supabase Auth에서 자동 생성)"""
    pass


class UserUpdate(BaseModel):
    """User 업데이트 스키마"""
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=30)
    avatar_url: Optional[str] = None
    yearly_goal: Optional[int] = Field(default=None, ge=1, le=999)
    streak_type: Optional[str] = None  # 'daily' | 'weekly' | 'custom'
    streak_min_days: Optional[int] = Field(default=None, ge=1, le=7)  # custom 타입일 때 주당 최소 시청 일수

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: Optional[str]):
        if value is None:
            return value

        stripped = value.strip()
        if not stripped:
            raise ValueError("이름은 공백만 입력할 수 없습니다.")

        return stripped

    @field_validator("streak_type")
    @classmethod
    def validate_streak_type(cls, value: Optional[str]):
        if value is None:
            return value

        allowed = {"daily", "weekly", "custom"}
        if value not in allowed:
            raise ValueError("streak_type은 daily, weekly, custom 중 하나여야 합니다.")

        return value


class UserResponse(UserBase):
    """User 응답 스키마"""
    id: UUID
    yearly_goal: int
    auth_provider: Optional[str] = "email"
    created_at: datetime
    updated_at: datetime

    @field_serializer('id')
    def serialize_id(self, id: UUID, _info):
        """UUID를 문자열로 변환"""
        return str(id)

    class Config:
        from_attributes = True
