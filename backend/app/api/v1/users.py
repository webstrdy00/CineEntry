"""
User API endpoints
사용자 정보 관련 API
"""
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.middleware.auth_middleware import get_current_user_id
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate, UserCreate
from app.schemas.common import BaseResponse
from app.config import settings

router = APIRouter(prefix="/users", tags=["users"])


def verify_webhook_secret(x_webhook_secret: Optional[str] = Header(None)):
    """
    Webhook Secret 검증

    Supabase Webhook 또는 관리자 요청인지 확인
    - X-Webhook-Secret 헤더가 환경변수의 SUPABASE_WEBHOOK_SECRET과 일치해야 함

    Args:
        x_webhook_secret: X-Webhook-Secret 헤더 값

    Raises:
        HTTPException: 401 if secret is invalid or missing
    """
    if not settings.SUPABASE_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook secret is not configured"
        )

    if not x_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing webhook secret"
        )

    if x_webhook_secret != settings.SUPABASE_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid webhook secret"
        )

    return True


@router.get("/me", response_model=BaseResponse[UserResponse])
async def get_current_user(
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


@router.post("", response_model=BaseResponse[UserResponse], status_code=status.HTTP_201_CREATED)
async def create_user(
    user_create: UserCreate,
    db: Session = Depends(get_db),
    _verified: bool = Depends(verify_webhook_secret)  # Webhook Secret 검증 추가
):
    """
    새 사용자 생성 (Supabase Webhook용)

    🔒 보안: X-Webhook-Secret 헤더 검증 필요

    Supabase Auth에서 사용자 가입 시 Webhook으로 호출
    - email: 이메일 (필수)
    - display_name: 사용자 이름 (선택)
    - avatar_url: 프로필 이미지 URL (선택)

    Headers:
    - X-Webhook-Secret: Webhook 보안 시크릿 (환경변수와 일치해야 함)

    Example:
    ```bash
    curl -X POST http://localhost:8000/api/v1/users \\
      -H "X-Webhook-Secret: your-secret-key" \\
      -H "Content-Type: application/json" \\
      -d '{"email": "user@example.com"}'
    ```
    """
    # 이메일 중복 체크
    existing_user = db.query(User).filter(User.email == user_create.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 존재하는 이메일입니다."
        )

    # 새 사용자 생성
    new_user = User(
        email=user_create.email,
        display_name=user_create.display_name,
        avatar_url=user_create.avatar_url,
        yearly_goal=100  # 기본값
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return BaseResponse(
        success=True,
        message="사용자가 생성되었습니다.",
        data=new_user
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

    NOTE: Supabase Auth 사용자도 함께 삭제 필요 (Frontend에서 처리)
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
