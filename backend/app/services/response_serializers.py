"""
API response serializers
저장 참조값을 응답용 URL로 직렬화
"""
from app.models.user import User
from app.models.user_image import UserImage
from app.schemas.auth import AuthUserResponse
from app.schemas.image import UserImageResponse
from app.schemas.user import UserResponse
from app.services.storage_service import storage_service


def serialize_auth_user(user: User) -> AuthUserResponse:
    avatar_storage_url = (
        storage_service.normalize_storage_reference(user.avatar_url)
        if storage_service.is_managed_reference(user.avatar_url)
        else None
    )

    return AuthUserResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        avatar_url=storage_service.resolve_file_url(user.avatar_url),
        avatar_storage_url=avatar_storage_url,
        auth_provider=user.auth_provider or "email",
        auth_methods=user.auth_methods,
        email_verified=user.email_verified,
        has_password=user.has_password,
    )


def serialize_user(user: User) -> UserResponse:
    avatar_storage_url = (
        storage_service.normalize_storage_reference(user.avatar_url)
        if storage_service.is_managed_reference(user.avatar_url)
        else None
    )

    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=storage_service.resolve_file_url(user.avatar_url),
        avatar_storage_url=avatar_storage_url,
        yearly_goal=user.yearly_goal,
        auth_provider=user.auth_provider or "email",
        auth_methods=user.auth_methods,
        email_verified=user.email_verified,
        has_password=user.has_password,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def serialize_user_image(image: UserImage) -> UserImageResponse:
    return UserImageResponse(
        id=image.id,
        user_movie_id=image.user_movie_id,
        image_type=image.image_type,
        image_url=storage_service.resolve_file_url(image.image_url) or image.image_url,
        thumbnail_url=storage_service.resolve_file_url(image.thumbnail_url),
        created_at=image.created_at,
    )
