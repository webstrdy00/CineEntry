from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user_movie import UserMovie
from app.models.movie import Movie
from app.models.movie_tag import MovieTag
from app.models.tag import Tag
from app.schemas.movie import (
    UserMovieCreate, UserMovieUpdate, UserMovieResponse,
    MovieCreate, MovieResponse, MovieSearchResult, MovieMetadata
)
from app.schemas.common import BaseResponse
from app.services.external_api_service import external_api_service

router = APIRouter(prefix="/movies", tags=["movies"])


@router.get("/", response_model=List[UserMovieResponse])
async def get_user_movies(
    status_filter: Optional[str] = Query(None, description="Filter by status: watchlist, watching, completed"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Get user's movie library

    Query Parameters:
    - status: Filter by movie status (watchlist, watching, completed)
    """
    query = db.query(UserMovie).options(joinedload(UserMovie.movie)).filter(UserMovie.user_id == user_id)

    if status_filter:
        query = query.filter(UserMovie.status == status_filter)

    user_movies = query.order_by(UserMovie.created_at.desc()).all()

    return user_movies


@router.get("/{user_movie_id}", response_model=UserMovieResponse)
async def get_movie_detail(
    user_movie_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Get detailed information about a specific movie
    """
    user_movie = (
        db.query(UserMovie)
        .options(joinedload(UserMovie.movie))
        .filter(UserMovie.user_id == user_id, UserMovie.id == user_movie_id)
        .first()
    )

    if not user_movie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movie not found in your library",
        )

    return user_movie


@router.post("/", response_model=UserMovieResponse, status_code=status.HTTP_201_CREATED)
async def add_movie(
    user_movie_data: UserMovieCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Add a movie to user's library

    Request Body:
    - movie_id: ID of the movie (must exist in movies table)
    - status: "watchlist", "watching", or "completed"
    - rating: 1-5 (optional)
    - review: Review text (optional)
    - watch_date: Date watched (optional)
    - progress: Minutes watched (optional, for "watching" status)
    - is_favorite: Mark as favorite (default: false)
    - is_life_movie: Mark as life movie (default: false)
    """
    # Check if movie exists
    movie = db.query(Movie).filter(Movie.id == user_movie_data.movie_id).first()
    if not movie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movie not found. Please add movie metadata first.",
        )

    # Check if user already added this movie
    existing = db.query(UserMovie).filter(
        UserMovie.user_id == user_id,
        UserMovie.movie_id == user_movie_data.movie_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Movie already exists in your library",
        )

    # Create user movie
    user_movie = UserMovie(
        user_id=user_id,
        **user_movie_data.model_dump()
    )

    db.add(user_movie)
    db.commit()
    db.refresh(user_movie)

    # Load movie relationship
    user_movie = db.query(UserMovie).options(joinedload(UserMovie.movie)).filter(UserMovie.id == user_movie.id).first()

    return user_movie


@router.put("/{user_movie_id}", response_model=UserMovieResponse)
async def update_movie(
    user_movie_id: int,
    update_data: UserMovieUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Update movie information (rating, review, status, etc.)

    Request Body:
    - status: "watchlist", "watching", or "completed" (optional)
    - rating: 1-5 (optional)
    - review: Review text (optional)
    - watch_date: Date watched (optional)
    - progress: Minutes watched (optional)
    - is_favorite: Mark as favorite (optional)
    - is_life_movie: Mark as life movie (optional)
    """
    user_movie = (
        db.query(UserMovie)
        .filter(UserMovie.user_id == user_id, UserMovie.id == user_movie_id)
        .first()
    )

    if not user_movie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movie not found in your library",
        )

    # Update only provided fields
    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(user_movie, field, value)

    db.commit()
    db.refresh(user_movie)

    # Load movie relationship
    user_movie = db.query(UserMovie).options(joinedload(UserMovie.movie)).filter(UserMovie.id == user_movie.id).first()

    return user_movie


@router.delete("/{user_movie_id}", response_model=BaseResponse[dict])
async def delete_movie(
    user_movie_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Remove a movie from user's library
    """
    user_movie = (
        db.query(UserMovie)
        .filter(UserMovie.user_id == user_id, UserMovie.id == user_movie_id)
        .first()
    )

    if not user_movie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movie not found in your library",
        )

    db.delete(user_movie)
    db.commit()

    return BaseResponse(
        success=True,
        message="Movie deleted successfully",
        data={"user_movie_id": user_movie_id}
    )


@router.get("/search", response_model=List[MovieSearchResult])
async def search_movies(
    q: str = Query(..., description="Search query"),
    user_id: str = Depends(get_current_user),
):
    """
    Search movies from external APIs (KOBIS, TMDb, KMDb)

    Query Parameters:
    - q: Search query (movie title)

    Returns:
    - List of movie search results from multiple sources (KOBIS, TMDb, KMDb)
    """
    results = await external_api_service.search_movies(q)
    return results


@router.get("/metadata/{source}/{id}", response_model=MovieMetadata)
async def get_movie_metadata(
    source: str = Path(..., description="Source: 'kobis' or 'tmdb'"),
    id: str = Path(..., description="Movie ID (kobis_code or tmdb_id)"),
    user_id: str = Depends(get_current_user),
):
    """
    Get detailed movie metadata from external API

    Path Parameters:
    - source: "kobis" or "tmdb"
    - id: Movie ID (KOBIS code or TMDb ID)

    Returns:
    - Detailed movie metadata
    """
    if source == "tmdb":
        metadata = await external_api_service.get_tmdb_metadata(int(id))
    elif source == "kobis":
        metadata = await external_api_service.get_kobis_metadata(id)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid source. Must be 'kobis' or 'tmdb'"
        )

    if not metadata:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movie metadata not found"
        )

    return metadata


@router.post("/from-metadata", response_model=MovieResponse, status_code=status.HTTP_201_CREATED)
async def create_movie_from_metadata(
    metadata: MovieMetadata,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Create a new movie in the database from metadata

    Request Body:
    - metadata: MovieMetadata from external API
      - title → title_ko
      - original_title → title_original
      - year → production_year

    Returns:
    - Created movie (returns existing if already in DB)
    """
    # Check if movie already exists
    existing = None
    if metadata.tmdb_id:
        existing = db.query(Movie).filter(Movie.tmdb_id == metadata.tmdb_id).first()
    elif metadata.kobis_code:
        existing = db.query(Movie).filter(Movie.kobis_code == metadata.kobis_code).first()

    if existing:
        return existing

    # Create new movie with field mapping
    # MovieMetadata 필드 → Movie 모델 필드 매핑
    movie = Movie(
        title_ko=metadata.title,
        title_original=metadata.original_title,
        production_year=metadata.year,
        director=metadata.director,
        runtime=metadata.runtime,
        genre=metadata.genre,
        poster_url=metadata.poster_url,
        backdrop_url=metadata.backdrop_url,
        synopsis=metadata.synopsis,
        kobis_code=metadata.kobis_code,
        tmdb_id=metadata.tmdb_id,
        kmdb_id=metadata.kmdb_id,
    )

    db.add(movie)
    db.commit()
    db.refresh(movie)

    return movie
