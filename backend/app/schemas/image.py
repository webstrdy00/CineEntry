"""
Image Pydantic schemas
이미지 관련 스키마 (티켓, 포토카드 등)
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class UserImageBase(BaseModel):
    """UserImage 기본 스키마"""
    user_movie_id: int
    image_type: str  # "ticket" or "photocard"
    image_url: str
    thumbnail_url: Optional[str] = None


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


class UploadUrlRequest(BaseModel):
    """S3 Presigned URL 요청"""
    file_name: str
    file_type: str  # "image/jpeg", "image/png", etc.


class UploadUrlResponse(BaseModel):
    """S3 Presigned URL 응답"""
    upload_url: str
    file_url: str  # 업로드 후 사용할 public URL
    file_key: str  # S3 파일 키 (삭제 시 필요)
    expires_in: int  # seconds
