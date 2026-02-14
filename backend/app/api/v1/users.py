"""
User API endpoints
사용자 정보 관련 API
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_middleware import get_current_user_id
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate
from app.schemas.common import BaseResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=BaseResponse[UserResponse])
async def get_current_user_info(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    현재 로그인한 사용자 정보 조회

    - JWT 토큰에서 user_id 추출
    - 사용자 정보 반환
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )

    return BaseResponse(
        success=True,
        message="사용자 정보 조회 성공",
        data=user
    )


@router.put("/me", response_model=BaseResponse[UserResponse])
async def update_current_user(
    user_update: UserUpdate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    현재 로그인한 사용자 프로필 수정

    - display_name: 사용자 이름
    - avatar_url: 프로필 이미지 URL
    - yearly_goal: 연간 목표 관람 수
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )

    # 제공된 필드만 업데이트
    update_data = user_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)

    return BaseResponse(
        success=True,
        message="프로필이 수정되었습니다.",
        data=user
    )


@router.delete("/me", response_model=BaseResponse[dict])
async def delete_current_user(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    현재 로그인한 사용자 삭제 (회원 탈퇴)

    - 사용자와 관련된 모든 데이터 삭제 (CASCADE)
    - user_movies, user_images, collections, custom_tags 모두 삭제됨
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )

    db.delete(user)
    db.commit()

    return BaseResponse(
        success=True,
        message="사용자가 삭제되었습니다.",
        data={"deleted_user_id": str(user_id)}
    )
