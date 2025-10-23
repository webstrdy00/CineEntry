"""
Media API endpoints
이미지 업로드 관련 API
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List

from app.database import get_db
from app.middleware.auth_middleware import get_current_user_id
from app.models.user_image import UserImage
from app.models.user_movie import UserMovie
from app.services.s3_service import s3_service
from app.schemas.image import (
    UploadUrlRequest,
    UploadUrlResponse,
    UserImageCreate,
    UserImageResponse
)
from app.schemas.common import BaseResponse

router = APIRouter(prefix="/media", tags=["media"])


@router.post("/upload", response_model=BaseResponse[UploadUrlResponse])
async def get_upload_url(
    request: UploadUrlRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    S3 Presigned URL 발급

    Frontend에서 사용 방법:
    1. 이 API로 upload_url, file_url 받기
    2. upload_url로 PUT 요청하여 이미지 업로드
       - Content-Type 헤더 설정 필수
       - Body에 이미지 파일 바이너리 데이터
    3. 업로드 성공 후 file_url을 DB에 저장 (POST /user-images)

    Args:
        file_name: 파일명 (e.g., 'ticket.jpg')
        file_type: MIME type (e.g., 'image/jpeg')

    Returns:
        upload_url: S3 업로드 URL (PUT 요청용, 15분 유효)
        file_url: 최종 파일 URL (GET 요청용)
        expires_in: URL 유효 시간 (초)
    """
    # 파일 타입 검증
    allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if request.file_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"지원하지 않는 파일 형식입니다. 허용: {', '.join(allowed_types)}"
        )

    try:
        # S3 Presigned URL 생성
        result = s3_service.generate_presigned_url(
            file_name=request.file_name,
            file_type=request.file_type,
            folder="filmory/user-images",
            expiration=900  # 15분
        )

        return BaseResponse(
            success=True,
            message="업로드 URL이 생성되었습니다.",
            data=UploadUrlResponse(
                upload_url=result["upload_url"],
                file_url=result["file_url"],
                file_key=result["file_key"],
                expires_in=900
            )
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"업로드 URL 생성 실패: {str(e)}"
        )


@router.post("/user-images", response_model=BaseResponse[UserImageResponse], status_code=status.HTTP_201_CREATED)
async def create_user_image(
    image_create: UserImageCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    UserImage 생성 (이미지 업로드 후 DB에 기록)

    이미지를 S3에 업로드한 후, 이 API로 DB에 기록
    - user_movie_id: 영화 ID (필수)
    - image_url: S3 file_url (필수)
    - image_type: 'ticket' or 'photocard' (필수)
    - thumbnail_url: 썸네일 URL (선택)

    NOTE: user_movie 소유권 확인
    """
    # user_movie 소유권 확인
    user_movie = db.query(UserMovie).filter(
        and_(UserMovie.id == image_create.user_movie_id, UserMovie.user_id == user_id)
    ).first()

    if not user_movie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="영화를 찾을 수 없습니다."
        )

    # 새 UserImage 생성
    new_image = UserImage(
        user_id=user_id,
        user_movie_id=image_create.user_movie_id,
        image_url=image_create.image_url,
        image_type=image_create.image_type,
        thumbnail_url=image_create.thumbnail_url
    )

    db.add(new_image)
    db.commit()
    db.refresh(new_image)

    return BaseResponse(
        success=True,
        message="이미지가 등록되었습니다.",
        data=new_image
    )


@router.get("/user-images", response_model=BaseResponse[List[UserImageResponse]])
async def get_user_images(
    user_movie_id: int = Query(..., description="영화 ID"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    영화별 이미지 목록 조회

    - user_movie_id로 필터링
    - 본인 영화만 조회 가능
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

    # 이미지 목록 조회
    images = db.query(UserImage).filter(
        and_(UserImage.user_movie_id == user_movie_id, UserImage.user_id == user_id)
    ).order_by(UserImage.created_at.desc()).all()

    return BaseResponse(
        success=True,
        message=f"이미지 목록 조회 성공 ({len(images)}개)",
        data=images
    )


@router.delete("/user-images/{image_id}", response_model=BaseResponse[dict])
async def delete_user_image(
    image_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    이미지 삭제

    - DB에서 UserImage 삭제
    - S3에서도 파일 삭제 시도 (실패해도 계속 진행)
    """
    # 이미지 찾기 (본인 이미지만)
    image = db.query(UserImage).filter(
        and_(UserImage.id == image_id, UserImage.user_id == user_id)
    ).first()

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="이미지를 찾을 수 없습니다."
        )

    # S3에서 파일 삭제 시도 (file_key 추출)
    # file_url 예시: https://bucket.s3.region.amazonaws.com/filmory/user-images/abc123.jpg
    # file_key 추출: filmory/user-images/abc123.jpg
    try:
        if "amazonaws.com/" in image.image_url:
            file_key = image.image_url.split("amazonaws.com/")[1]
            s3_service.delete_file(file_key)
    except Exception as e:
        print(f"⚠️  S3 파일 삭제 실패 (계속 진행): {e}")

    # DB에서 삭제
    db.delete(image)
    db.commit()

    return BaseResponse(
        success=True,
        message="이미지가 삭제되었습니다.",
        data={"deleted_image_id": image_id}
    )
