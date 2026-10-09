"""Transactional cleanup outbox for managed media, with retryable deletion."""

import logging
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.media_cleanup_job import MediaCleanupJob
from app.models.user import User
from app.models.user_image import UserImage
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)
_RETRY_BASE_SECONDS = 30
_RETRY_MAX_SECONDS = 3600


def _locked_media_owner(db: Session, user_id: str | UUID) -> User | None:
    return (
        db.query(User)
        .filter(User.id == user_id)
        .populate_existing()
        .with_for_update()
        .first()
    )


def lock_media_owner(db: Session, user_id: str | UUID) -> User:
    """Lock the owner before reading or mutating media references, until commit.

    All reference mutations lock User first, then inspect their child rows. Refresh
    any cached user so a transaction that waited for this lock reads the new avatar.
    """
    user = _locked_media_owner(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다.",
        )
    return user


def _normalize_reference(reference: str | None) -> str | None:
    """Canonicalize explicit storage URIs even while storage is unconfigured."""
    if reference is None:
        return None
    trimmed = reference.strip()
    if trimmed.startswith(("gcs://", "gs://")):
        parsed = urlparse(trimmed)
        key = parsed.path.lstrip("/")
        if not parsed.netloc or not key:
            raise ValueError("Invalid storage reference")
        return f"gcs://{parsed.netloc}/{key}"
    return storage_service.normalize_storage_reference(reference)


def _discard_retained_references(
    db: Session,
    candidates: set[str],
    *,
    removed_image_ids: Iterable[int] = (),
    removed_avatar_user_id: str | UUID | None = None,
) -> bool:
    """Remove retained aliases; return False if any reference cannot be parsed.

    Scan all users, not just the owner, for legacy cross-owner references. Database
    errors propagate; only reference parsing failures defer physical deletion.
    """
    complete = True
    retained_images = db.query(UserImage.image_url, UserImage.thumbnail_url)
    removed_ids = tuple(removed_image_ids)
    if removed_ids:
        retained_images = retained_images.filter(UserImage.id.notin_(removed_ids))

    for image_url, thumbnail_url in retained_images.yield_per(500):
        for reference in (image_url, thumbnail_url):
            try:
                normalized = _normalize_reference(reference)
            except Exception:
                complete = False
                continue
            candidates.discard(normalized)
        if not candidates:
            return complete

    retained_avatars = db.query(User.avatar_url)
    if removed_avatar_user_id is not None:
        retained_avatars = retained_avatars.filter(User.id != removed_avatar_user_id)
    for (avatar_url,) in retained_avatars.yield_per(500):
        try:
            normalized = _normalize_reference(avatar_url)
        except Exception:
            complete = False
            continue
        candidates.discard(normalized)
        if not candidates:
            return complete
    return complete


def cleanup_media_references(
    db: Session,
    *,
    user_id: str | UUID,
    references: Iterable[str | None],
    removed_image_ids: Iterable[int] = (),
    removed_avatar_user_id: str | UUID | None = None,
) -> None:
    """Enqueue owned blobs without known retained image/avatar references.

    Call with the owner lock held, before changing or deleting database rows.
    Jobs and reference mutations share the caller's transaction: this function
    never commits, rolls back, or contacts storage. The worker rechecks references
    after commit, and defers deletion if any retained reference cannot be parsed.
    Only this request's candidates are deduplicated; duplicate jobs are safe and
    avoid unique-reference upserts introducing owner/job lock-order inversions.
    """
    candidates: set[str] = set()
    for reference in references:
        if reference and reference.strip().startswith(("gcs://", "gs://")):
            normalized = _normalize_reference(reference)
            if normalized and urlparse(normalized).path.lstrip("/").startswith(
                f"{storage_service.STORAGE_ROOT}/users/{user_id}/"
            ):
                candidates.add(normalized)
        elif storage_service.is_managed_reference(
            reference
        ) and storage_service.is_user_owned_reference(reference, str(user_id)):
            normalized = _normalize_reference(reference)
            if normalized:
                candidates.add(normalized)

    if not candidates:
        return

    _discard_retained_references(
        db,
        candidates,
        removed_image_ids=removed_image_ids,
        removed_avatar_user_id=removed_avatar_user_id,
    )
    owner_id = user_id if isinstance(user_id, UUID) else UUID(user_id)
    db.add_all(
        MediaCleanupJob(owner_id=owner_id, canonical_reference=reference)
        for reference in sorted(candidates)
    )


