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
from app.schemas.image import StoredFileResponse, UserImageCreate, UserImageResponse
from app.schemas.common import BaseResponse
from app.services.media_cleanup_service import (
    cleanup_media_references,
    lock_media_owner,
)
from app.services.response_serializers import serialize_user_image
from app.services.storage_service import storage_service

router = APIRouter(prefix="/media", tags=["media"])

ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
UPLOAD_READ_CHUNK_BYTES = 1024 * 1024


def _format_file_size(byte_count: int) -> str:
    if byte_count >= 1024 * 1024:
        return f"{byte_count // (1024 * 1024)}MB"
    if byte_count >= 1024:
        return f"{byte_count // 1024}KB"
    return f"{byte_count}B"


def _validate_image_type(file_type: str | None) -> str:
    content_type = (file_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"지원하지 않는 파일 형식입니다. 허용: {', '.join(ALLOWED_IMAGE_TYPES)}",
        )

    return content_type


def _validate_image_size(file_size: int) -> None:
    if file_size > settings.MAX_IMAGE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                "이미지는 "
                f"{_format_file_size(settings.MAX_IMAGE_UPLOAD_BYTES)} 이하 파일만 업로드할 수 있습니다."
            ),
        )


def _validate_image_signature(content: bytes, content_type: str) -> None:
    signature_checks = {
        "image/jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
        "image/jpg": lambda data: data.startswith(b"\xff\xd8\xff"),
        "image/png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP",
    }
    is_valid = signature_checks[content_type](content)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="파일 내용이 이미지 형식과 일치하지 않습니다.",
        )


async def _read_limited_upload_file(file: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total_bytes = 0

    while True:
        chunk = await file.read(UPLOAD_READ_CHUNK_BYTES)
        if not chunk:
            break

        total_bytes += len(chunk)
        _validate_image_size(total_bytes)
        chunks.append(chunk)

    if total_bytes == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="빈 파일은 업로드할 수 없습니다.",
        )

    return b"".join(chunks)


def _normalize_owned_media_reference(
    file_reference: str | None, user_id: str, field_label: str
) -> str | None:
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


@router.post("/upload-file", response_model=BaseResponse[StoredFileResponse])
async def upload_file_via_backend(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """
    모든 클라이언트의 검증된 이미지 업로드 경로.

    - 실제 파일 크기와 MIME 형식에 맞는 이미지 시그니처를 저장 전에 검증
    - 본인 소유 경로에 저장한 뒤 미리보기용 Signed URL과 영구 참조값 반환
    """
    content_type = _validate_image_type(file.content_type)

    try:
        content = await _read_limited_upload_file(file)
        _validate_image_signature(content, content_type)
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
    except HTTPException:
        raise
    except Exception as e:
        print(f"파일 업로드 실패: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="파일 업로드에 실패했습니다.",
        )


@router.post(
    "/user-images",
    response_model=BaseResponse[UserImageResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_user_image(
    image_create: UserImageCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
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
    lock_media_owner(db, user_id)

    # user_movie 소유권 확인
    user_movie = (
        db.query(UserMovie)
        .filter(
            and_(
                UserMovie.id == image_create.user_movie_id, UserMovie.user_id == user_id
            )
        )
        .first()
    )

    if not user_movie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="영화를 찾을 수 없습니다."
        )

    image_url = _normalize_owned_media_reference(
        image_create.image_url, user_id, "이미지 경로"
    )
    if not image_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미지 경로가 필요합니다.",
        )

    thumbnail_url = _normalize_owned_media_reference(
        image_create.thumbnail_url, user_id, "썸네일 경로"
    )

    # 새 UserImage 생성
    new_image = UserImage(
        user_id=user_id,
        user_movie_id=image_create.user_movie_id,
        image_url=image_url,
        image_type=image_create.image_type,
        thumbnail_url=thumbnail_url,
    )

    db.add(new_image)
    db.commit()
    db.refresh(new_image)

    return BaseResponse(
        success=True,
        message="이미지가 등록되었습니다.",
        data=serialize_user_image(new_image),
    )


@router.get("/user-images", response_model=BaseResponse[List[UserImageResponse]])
async def get_user_images(
    user_movie_id: int = Query(..., description="영화 ID"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    영화별 이미지 목록 조회

    - user_movie_id로 필터링
    - 본인 영화만 조회 가능
    """
    # user_movie 소유권 확인
    user_movie = (
        db.query(UserMovie)
        .filter(and_(UserMovie.id == user_movie_id, UserMovie.user_id == user_id))
        .first()
    )

    if not user_movie:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="영화를 찾을 수 없습니다."
        )

    # 이미지 목록 조회
    images = (
        db.query(UserImage)
        .filter(
            and_(UserImage.user_movie_id == user_movie_id, UserImage.user_id == user_id)
        )
        .order_by(UserImage.created_at.desc())
        .all()
    )

    return BaseResponse(
        success=True,
        message=f"이미지 목록 조회 성공 ({len(images)}개)",
        data=[serialize_user_image(image) for image in images],
    )


@router.delete("/user-images/{image_id}", response_model=BaseResponse[dict])
async def delete_user_image(
    image_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    이미지 삭제

    - 다른 이미지나 프로필이 참조하지 않는 본인 파일만 삭제
    - 파일 삭제 실패 시 DB 참조를 유지하고 재시도 가능한 503 반환
    """
    lock_media_owner(db, user_id)

    # 이미지 찾기 (본인 이미지만)
    image = (
        db.query(UserImage)
        .filter(and_(UserImage.id == image_id, UserImage.user_id == user_id))
        .first()
    )

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="이미지를 찾을 수 없습니다."
        )

    cleanup_media_references(
        db,
        user_id=user_id,
        references=[image.image_url, image.thumbnail_url],
        removed_image_ids=[image.id],
    )

    # DB에서 삭제
    db.delete(image)
    db.commit()

    return BaseResponse(
        success=True,
        message="이미지가 삭제되었습니다.",
        data={"deleted_image_id": image_id},
    )
