"""
Tags API endpoints
태그 관련 API
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from typing import Optional, List

from app.database import get_db
from app.middleware.auth_middleware import get_current_user_id
from app.models.tag import Tag
from app.models.movie_tag import MovieTag
from app.models.user_movie import UserMovie
from app.schemas.tag import TagResponse, TagCreate, TagWithCount
from app.schemas.common import BaseResponse

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=BaseResponse[List[TagResponse]])
async def get_tags(
    tag_type: Optional[str] = Query(None, description="필터: 'predefined' or 'custom'"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    태그 목록 조회

    - tag_type=predefined: 사전 정의 태그만
    - tag_type=custom: 사용자 정의 태그만
    - tag_type=None: 모든 태그 (사전 정의 + 사용자 정의)
    """
    query = db.query(Tag)

    if tag_type == "predefined":
        query = query.filter(Tag.is_predefined == True)
    elif tag_type == "custom":
        query = query.filter(
            and_(Tag.is_predefined == False, Tag.user_id == user_id)
        )
    else:
        # 사전 정의 태그 + 본인 커스텀 태그
        query = query.filter(
            or_(Tag.is_predefined == True, Tag.user_id == user_id)
        )

    tags = query.order_by(Tag.is_predefined.desc(), Tag.name).all()

    return BaseResponse(
        success=True,
        message=f"태그 목록 조회 성공 ({len(tags)}개)",
        data=tags
    )


@router.get("/popular", response_model=BaseResponse[List[TagWithCount]])
async def get_popular_tags(
    limit: int = Query(10, ge=1, le=50, description="최대 개수"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    인기 태그 TOP N

    - 사용자가 가장 많이 사용한 태그
    - 사용 횟수와 함께 반환
    """
    # SQL: SELECT tag_id, COUNT(*) FROM movie_tags
    #      JOIN user_movies ON movie_tags.user_movie_id = user_movies.id
    #      WHERE user_movies.user_id = ?
    #      GROUP BY tag_id ORDER BY COUNT(*) DESC LIMIT N

    popular_tags = (
        db.query(
            Tag,
            func.count(MovieTag.id).label("usage_count")
        )
        .join(MovieTag, MovieTag.tag_id == Tag.id)
        .join(UserMovie, MovieTag.user_movie_id == UserMovie.id)
        .filter(UserMovie.user_id == user_id)
        .group_by(Tag.id)
        .order_by(func.count(MovieTag.id).desc())
        .limit(limit)
        .all()
    )

    # TagWithCount 스키마로 변환
    result = []
    for tag, count in popular_tags:
        tag_dict = {
            "id": tag.id,
            "name": tag.name,
            "is_predefined": tag.is_predefined,
            "user_id": tag.user_id,
            "created_at": tag.created_at,
            "count": count
        }
        result.append(TagWithCount(**tag_dict))

    return BaseResponse(
        success=True,
        message=f"인기 태그 TOP {len(result)} 조회 성공",
        data=result
    )


@router.post("", response_model=BaseResponse[TagResponse], status_code=status.HTTP_201_CREATED)
async def create_tag(
    tag_create: TagCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    사용자 정의 태그 생성

    - 중복 체크: 동일 사용자 + 동일 태그명
    - is_predefined=False (사용자 정의 태그)
    """
    # 중복 체크
    existing_tag = db.query(Tag).filter(
        and_(Tag.name == tag_create.name, Tag.user_id == user_id)
    ).first()

    if existing_tag:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"이미 존재하는 태그입니다: {tag_create.name}"
        )

    # 새 태그 생성
    new_tag = Tag(
        name=tag_create.name,
        is_predefined=False,
        user_id=user_id
    )

    db.add(new_tag)
    db.commit()
    db.refresh(new_tag)

    return BaseResponse(
        success=True,
        message=f"태그가 생성되었습니다: {new_tag.name}",
        data=new_tag
    )


@router.post("/movies/{user_movie_id}/tags", response_model=BaseResponse[dict])
async def add_tag_to_movie(
    user_movie_id: int,
    tag_id: int = Query(..., description="추가할 태그 ID"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    영화에 태그 추가

    - user_movie 소유권 확인
    - 태그 존재 확인
    - 중복 체크
    """
    # user_movie 소유권 확인
    user_movie = db.query(UserMovie).filter(
        and_(UserMovie.id == user_movie_id, UserMovie.user_id == user_id)
    ).first()

    if not user_movie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="영화를 찾을 수 없습니다."
        )

    # 태그 존재 확인 (사전 정의 태그 or 본인 커스텀 태그)
    tag = db.query(Tag).filter(
        and_(
            Tag.id == tag_id,
            or_(Tag.is_predefined == True, Tag.user_id == user_id)
        )
    ).first()

    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="태그를 찾을 수 없습니다."
        )

    # 중복 체크
    existing_movie_tag = db.query(MovieTag).filter(
        and_(MovieTag.user_movie_id == user_movie_id, MovieTag.tag_id == tag_id)
    ).first()

    if existing_movie_tag:
        return BaseResponse(
            success=True,
            message="이미 추가된 태그입니다.",
            data={
                "user_movie_id": user_movie_id,
                "tag_id": tag_id,
                "tag_name": tag.name
            }
        )

    # 영화에 태그 추가
    new_movie_tag = MovieTag(
        user_movie_id=user_movie_id,
        tag_id=tag_id
    )

    db.add(new_movie_tag)
    db.commit()

    return BaseResponse(
        success=True,
        message=f"영화에 태그가 추가되었습니다: {tag.name}",
        data={
            "user_movie_id": user_movie_id,
            "tag_id": tag_id,
            "tag_name": tag.name
        }
    )


@router.delete("/movies/{user_movie_id}/tags/{tag_id}", response_model=BaseResponse[dict])
async def remove_tag_from_movie(
    user_movie_id: int,
    tag_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    영화에서 태그 제거

    - user_movie 소유권 확인
    - movie_tag 존재 확인
    """
    # user_movie 소유권 확인
    user_movie = db.query(UserMovie).filter(
        and_(UserMovie.id == user_movie_id, UserMovie.user_id == user_id)
    ).first()

    if not user_movie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="영화를 찾을 수 없습니다."
        )

    # movie_tag 찾기
    movie_tag = db.query(MovieTag).filter(
        and_(MovieTag.user_movie_id == user_movie_id, MovieTag.tag_id == tag_id)
    ).first()

    if not movie_tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 태그가 영화에 추가되지 않았습니다."
        )

    # 태그 제거
    db.delete(movie_tag)
    db.commit()

    return BaseResponse(
        success=True,
        message="영화에서 태그가 제거되었습니다.",
        data={
            "user_movie_id": user_movie_id,
            "tag_id": tag_id
        }
    )


@router.delete("/{tag_id}", response_model=BaseResponse[dict])
async def delete_tag(
    tag_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    사용자 정의 태그 삭제

    - 본인이 생성한 커스텀 태그만 삭제 가능
    - 사전 정의 태그는 삭제 불가
    - CASCADE: 관련된 movie_tags도 모두 삭제됨
    """
    # 태그 찾기 (본인 커스텀 태그만)
    tag = db.query(Tag).filter(
        and_(
            Tag.id == tag_id,
            Tag.is_predefined == False,
            Tag.user_id == user_id
        )
    ).first()

    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="태그를 찾을 수 없거나 삭제 권한이 없습니다."
        )

    tag_name = tag.name
    db.delete(tag)
    db.commit()

    return BaseResponse(
        success=True,
        message=f"태그가 삭제되었습니다: {tag_name}",
        data={"deleted_tag_id": tag_id}
    )
