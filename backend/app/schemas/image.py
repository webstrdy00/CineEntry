"""
Image Pydantic schemas
이미지 관련 스키마 (티켓, 포토카드 등)
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class UserImageBase(BaseModel):
    """UserImage 기본 스키마"""

    user_movie_id: int
    image_type: str = Field(..., pattern="^(ticket|photocard|other)$", max_length=20)
    image_url: str = Field(..., min_length=1, max_length=4096)
    thumbnail_url: Optional[str] = Field(None, max_length=4096)


class UserImageCreate(UserImageBase):
    """UserImage 생성 스키마"""

    pass


class UserImageUpdate(BaseModel):
    """UserImage 업데이트 스키마"""

    thumbnail_url: Optional[str] = None


class UserImageResponse(UserImageBase):
    """UserImage 응답 스키마"""

    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class StoredFileResponse(BaseModel):
    """백엔드 업로드 완료 응답"""

    file_url: str
    file_key: str
    storage_url: str
