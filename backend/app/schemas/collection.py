"""
Collection Pydantic schemas
컬렉션 관련 스키마
"""
from datetime import datetime
from typing import Optional, TYPE_CHECKING, List
from pydantic import BaseModel

if TYPE_CHECKING:
    from .movie import MovieResponse


class CollectionBase(BaseModel):
    """Collection 기본 스키마"""
    name: str
    description: Optional[str] = None
    is_auto: bool = False  # True: 자동 수집, False: 수동 수집
    cover_image_url: Optional[str] = None
    auto_rules: Optional[dict] = None  # JSONB - 자동 수집 규칙


class CollectionCreate(CollectionBase):
    """Collection 생성 스키마"""
    pass


class CollectionUpdate(BaseModel):
    """Collection 업데이트 스키마"""
    name: Optional[str] = None
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    auto_rules: Optional[dict] = None


class CollectionResponse(CollectionBase):
    """Collection 응답 스키마"""
    id: int
    user_id: str
    movie_count: int  # 영화 개수 (JOIN으로 계산)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SimpleMovieInCollection(BaseModel):
    """컬렉션 내 영화 간소화 스키마 (Frontend 호환)"""
    id: int  # UserMovie ID
    title: str
    poster_url: Optional[str] = None
    rating: Optional[float] = None
    year: Optional[int] = None
    status: Optional[str] = None


class CollectionWithMovies(CollectionResponse):
    """Collection with movies 응답 스키마"""
    movies: List[SimpleMovieInCollection]
