from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List
from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.collection import Collection
from app.models.collection_movie import CollectionMovie
from app.models.user_movie import UserMovie
from app.models.movie import Movie
from app.schemas.collection import (
    CollectionCreate, CollectionUpdate, CollectionResponse, CollectionWithMovies,
    SimpleMovieInCollection
)
from app.schemas.common import BaseResponse
from app.services.auto_collection_service import auto_collection_service

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get("/", response_model=List[CollectionResponse])
async def get_user_collections(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Get all collections for the current user with movie count
    """
    collections = (
        db.query(
            Collection,
            func.count(CollectionMovie.id).label("movie_count"),
        )
        .outerjoin(CollectionMovie, Collection.id == CollectionMovie.collection_id)
        .filter(Collection.user_id == user_id)
        .group_by(Collection.id)
        .order_by(Collection.created_at.desc())
        .all()
    )

    result = []
    for collection, movie_count in collections:
        collection_dict = CollectionResponse(
            id=collection.id,
            name=collection.name,
            description=collection.description,
            is_auto=collection.is_auto,
            cover_image_url=collection.cover_image_url,
            auto_rules=collection.auto_rules,
            user_id=collection.user_id,
            movie_count=movie_count,
            created_at=collection.created_at,
            updated_at=collection.updated_at,
        )
        result.append(collection_dict)

    return result


@router.get("/{collection_id}", response_model=CollectionWithMovies)
async def get_collection_detail(
    collection_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Get detailed information about a specific collection with movies list
    """
    # Get collection
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.user_id == user_id)
        .first()
    )

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    # Get movies in this collection with JOIN
    movies_query = (
        db.query(UserMovie, Movie)
        .join(CollectionMovie, UserMovie.id == CollectionMovie.user_movie_id)
        .join(Movie, UserMovie.movie_id == Movie.id)
        .filter(CollectionMovie.collection_id == collection_id)
        .all()
    )

    # Build movie response list (simplified format for Frontend)
    movies = []
    for user_movie, movie in movies_query:
        movies.append(SimpleMovieInCollection(
            id=user_movie.id,  # UserMovie ID
            title=movie.title,
            poster_url=movie.poster_url,
            rating=user_movie.rating,
            year=movie.year,
            status=user_movie.status,
        ))

    return CollectionWithMovies(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        is_auto=collection.is_auto,
        cover_image_url=collection.cover_image_url,
        auto_rules=collection.auto_rules,
        user_id=collection.user_id,
        movie_count=len(movies),
        movies=movies,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


@router.post("/", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    collection_data: CollectionCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Create a new collection

    Request Body:
    - name: Collection name (required)
    - description: Collection description (optional)
    - is_auto: True for auto collection, False for manual (default: False)
    - cover_image_url: Cover image URL (optional)
    - auto_rules: Auto collection rules (JSONB, optional, only for is_auto=True)
    """
    # Create collection
    collection = Collection(
        user_id=user_id,
        **collection_data.model_dump()
    )

    db.add(collection)
    db.commit()
    db.refresh(collection)

    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        is_auto=collection.is_auto,
        cover_image_url=collection.cover_image_url,
        auto_rules=collection.auto_rules,
        user_id=collection.user_id,
        movie_count=0,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


@router.put("/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: int,
    update_data: CollectionUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Update collection information

    Request Body:
    - name: Collection name (optional)
    - description: Collection description (optional)
    - cover_image_url: Cover image URL (optional)
    - auto_rules: Auto collection rules (optional)
    """
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.user_id == user_id)
        .first()
    )

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    # Update only provided fields
    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(collection, field, value)

    db.commit()
    db.refresh(collection)

    # Get movie count
    movie_count = db.query(func.count(CollectionMovie.id)).filter(
        CollectionMovie.collection_id == collection_id
    ).scalar()

    return CollectionResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        is_auto=collection.is_auto,
        cover_image_url=collection.cover_image_url,
        auto_rules=collection.auto_rules,
        user_id=collection.user_id,
        movie_count=movie_count,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


