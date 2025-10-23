"""
User Pydantic schemas
사용자 관련 스키마
"""
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, field_serializer


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
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    yearly_goal: Optional[int] = None


class UserResponse(UserBase):
    """User 응답 스키마"""
    id: UUID
    yearly_goal: int
    created_at: datetime
    updated_at: datetime

    @field_serializer('id')
    def serialize_id(self, id: UUID, _info):
        """UUID를 문자열로 변환"""
        return str(id)

    class Config:
        from_attributes = True
