"""
User API endpoints
사용자 정보 관련 API
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_middleware import get_current_user_id
from app.models.user import User
from app.models.user_image import UserImage
from app.models.user_movie import UserMovie
from app.schemas.user import UserDeleteRequest, UserResponse, UserUpdate
from app.schemas.common import BaseResponse
from app.services.media_cleanup_service import (
    cleanup_media_references,
    lock_media_owner,
)
from app.services.response_serializers import serialize_user
from app.services.storage_service import storage_service

router = APIRouter(prefix="/users", tags=["users"])


def _validate_avatar_reference(avatar_url: str | None, user_id: str) -> str | None:
    normalized_avatar = storage_service.normalize_storage_reference(avatar_url)
    if not normalized_avatar:
        return None

    if storage_service.is_managed_reference(
        normalized_avatar
    ) and not storage_service.is_user_owned_reference(normalized_avatar, user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="본인에게 발급된 프로필 이미지 경로만 사용할 수 있습니다.",
        )

    return normalized_avatar


@router.get("/me", response_model=BaseResponse[UserResponse])
async def get_current_user_info(
    user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    """
    현재 로그인한 사용자 정보 조회

    - JWT 토큰에서 user_id 추출
    - 사용자 정보 반환
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다."
        )

    return BaseResponse(
        success=True, message="사용자 정보 조회 성공", data=serialize_user(user)
    )


@router.put("/me", response_model=BaseResponse[UserResponse])
async def update_current_user(
    user_update: UserUpdate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    현재 로그인한 사용자 프로필 수정

    - display_name: 사용자 이름
    - avatar_url: 프로필 이미지 URL
    - yearly_goal: 연간 목표 관람 수
    """
    user = lock_media_owner(db, user_id)

    # 제공된 필드만 업데이트
    update_data = user_update.model_dump(exclude_unset=True)
    if "avatar_url" in update_data:
        update_data["avatar_url"] = _validate_avatar_reference(
            update_data["avatar_url"], user_id
        )
        previous_avatar_key = storage_service.extract_file_key(user.avatar_url)
        if previous_avatar_key != storage_service.extract_file_key(
            update_data["avatar_url"]
        ):
            cleanup_media_references(
                db,
                user_id=user_id,
                references=[user.avatar_url],
                removed_avatar_user_id=user.id,
            )

    for field, value in update_data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)

    return BaseResponse(
        success=True, message="프로필이 수정되었습니다.", data=serialize_user(user)
    )


@router.delete("/me", response_model=BaseResponse[dict])
async def delete_current_user(
    delete_request: UserDeleteRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    현재 로그인한 사용자 삭제 (회원 탈퇴)

    - 사용자와 관련된 모든 데이터 삭제 (CASCADE)
    - user_movies, user_images, collections, custom_tags 모두 삭제됨
    """
    user = lock_media_owner(db, user_id)

    owned_movie_ids = db.query(UserMovie.id).filter(UserMovie.user_id == user_id)
    images = (
        db.query(UserImage)
        .filter(
            or_(
                UserImage.user_id == user_id,
                UserImage.user_movie_id.in_(owned_movie_ids),
            )
        )
        .all()
    )

    cleanup_media_references(
        db,
        user_id=user_id,
        references=[user.avatar_url]
        + [
            reference
            for image in images
            for reference in (image.image_url, image.thumbnail_url)
        ],
        removed_image_ids=[image.id for image in images],
        removed_avatar_user_id=user.id,
    )

    db.delete(user)
    db.commit()

    return BaseResponse(
        success=True,
        message="사용자가 삭제되었습니다.",
        data={"deleted_user_id": str(user_id)},
    )
