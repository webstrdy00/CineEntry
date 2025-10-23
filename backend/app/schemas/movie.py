"""
Movie Pydantic schemas
영화 관련 스키마
"""
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, Field


class MovieBase(BaseModel):
    """Movie 기본 스키마"""
    title: str
    original_title: Optional[str] = None
    director: str
    year: int
    runtime: int  # minutes
    genre: str  # comma-separated
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    synopsis: Optional[str] = None
    kobis_code: Optional[str] = None
    tmdb_id: Optional[int] = None
    kmdb_id: Optional[str] = None


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

    class Config:
        from_attributes = True


class UserMovieBase(BaseModel):
    """UserMovie 기본 스키마"""
    movie_id: int
    status: str = Field(..., pattern="^(wishlist|watching|completed)$")  # wishlist로 통일
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
    status: Optional[str] = Field(None, pattern="^(wishlist|watching|completed)$")
    rating: Optional[float] = Field(None, ge=0, le=5)
    one_line_review: Optional[str] = None
    watch_date: Optional[date] = None
    progress: Optional[int] = None
    is_best_movie: Optional[bool] = None


class UserMovieResponse(UserMovieBase):
    """UserMovie 응답 스키마"""
    id: int
    user_id: str
    movie: MovieResponse
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MovieSearchResult(BaseModel):
    """외부 API 영화 검색 결과"""
    title: str
    original_title: Optional[str] = None
    director: str
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
    director: str
    year: int
    runtime: int
    genre: str
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    synopsis: Optional[str] = None
    kobis_code: Optional[str] = None
    tmdb_id: Optional[int] = None
    kmdb_id: Optional[str] = None
