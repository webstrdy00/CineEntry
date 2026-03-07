"""
Common Pydantic schemas
공통 스키마 (Base Response, Pagination 등)
"""
from typing import Generic, TypeVar, Optional
from pydantic import BaseModel


# Generic type for data
T = TypeVar("T")


class BaseResponse(BaseModel, Generic[T]):
    """기본 API 응답 형식"""
    success: bool
    message: Optional[str] = None
    data: Optional[T] = None


class PaginationParams(BaseModel):
    """페이지네이션 파라미터"""
    page: int = 1
    page_size: int = 20


class PaginatedResponse(BaseModel, Generic[T]):
    """페이지네이션 응답"""
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int
