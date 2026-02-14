"""
Movie Pydantic schemas
영화 관련 스키마
"""
from datetime import datetime, date
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field


class MovieBase(BaseModel):
    """Movie 기본 스키마"""
    title: str = Field(..., alias="title_ko")
    original_title: Optional[str] = Field(None, alias="title_original")
    director: Optional[str] = None
    year: Optional[int] = Field(None, alias="production_year")
    runtime: Optional[int] = None  # minutes
    genre: Optional[str] = None  # comma-separated
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    synopsis: Optional[str] = None
    kobis_code: Optional[str] = None
    tmdb_id: Optional[int] = None
    kmdb_id: Optional[str] = None

    class Config:
        from_attributes = True
        populate_by_name = True  # alias와 필드명 둘 다 허용


class MovieCreate(MovieBase):
    """Movie 생성 스키마 (외부 API에서 메타데이터 가져온 후)"""
    pass


class MovieUpdate(BaseModel):
    """Movie 업데이트 스키마 (메타데이터는 수정 불가, 사용자 데이터만 수정)"""
    pass


class MovieResponse(MovieBase):
    """Movie 응답 스키마"""
    id: int
    created_at: datetime
    updated_at: datetime


class UserMovieBase(BaseModel):
    """UserMovie 기본 스키마"""
    movie_id: int
    # 레거시(wishlist) + 현재 프론트(watchlist) 모두 허용
    status: str = Field(..., pattern="^(wishlist|watchlist|watching|completed)$")
    rating: Optional[float] = Field(None, ge=0, le=5)  # 0~5, 0.5 단위 허용
    one_line_review: Optional[str] = None  # 모델과 일치
    watch_date: Optional[date] = None
    progress: Optional[int] = None  # minutes watched
    is_best_movie: bool = False  # 모델과 일치


class UserMovieCreate(UserMovieBase):
    """UserMovie 생성 스키마 (영화 추가)"""
    pass


class UserMovieUpdate(BaseModel):
    """UserMovie 업데이트 스키마"""
    status: Optional[str] = Field(None, pattern="^(wishlist|watchlist|watching|completed)$")
    rating: Optional[float] = Field(None, ge=0, le=5)
    one_line_review: Optional[str] = None
    watch_date: Optional[date] = None
    progress: Optional[int] = None
    is_best_movie: Optional[bool] = None


class UserMovieResponse(UserMovieBase):
    """UserMovie 응답 스키마 (중첩 구조)"""
    id: int
    user_id: UUID
    movie: MovieResponse
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MovieTagItem(BaseModel):
    """영화 상세용 태그 요약 스키마"""
    id: int
    name: str


class FlatMovieResponse(BaseModel):
    """Frontend 호환 평평한 영화 응답 스키마"""
    # UserMovie 필드
    id: int  # UserMovie ID
    user_id: UUID
    status: str
    rating: Optional[float] = None
    review: Optional[str] = None  # one_line_review
    watch_date: Optional[date] = None
    progress: Optional[int] = None
    is_best_movie: bool = False

    # Movie 필드 (평평하게 - 필드명 변경)
    movie_id: int
    title: str
    original_title: Optional[str] = None
    poster: Optional[str] = None  # poster_url → poster
    backdrop: Optional[str] = None  # backdrop_url → backdrop
    year: Optional[int] = None
    runtime: Optional[int] = None
    genre: Optional[str] = None
    director: Optional[str] = None
    synopsis: Optional[str] = None
    tags: List[MovieTagItem] = Field(default_factory=list)

    # 메타데이터
    created_at: datetime
    updated_at: datetime


class MovieSearchResult(BaseModel):
    """외부 API 영화 검색 결과"""
    title: str
    original_title: Optional[str] = None
    director: Optional[str] = None
    year: int
    runtime: Optional[int] = None
    genre: Optional[str] = None
    poster_url: Optional[str] = None
    synopsis: Optional[str] = None
    kobis_code: Optional[str] = None
    tmdb_id: Optional[int] = None
    kmdb_id: Optional[str] = None
    source: str  # "kobis", "tmdb", "kmdb"


class MovieMetadata(BaseModel):
    """영화 메타데이터 (외부 API에서 가져온 상세 정보)"""
    title: str
    original_title: Optional[str] = None
    director: Optional[str] = None
    year: Optional[int] = None
    runtime: Optional[int] = None
    genre: Optional[str] = None
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    synopsis: Optional[str] = None
    kobis_code: Optional[str] = None
    tmdb_id: Optional[int] = None
    kmdb_id: Optional[str] = None
