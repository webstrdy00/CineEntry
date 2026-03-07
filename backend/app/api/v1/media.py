"""
Media API endpoints
이미지 업로드 관련 API
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List

from app.config import settings
from app.database import get_db
from app.middleware.auth_middleware import get_current_user_id
from app.models.user_image import UserImage
from app.models.user_movie import UserMovie
from app.schemas.image import (
    UploadUrlRequest,
    UploadUrlResponse,
    StoredFileResponse,
    UserImageCreate,
    UserImageResponse
)
from app.schemas.common import BaseResponse
from app.services.response_serializers import serialize_user_image
from app.services.storage_service import storage_service

router = APIRouter(prefix="/media", tags=["media"])

ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']


def _normalize_owned_media_reference(file_reference: str | None, user_id: str, field_label: str) -> str | None:
    normalized_reference = storage_service.normalize_storage_reference(file_reference)
    if not normalized_reference:
        return None

    if not storage_service.is_managed_reference(normalized_reference):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_label}는 GCS 업로드 결과여야 합니다.",
        )

    if not storage_service.is_user_owned_reference(normalized_reference, user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"본인에게 발급된 {field_label}만 사용할 수 있습니다.",
        )

    return normalized_reference


@router.post("/upload", response_model=BaseResponse[UploadUrlResponse])
async def get_upload_url(
    request: UploadUrlRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    GCS 업로드 Signed URL 발급

    Frontend에서 사용 방법:
    1. 이 API로 upload_url, file_url 받기
    2. upload_url로 PUT 요청하여 이미지 업로드
       - Content-Type 헤더 설정 필수
       - Body에 이미지 파일 바이너리 데이터
    3. 업로드 성공 후 storage_url 또는 file_url을 API에 전달 (POST /user-images)

    Args:
        file_name: 파일명 (e.g., 'ticket.jpg')
        file_type: MIME type (e.g., 'image/jpeg')

    Returns:
        upload_url: GCS 업로드 URL (PUT 요청용, 15분 유효)
        file_url: 업로드 직후 미리보기용 Signed URL
        storage_url: DB에 저장할 영구 참조값
        expires_in: URL 유효 시간 (초)
    """
    # 파일 타입 검증
    if request.file_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"지원하지 않는 파일 형식입니다. 허용: {', '.join(ALLOWED_IMAGE_TYPES)}"
        )

    try:
        result = storage_service.generate_upload_url(
            file_name=request.file_name,
            file_type=request.file_type,
            folder=storage_service.build_user_folder(user_id=user_id),
            expiration=settings.GCP_SIGNED_URL_EXPIRATION_SECONDS,
        )

        return BaseResponse(
            success=True,
            message="업로드 URL이 생성되었습니다.",
            data=UploadUrlResponse(
                upload_url=result["upload_url"],
                file_url=result["file_url"],
                file_key=result["file_key"],
                storage_url=result["storage_url"],
                expires_in=settings.GCP_SIGNED_URL_EXPIRATION_SECONDS,
            )
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"업로드 URL 생성 실패: {str(e)}"
        )


@router.post("/upload-file", response_model=BaseResponse[StoredFileResponse])
async def upload_file_via_backend(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """
    웹 브라우저용 백엔드 프록시 업로드.

    - 브라우저 CORS 이슈를 피하기 위해 파일을 백엔드로 먼저 업로드
    - 저장 후 즉시 미리보기용 Signed URL과 영구 참조값 반환
    """
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"지원하지 않는 파일 형식입니다. 허용: {', '.join(ALLOWED_IMAGE_TYPES)}"
        )

    try:
        content = await file.read()
        result = storage_service.upload_bytes(
            file_name=file.filename or f"upload_{user_id}.jpg",
            file_type=content_type,
            content=content,
            folder=storage_service.build_user_folder(user_id=user_id),
        )

        return BaseResponse(
            success=True,
            message="파일이 업로드되었습니다.",
            data=StoredFileResponse(
                file_url=result["file_url"],
                file_key=result["file_key"],
                storage_url=result["storage_url"],
            ),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"파일 업로드 실패: {str(e)}"
        )


@router.post("/user-images", response_model=BaseResponse[UserImageResponse], status_code=status.HTTP_201_CREATED)
async def create_user_image(
    image_create: UserImageCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    UserImage 생성 (이미지 업로드 후 DB에 기록)

    이미지를 GCS에 업로드한 후, 이 API로 DB에 기록
    - user_movie_id: 영화 ID (필수)
    - image_url: 업로드 결과 Signed URL 또는 gcs:// 참조값 (필수)
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

    image_url = _normalize_owned_media_reference(image_create.image_url, user_id, "이미지 경로")
    if not image_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미지 경로가 필요합니다.",
        )

    thumbnail_url = _normalize_owned_media_reference(image_create.thumbnail_url, user_id, "썸네일 경로")

    # 새 UserImage 생성
    new_image = UserImage(
        user_id=user_id,
        user_movie_id=image_create.user_movie_id,
        image_url=image_url,
        image_type=image_create.image_type,
        thumbnail_url=thumbnail_url
    )

    db.add(new_image)
    db.commit()
    db.refresh(new_image)

    return BaseResponse(
        success=True,
        message="이미지가 등록되었습니다.",
        data=serialize_user_image(new_image)
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
        data=[serialize_user_image(image) for image in images]
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
    - GCS에서도 파일 삭제 시도 (실패해도 계속 진행)
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

    try:
        storage_service.delete_file(image.image_url)
        storage_service.delete_file(image.thumbnail_url)
    except Exception as e:
        print(f"⚠️  GCS 파일 삭제 실패 (계속 진행): {e}")

    # DB에서 삭제
    db.delete(image)
    db.commit()

    return BaseResponse(
        success=True,
        message="이미지가 삭제되었습니다.",
        data={"deleted_image_id": image_id}
    )
