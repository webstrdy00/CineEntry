"""
Pydantic schemas
Request/Response schema definitions
"""
from .common import BaseResponse, PaginationParams, PaginatedResponse
from .user import UserBase, UserCreate, UserUpdate, UserResponse
from .movie import (
    MovieBase, MovieCreate, MovieUpdate, MovieResponse,
    UserMovieBase, UserMovieCreate, UserMovieUpdate, UserMovieResponse,
    MovieSearchResult, MovieMetadata
)
from .tag import TagBase, TagCreate, TagUpdate, TagResponse, TagWithCount
from .collection import (
    CollectionBase, CollectionCreate, CollectionUpdate,
    CollectionResponse, CollectionWithMovies
)
from .stats import (
    StatsOverview, MonthlyStats, GenreStats, TagStats, BestMovie
)
from .image import (
    UserImageBase, UserImageCreate, UserImageUpdate, UserImageResponse,
    UploadUrlRequest, UploadUrlResponse
)

__all__ = [
    # Common
    "BaseResponse",
    "PaginationParams",
    "PaginatedResponse",

    # User
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserResponse",

    # Movie
    "MovieBase",
    "MovieCreate",
    "MovieUpdate",
    "MovieResponse",
    "UserMovieBase",
    "UserMovieCreate",
    "UserMovieUpdate",
    "UserMovieResponse",
    "MovieSearchResult",
    "MovieMetadata",

    # Tag
    "TagBase",
    "TagCreate",
    "TagUpdate",
    "TagResponse",
    "TagWithCount",

    # Collection
    "CollectionBase",
    "CollectionCreate",
    "CollectionUpdate",
    "CollectionResponse",
    "CollectionWithMovies",

    # Stats
    "StatsOverview",
    "MonthlyStats",
    "GenreStats",
    "TagStats",
    "BestMovie",

    # Image
    "UserImageBase",
    "UserImageCreate",
    "UserImageUpdate",
    "UserImageResponse",
    "UploadUrlRequest",
    "UploadUrlResponse",
]