@router.delete("/{collection_id}", response_model=BaseResponse[dict])
async def delete_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Delete a collection
    """
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.user_id == user_id)
        .first()
    )

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    db.delete(collection)
    db.commit()

    return BaseResponse(
        success=True,
        message="Collection deleted successfully",
        data={"collection_id": collection_id}
    )


@router.post("/{collection_id}/movies/{user_movie_id}", response_model=BaseResponse[dict], status_code=status.HTTP_201_CREATED)
async def add_movie_to_collection(
    collection_id: int,
    user_movie_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Add a movie to a collection

    Path Parameters:
    - collection_id: Collection ID
    - user_movie_id: UserMovie ID (not Movie ID!)
    """
    # Check collection exists and belongs to user
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.user_id == user_id)
        .first()
    )

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    # Check user_movie exists and belongs to user
    user_movie = (
        db.query(UserMovie)
        .filter(UserMovie.id == user_movie_id, UserMovie.user_id == user_id)
        .first()
    )

    if not user_movie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movie not found in your library",
        )

    # Check if movie already in collection
    existing = db.query(CollectionMovie).filter(
        CollectionMovie.collection_id == collection_id,
        CollectionMovie.user_movie_id == user_movie_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Movie already in this collection",
        )

    # Add movie to collection
    collection_movie = CollectionMovie(
        collection_id=collection_id,
        user_movie_id=user_movie_id
    )

    db.add(collection_movie)
    db.commit()

    return BaseResponse(
        success=True,
        message="Movie added to collection successfully",
        data={
            "collection_id": collection_id,
            "user_movie_id": user_movie_id
        }
    )


@router.delete("/{collection_id}/movies/{user_movie_id}", response_model=BaseResponse[dict])
async def remove_movie_from_collection(
    collection_id: int,
    user_movie_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Remove a movie from a collection

    Path Parameters:
    - collection_id: Collection ID
    - user_movie_id: UserMovie ID (not Movie ID!)
    """
    # Check collection belongs to user
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.user_id == user_id)
        .first()
    )

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    # Find collection_movie record
    collection_movie = (
        db.query(CollectionMovie)
        .join(UserMovie, CollectionMovie.user_movie_id == UserMovie.id)
        .filter(
            CollectionMovie.collection_id == collection_id,
            CollectionMovie.user_movie_id == user_movie_id,
            UserMovie.user_id == user_id  # Verify user owns the movie
        )
        .first()
    )

    if not collection_movie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movie not found in this collection",
        )

    db.delete(collection_movie)
    db.commit()

    return BaseResponse(
        success=True,
        message="Movie removed from collection successfully",
        data={
            "collection_id": collection_id,
            "user_movie_id": user_movie_id
        }
    )


@router.post("/{collection_id}/sync", response_model=BaseResponse[dict])
async def sync_auto_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    자동 컬렉션 동기화

    auto_rules에 정의된 규칙에 따라 영화를 자동으로 추가/제거

    auto_rules 예시:
    {
        "status": "completed",
        "rating": {"min": 4.0},
        "year": {"min": 2020, "max": 2024},
        "genre": "드라마",
        "is_best_movie": true
    }

    Returns:
    - added_count: 추가된 영화 수
    - removed_count: 제거된 영화 수
    - total_count: 최종 컬렉션의 영화 수
    """
    # Check collection belongs to user
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.user_id == user_id)
        .first()
    )

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    # Check if auto collection
    if not collection.is_auto:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This is not an auto collection",
        )

    # Check auto_rules exists
    if not collection.auto_rules:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auto rules are not defined for this collection",
        )

    try:
        # Validate auto_rules
        auto_collection_service.validate_auto_rule(collection.auto_rules)

        # Sync collection
        result = auto_collection_service.sync_auto_collection(collection_id, db)

        return BaseResponse(
            success=True,
            message=f"컬렉션 동기화 완료: {result['added_count']}개 추가, {result['removed_count']}개 제거",
            data=result
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"동기화 실패: {str(e)}"
        )