def _defer_job(job: MediaCleanupJob, error_code: str) -> None:
    job.attempts += 1
    delay = min(
        _RETRY_MAX_SECONDS,
        _RETRY_BASE_SECONDS * (2 ** min(job.attempts - 1, 7)),
    )
    job.next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
    # Never store/log exception text, signed URLs, object keys, or owner details.
    job.last_error = error_code
    logger.warning("Media cleanup job %s deferred (%s)", job.id, error_code)


def _process_job(db: Session, job: MediaCleanupJob) -> None:
    # A missing owner is expected after account deletion. No FK or relationship
    # ties jobs to users; a surviving owner stays locked through storage deletion.
    _locked_media_owner(db, job.owner_id)
    try:
        parsed = urlparse(job.canonical_reference)
        valid = (
            parsed.scheme == "gcs"
            and bool(parsed.netloc)
            and not parsed.query
            and not parsed.fragment
            and parsed.path.lstrip("/").startswith(
                f"{storage_service.STORAGE_ROOT}/users/{job.owner_id}/"
            )
            and _normalize_reference(job.canonical_reference) == job.canonical_reference
        )
    except Exception:
        valid = False
    if not valid:
        _defer_job(job, "reference_validation_failed")
        return

    if not storage_service.bucket_name:
        _defer_job(job, "storage_unconfigured")
        return
    if parsed.netloc != storage_service.bucket_name:
        _defer_job(job, "storage_bucket_mismatch")
        return
    try:
        owned = storage_service.is_managed_reference(
            job.canonical_reference
        ) and storage_service.is_user_owned_reference(
            job.canonical_reference, str(job.owner_id)
        )
    except Exception:
        _defer_job(job, "reference_validation_failed")
        return
    if not owned:
        _defer_job(job, "ownership_validation_failed")
        return

    candidates = {job.canonical_reference}
    complete = _discard_retained_references(db, candidates)
    if not candidates:
        db.delete(job)
        return
    if not complete:
        _defer_job(job, "reference_validation_failed")
        return

    try:
        deleted = storage_service.delete_file(job.canonical_reference)
    except Exception:
        deleted = False
    if deleted:
        db.delete(job)
    else:
        _defer_job(job, "storage_delete_failed")


def process_cleanup_jobs(batch_size: int = 20) -> int:
    """Handle at most batch_size due jobs; return the number committed.

    Each claimed job has its own session/transaction. PostgreSQL SKIP LOCKED
    excludes other workers, while the owner lock synchronizes reference writers.
    The count includes cancellations and rescheduled failures. Storage's missing
    object success makes retries safe after a crash between deletion and commit.
    Database failures propagate, rolling back the current job and closing its
    session; earlier jobs remain committed. Nonpositive batches do no work.
    """
    due_at = datetime.now(timezone.utc)
    processed = 0
    for _ in range(max(0, batch_size)):
        with SessionLocal() as db:
            with db.begin():
                job = (
                    db.query(MediaCleanupJob)
                    .filter(MediaCleanupJob.next_attempt_at <= due_at)
                    .order_by(MediaCleanupJob.next_attempt_at, MediaCleanupJob.id)
                    .with_for_update(skip_locked=True)
                    .first()
                )
                if job is None:
                    break
                _process_job(db, job)
            processed += 1
    return processed
