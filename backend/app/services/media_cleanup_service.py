"""Fail-closed cleanup of managed media before its database references are removed."""

from collections.abc import Iterable
from typing import NoReturn
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.user_image import UserImage
from app.services.storage_service import storage_service


def lock_media_owner(db: Session, user_id: str | UUID) -> User:
    """Lock the owner before reading or mutating media references, until commit.

    All reference mutations lock User first, then inspect their child rows. Refresh
    any cached user so a transaction that waited for this lock reads the new avatar.
    """
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다.",
        )
    return user


def _raise_cleanup_failure(db: Session, exc: Exception) -> NoReturn:
    db.rollback()
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="파일 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        headers={"Retry-After": "30"},
    ) from exc


def cleanup_media_references(
    db: Session,
    *,
    user_id: str | UUID,
    references: Iterable[str | None],
    removed_image_ids: Iterable[int] = (),
    removed_avatar_user_id: str | UUID | None = None,
) -> None:
    """Delete only owned blobs with no retained image/avatar references.

    Call with the owner lock held, before changing or deleting database rows.
    Storage and the database are not atomic: a partial failure can leave retained
    rows pointing at blobs already deleted. Keeping every reference makes an
    idempotent retry possible.
    """
    candidates = set()
    for reference in references:
        if storage_service.is_managed_reference(
            reference
        ) and storage_service.is_user_owned_reference(reference, str(user_id)):
            try:
                normalized = storage_service.normalize_storage_reference(reference)
            except Exception as exc:
                _raise_cleanup_failure(db, exc)
            if normalized:
                candidates.add(normalized)

    if not candidates:
        return

    retained_images = db.query(UserImage.image_url, UserImage.thumbnail_url)
    removed_ids = tuple(removed_image_ids)
    if removed_ids:
        retained_images = retained_images.filter(UserImage.id.notin_(removed_ids))

    # Include other users' retained references too, including legacy URL aliases.
    # Stream the scan because stored references may be gcs://, gs:// or signed URLs.
    for image_url, thumbnail_url in retained_images.yield_per(500):
        candidates.discard(storage_service.normalize_storage_reference(image_url))
        candidates.discard(storage_service.normalize_storage_reference(thumbnail_url))
        if not candidates:
            return

    retained_avatars = db.query(User.avatar_url)
    if removed_avatar_user_id is not None:
        retained_avatars = retained_avatars.filter(User.id != removed_avatar_user_id)
    for (avatar_url,) in retained_avatars.yield_per(500):
        candidates.discard(storage_service.normalize_storage_reference(avatar_url))
        if not candidates:
            return

    for reference in sorted(candidates):
        try:
            if not storage_service.delete_file(reference):
                raise RuntimeError("Managed media deletion failed")
        except Exception as exc:
            _raise_cleanup_failure(db, exc)
