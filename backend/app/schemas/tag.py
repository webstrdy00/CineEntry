"""
Tag Pydantic schemas
태그 관련 스키마
"""
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class TagBase(BaseModel):
    """Tag 기본 스키마"""
    name: str


class TagCreate(BaseModel):
    """Tag 생성 스키마"""
    name: str


class TagUpdate(BaseModel):
    """Tag 업데이트 스키마"""
    name: Optional[str] = None


class TagResponse(TagBase):
    """Tag 응답 스키마"""
    id: int
    is_predefined: bool
    user_id: Optional[UUID] = None  # custom tag has user_id, predefined tag is None
    created_at: datetime

    class Config:
        from_attributes = True


class TagWithCount(TagResponse):
    """태그 사용 횟수 포함"""
    count: int
