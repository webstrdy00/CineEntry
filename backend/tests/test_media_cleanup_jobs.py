"""SQLite outbox semantics; PostgreSQL lock concurrency lives in the audit suite."""

from datetime import datetime, timedelta, timezone
from unittest.mock import Mock
from urllib.parse import quote
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models.media_cleanup_job import MediaCleanupJob
from app.models.movie import Movie
from app.models.user import User
from app.models.user_image import UserImage
from app.models.user_movie import UserMovie
from app.services import media_cleanup_service
from app.services.storage_service import StorageService


@pytest.fixture
def cleanup_jobs_db(tmp_path, monkeypatch):
    # A file database proves committed work survives closed sessions/connections.
    engine = create_engine(f"sqlite:///{(tmp_path / 'cleanup-jobs.db').as_posix()}")
    monkeypatch.setattr(
        engine.dialect.type_compiler_instance,
        "visit_UUID",
        lambda type_, **kwargs: "CHAR(32)",
        raising=False,
    )
    monkeypatch.setattr(
        engine.dialect.type_compiler_instance,
        "visit_JSONB",
        lambda type_, **kwargs: "JSON",
        raising=False,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON").close()

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr(media_cleanup_service, "SessionLocal", factory)
    storage = StorageService.__new__(StorageService)
    storage.bucket_name = "cleanup-jobs-test-bucket"
    storage.bucket = None
    storage.delete_file = Mock(return_value=True)
    monkeypatch.setattr(media_cleanup_service, "storage_service", storage)
    owner_id, other_id = uuid4(), uuid4()
    try:
        with factory() as db:
            db.add_all(
                [
                    User(id=owner_id, email="jobs-owner@example.com"),
                    User(id=other_id, email="jobs-other@example.com"),
                ]
            )
            db.commit()
        yield engine, factory, storage, owner_id, other_id
    finally:
        engine.dispose()


def reference(storage, owner_id, name="image.png"):
    return storage.build_storage_uri(
        f"{storage.build_user_folder(str(owner_id))}/{name}"
    )


def test_enqueue_after_bucket_change_preserves_original_object(cleanup_jobs_db):
    _, factory, storage, owner_id, _ = cleanup_jobs_db
    original = reference(storage, owner_id)
    storage.bucket_name = "replacement-bucket"
    with factory() as db:
        media_cleanup_service.lock_media_owner(db, owner_id)
        media_cleanup_service.cleanup_media_references(
            db, user_id=owner_id, references=[original]
        )
        db.commit()
    assert media_cleanup_service.process_cleanup_jobs() == 1
    with factory() as db:
        job = db.query(MediaCleanupJob).one()
        assert job.canonical_reference == original
        assert job.last_error == "storage_bucket_mismatch"
        assert job.attempts == 1
    storage.delete_file.assert_not_called()


def alias(storage, canonical, kind="signed"):
    key = storage.extract_file_key(canonical)
    if kind == "gs":
        return canonical.replace("gcs://", "gs://", 1)
    if kind == "download":
        return (
            f"https://storage.googleapis.com/download/storage/v1/b/"
            f"{storage.bucket_name}/o/{quote(key, safe='')}?alt=media&token=test-only"
        )
    return (
        f"https://storage.googleapis.com/{storage.bucket_name}/{key}"
        "?X-Goog-Signature=test-only"
    )


def add_image(db, owner_id, image_url, thumbnail_url=None):
    record = UserMovie(
        user_id=owner_id,
        movie=Movie(title_ko="정리 작업 테스트"),
        status="completed",
    )
    db.add(record)
    db.flush()
    image = UserImage(
        user_id=owner_id,
        user_movie_id=record.id,
        image_type="ticket",
        image_url=image_url,
        thumbnail_url=thumbnail_url,
    )
    db.add(image)
    db.flush()
    return image


def add_job(factory, owner_id, canonical, **kwargs):
    with factory() as db:
        job = MediaCleanupJob(
            owner_id=owner_id, canonical_reference=canonical, **kwargs
        )
        db.add(job)
        db.flush()
        job_id = job.id
        db.commit()
    return job_id


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def freeze_clock(monkeypatch):
    now = datetime.now(timezone.utc) + timedelta(days=1)
    clock = Mock(wraps=datetime)
    clock.now.return_value = now
    monkeypatch.setattr(media_cleanup_service, "datetime", clock)
    return clock, now


def test_uncommitted_jobs_are_invisible_and_storage_waits_until_commit(cleanup_jobs_db):
    _, factory, storage, owner_id, _ = cleanup_jobs_db
    canonical = reference(storage, owner_id)
    with factory() as db:
        image = add_image(db, owner_id, canonical, alias(storage, canonical, "gs"))
        db.commit()
        image_id = image.id
        media_cleanup_service.lock_media_owner(db, owner_id)
        media_cleanup_service.cleanup_media_references(
            db,
            user_id=str(owner_id),
            references=[image.image_url, image.thumbnail_url, canonical],
            removed_image_ids=[image_id],
        )
        db.delete(image)
        db.flush()
        assert db.query(MediaCleanupJob).count() == 1
        assert media_cleanup_service.process_cleanup_jobs() == 0
        storage.delete_file.assert_not_called()
        db.commit()
        storage.delete_file.assert_not_called()

    with factory() as db:
        job = db.query(MediaCleanupJob).one()
        assert (job.owner_id, job.canonical_reference) == (owner_id, canonical)
        assert db.get(UserImage, image_id) is None
    assert media_cleanup_service.process_cleanup_jobs() == 1
    storage.delete_file.assert_called_once_with(canonical)
    with factory() as db:
        assert db.query(MediaCleanupJob).count() == 0


@pytest.mark.parametrize("operation", ["image", "avatar", "account"])
def test_caller_rollback_restores_references_and_removes_jobs(
    cleanup_jobs_db, operation
):
    _, factory, storage, owner_id, _ = cleanup_jobs_db
    canonical = reference(storage, owner_id)
    with factory() as db:
        if operation == "avatar":
            db.get(User, owner_id).avatar_url = canonical
            image_id = None
        else:
            image = add_image(db, owner_id, canonical)
            image_id = image.id
            if operation == "account":
                db.get(User, owner_id).avatar_url = alias(storage, canonical)
        db.commit()
        owner = media_cleanup_service.lock_media_owner(db, owner_id)
        media_cleanup_service.cleanup_media_references(
            db,
            user_id=owner_id,
            references=[canonical],
            removed_image_ids=[image_id] if image_id is not None else (),
            removed_avatar_user_id=owner_id if operation != "image" else None,
        )
        if operation == "image":
            db.delete(db.get(UserImage, image_id))
        elif operation == "avatar":
            owner.avatar_url = None
        else:
            db.delete(owner)
        db.flush()
        assert db.query(MediaCleanupJob).count() == 1
        storage.delete_file.assert_not_called()
        db.rollback()

    assert media_cleanup_service.process_cleanup_jobs() == 0
    with factory() as db:
        assert db.query(MediaCleanupJob).count() == 0
        assert db.get(User, owner_id) is not None
        if image_id is not None:
            assert db.get(UserImage, image_id).image_url == canonical
        if operation != "image":
            assert storage.extract_file_key(db.get(User, owner_id).avatar_url) == (
                storage.extract_file_key(canonical)
            )
    storage.delete_file.assert_not_called()


@pytest.mark.parametrize("holder", ["image", "thumbnail", "avatar"])
def test_enqueue_only_owned_unreferenced_canonical_candidates(cleanup_jobs_db, holder):
    _, factory, storage, owner_id, other_id = cleanup_jobs_db
    shared = reference(storage, owner_id, "shared.png")
    private = reference(storage, owner_id, "private.png")
    foreign = reference(storage, other_id, "foreign.png")
    with factory() as db:
        removed = add_image(db, owner_id, shared, private)
        db.get(User, owner_id).avatar_url = private
        if holder == "avatar":
            db.get(User, other_id).avatar_url = alias(storage, shared)
        else:
            add_image(
                db,
                other_id,
                alias(storage, shared) if holder == "image" else foreign,
                alias(storage, shared, "gs") if holder == "thumbnail" else None,
            )
        db.commit()
        media_cleanup_service.lock_media_owner(db, owner_id)
        media_cleanup_service.cleanup_media_references(
            db,
            user_id=owner_id,
            references=[
                shared,
                private,
                alias(storage, private),
                alias(storage, private, "gs"),
                foreign,
                "https://external.example.com/image.png",
                "gcs://unrelated-bucket/cineentry/legacy/image.png",
                None,
            ],
            removed_image_ids=[removed.id],
            removed_avatar_user_id=owner_id,
        )
        db.flush()
        assert [job.canonical_reference for job in db.query(MediaCleanupJob)] == [
            private
        ]
        db.commit()
    storage.delete_file.assert_not_called()


@pytest.mark.parametrize("holder", ["image", "thumbnail", "avatar"])
@pytest.mark.parametrize("other_owner", [False, True])
@pytest.mark.parametrize("alias_kind", ["gs", "signed", "download"])
def test_worker_cancels_when_a_reference_is_retained_after_enqueue(
    cleanup_jobs_db, holder, other_owner, alias_kind
):
    _, factory, storage, owner_id, other_id = cleanup_jobs_db
    canonical = reference(storage, owner_id)
    add_job(factory, owner_id, canonical)
    retained_owner = other_id if other_owner else owner_id
    retained = alias(storage, canonical, alias_kind)
    with factory() as db:
        if holder == "avatar":
            db.get(User, retained_owner).avatar_url = retained
        else:
            add_image(
                db,
                retained_owner,
                (
                    retained
                    if holder == "image"
                    else reference(storage, retained_owner, "retained.png")
                ),
                retained if holder == "thumbnail" else None,
            )
        db.commit()

    assert media_cleanup_service.process_cleanup_jobs() == 1
    storage.delete_file.assert_not_called()
    with factory() as db:
        assert db.query(MediaCleanupJob).count() == 0
        if holder == "avatar":
            assert db.get(User, retained_owner).avatar_url == retained
        else:
            image = db.query(UserImage).one()
            assert getattr(
                image, "image_url" if holder == "image" else "thumbnail_url"
            ) == (retained)


@pytest.mark.parametrize("failure", ["false", "exception"])
def test_failure_is_durable_sanitized_and_recovers_after_fresh_sessions(
    cleanup_jobs_db, monkeypatch, caplog, failure
):
    engine, factory, storage, owner_id, _ = cleanup_jobs_db
    clock, now = freeze_clock(monkeypatch)
    canonical = reference(storage, owner_id, "private-key.png")
    job_id = add_job(factory, owner_id, canonical)
    sensitive_error = f"storage failed at {alias(storage, canonical)}"
    if failure == "exception":
        storage.delete_file.side_effect = OSError(sensitive_error)
    else:
        storage.delete_file.return_value = False

    assert media_cleanup_service.process_cleanup_jobs(batch_size=20) == 1
    storage.delete_file.assert_called_once_with(canonical)
    with factory() as db:
        job = db.get(MediaCleanupJob, job_id)
        assert job.attempts == 1
        assert utc(job.next_attempt_at) == now + timedelta(seconds=30)
        assert job.last_error == "storage_delete_failed"
        assert job.canonical_reference == canonical
    assert sensitive_error not in caplog.text
    assert canonical not in caplog.text
    assert "private-key.png" not in caplog.text
    assert str(owner_id) not in caplog.text
    assert "storage_delete_failed" in caplog.text

    # Recreate sessions/connections rather than retaining a worker identity map.
    engine.dispose()
    restarted_factory = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr(media_cleanup_service, "SessionLocal", restarted_factory)
    assert media_cleanup_service.process_cleanup_jobs() == 0
    storage.delete_file.side_effect = None
    storage.delete_file.return_value = True
    clock.now.return_value = now + timedelta(seconds=31)
    assert media_cleanup_service.process_cleanup_jobs() == 1
    assert storage.delete_file.call_count == 2
    with restarted_factory() as db:
        assert db.get(MediaCleanupJob, job_id) is None


@pytest.mark.parametrize(
    "previous_attempts,delay", [(0, 30), (1, 60), (6, 1920), (7, 3600), (99, 3600)]
)
def test_retry_exponent_is_bounded_and_persisted(
    cleanup_jobs_db, monkeypatch, previous_attempts, delay
):
    _, factory, storage, owner_id, _ = cleanup_jobs_db
    _, now = freeze_clock(monkeypatch)
    job_id = add_job(
        factory, owner_id, reference(storage, owner_id), attempts=previous_attempts
    )
    storage.delete_file.return_value = False
    assert media_cleanup_service.process_cleanup_jobs(batch_size=100) == 1
    with factory() as db:
        job = db.get(MediaCleanupJob, job_id)
        assert job.attempts == previous_attempts + 1
        assert utc(job.next_attempt_at) == now + timedelta(seconds=delay)
    assert storage.delete_file.call_count == 1


def test_due_jobs_obey_batch_limit_and_future_jobs_are_skipped(
    cleanup_jobs_db, monkeypatch
):
    _, factory, storage, owner_id, _ = cleanup_jobs_db
    _, now = freeze_clock(monkeypatch)
    due_references = [reference(storage, owner_id, f"due-{i}.png") for i in range(3)]
    for canonical in due_references:
        add_job(
            factory, owner_id, canonical, next_attempt_at=now - timedelta(seconds=1)
        )
    future_id = add_job(
        factory,
        owner_id,
        reference(storage, owner_id, "future.png"),
        next_attempt_at=now + timedelta(seconds=1),
    )
    assert media_cleanup_service.process_cleanup_jobs(batch_size=2) == 2
    assert [
        call.args[0] for call in storage.delete_file.call_args_list
    ] == due_references[:2]
    assert media_cleanup_service.process_cleanup_jobs(batch_size=20) == 1
    assert [
        call.args[0] for call in storage.delete_file.call_args_list
    ] == due_references
    with factory() as db:
        assert [job.id for job in db.query(MediaCleanupJob)] == [future_id]


@pytest.mark.parametrize("batch_size", [0, -1])
def test_nonpositive_batch_does_not_open_a_session(
    cleanup_jobs_db, monkeypatch, batch_size
):
    _, _, storage, _, _ = cleanup_jobs_db
    session_factory = Mock(side_effect=AssertionError("No session should be opened"))
    monkeypatch.setattr(media_cleanup_service, "SessionLocal", session_factory)
    assert media_cleanup_service.process_cleanup_jobs(batch_size=batch_size) == 0
    session_factory.assert_not_called()
    storage.delete_file.assert_not_called()


def test_account_delete_keeps_jobs_and_missing_owner_is_normal(cleanup_jobs_db):
    _, factory, storage, owner_id, _ = cleanup_jobs_db
    canonical = reference(storage, owner_id)
    with factory() as db:
        owner = db.get(User, owner_id)
        owner.avatar_url = canonical
        image = add_image(db, owner_id, alias(storage, canonical), canonical)
        db.commit()
        owner = media_cleanup_service.lock_media_owner(db, owner_id)
        media_cleanup_service.cleanup_media_references(
            db,
            user_id=owner_id,
            references=[owner.avatar_url, image.image_url, image.thumbnail_url],
            removed_image_ids=[image.id],
            removed_avatar_user_id=owner_id,
        )
        db.delete(owner)
        db.commit()
    with factory() as db:
        assert db.get(User, owner_id) is None
        assert db.query(UserImage).count() == 0
        assert db.query(MediaCleanupJob).one().owner_id == owner_id
    storage.delete_file.assert_not_called()
    assert media_cleanup_service.process_cleanup_jobs() == 1
    storage.delete_file.assert_called_once_with(canonical)
    with factory() as db:
        assert db.query(MediaCleanupJob).count() == 0


@pytest.mark.parametrize("alias_kind", ["gs", "gcs"])
def test_explicit_uri_enqueues_without_bucket_configuration_and_retries(
    cleanup_jobs_db, monkeypatch, alias_kind
):
    _, factory, storage, owner_id, _ = cleanup_jobs_db
    clock, now = freeze_clock(monkeypatch)
    canonical = reference(storage, owner_id)
    original_bucket = storage.bucket_name
    with factory() as db:
        image = add_image(
            db, owner_id, canonical.replace("gcs://", f"{alias_kind}://", 1)
        )
        db.commit()
        storage.bucket_name = None
        media_cleanup_service.lock_media_owner(db, owner_id)
        media_cleanup_service.cleanup_media_references(
            db,
            user_id=owner_id,
            references=[image.image_url],
            removed_image_ids=[image.id],
        )
        db.delete(image)
        db.commit()
    assert media_cleanup_service.process_cleanup_jobs() == 1
    storage.delete_file.assert_not_called()
    with factory() as db:
        job = db.query(MediaCleanupJob).one()
        assert job.canonical_reference == canonical
        assert job.attempts == 1
        assert job.last_error == "storage_unconfigured"
        assert db.query(UserImage).count() == 0
    storage.bucket_name = original_bucket
    clock.now.return_value = now + timedelta(seconds=31)
    assert media_cleanup_service.process_cleanup_jobs() == 1
    storage.delete_file.assert_called_once_with(canonical)


def test_bucket_mismatch_defers_instead_of_dropping_job(cleanup_jobs_db, monkeypatch):
    _, factory, storage, owner_id, _ = cleanup_jobs_db
    clock, now = freeze_clock(monkeypatch)
    canonical = reference(storage, owner_id)
    job_id = add_job(factory, owner_id, canonical)
    original_bucket = storage.bucket_name
    storage.bucket_name = "different-configured-bucket"
    assert media_cleanup_service.process_cleanup_jobs() == 1
    storage.delete_file.assert_not_called()
    with factory() as db:
        job = db.get(MediaCleanupJob, job_id)
        assert job.attempts == 1
        assert job.last_error == "storage_bucket_mismatch"
    storage.bucket_name = original_bucket
    clock.now.return_value = now + timedelta(seconds=31)
    assert media_cleanup_service.process_cleanup_jobs() == 1
    storage.delete_file.assert_called_once_with(canonical)


@pytest.mark.parametrize(
    "invalid_kind", ["external", "foreign", "legacy", "alias", "signed"]
)
def test_invalid_or_unowned_jobs_are_retained_without_storage(
    cleanup_jobs_db, invalid_kind
):
    _, factory, storage, owner_id, other_id = cleanup_jobs_db
    canonical = reference(storage, owner_id)
    invalid = {
        "external": "https://external.example.com/image.png",
        "foreign": reference(storage, other_id),
        "legacy": f"gcs://{storage.bucket_name}/cineentry/legacy/image.png",
        "alias": alias(storage, canonical, "gs"),
        "signed": canonical + "?X-Goog-Signature=private",
    }[invalid_kind]
    job_id = add_job(factory, owner_id, invalid)
    assert media_cleanup_service.process_cleanup_jobs() == 1
    storage.delete_file.assert_not_called()
    with factory() as db:
        job = db.get(MediaCleanupJob, job_id)
        assert job.canonical_reference == invalid
        assert job.attempts == 1
        assert job.last_error == "reference_validation_failed"


@pytest.mark.parametrize("validation_failure", ["false", "exception"])
def test_managed_ownership_revalidation_failure_keeps_durable_job(
    cleanup_jobs_db, monkeypatch, validation_failure
):
    _, factory, storage, owner_id, _ = cleanup_jobs_db
    _, now = freeze_clock(monkeypatch)
    canonical = reference(storage, owner_id)
    job_id = add_job(factory, owner_id, canonical)
    validator = Mock(return_value=False)
    if validation_failure == "exception":
        validator.side_effect = ValueError("Private reference must not be logged")
    monkeypatch.setattr(storage, "is_user_owned_reference", validator)
    assert media_cleanup_service.process_cleanup_jobs() == 1
    storage.delete_file.assert_not_called()
    with factory() as db:
        job = db.get(MediaCleanupJob, job_id)
        assert job.canonical_reference == canonical
        assert job.attempts == 1
        assert utc(job.next_attempt_at) == now + timedelta(seconds=30)
        assert job.last_error == (
            "ownership_validation_failed"
            if validation_failure == "false"
            else "reference_validation_failed"
        )


def test_unparseable_retained_reference_defers_and_external_avatar_does_not_block(
    cleanup_jobs_db, monkeypatch
):
    _, factory, storage, owner_id, other_id = cleanup_jobs_db
    clock, now = freeze_clock(monkeypatch)
    canonical = reference(storage, owner_id)
    job_id = add_job(factory, owner_id, canonical)
    with factory() as db:
        db.get(User, other_id).avatar_url = "https://[unparseable-host/private-key.png"
        db.commit()
    assert media_cleanup_service.process_cleanup_jobs() == 1
    storage.delete_file.assert_not_called()
    with factory() as db:
        job = db.get(MediaCleanupJob, job_id)
        assert job.attempts == 1
        assert job.last_error == "reference_validation_failed"
        db.get(User, other_id).avatar_url = "https://oauth.example.com/avatar.png"
        db.commit()
    clock.now.return_value = now + timedelta(seconds=31)
    assert media_cleanup_service.process_cleanup_jobs() == 1
    storage.delete_file.assert_called_once_with(canonical)


def test_parse_failure_during_enqueue_keeps_durable_work_for_later_validation(
    cleanup_jobs_db, monkeypatch
):
    _, factory, storage, owner_id, other_id = cleanup_jobs_db
    freeze_clock(monkeypatch)
    canonical = reference(storage, owner_id)
    with factory() as db:
        image = add_image(db, owner_id, canonical)
        db.get(User, other_id).avatar_url = "gcs://[unparseable-host/private-key.png"
        db.commit()
        media_cleanup_service.lock_media_owner(db, owner_id)
        media_cleanup_service.cleanup_media_references(
            db,
            user_id=owner_id,
            references=[image.image_url],
            removed_image_ids=[image.id],
        )
        db.delete(image)
        db.commit()
    assert media_cleanup_service.process_cleanup_jobs() == 1
    storage.delete_file.assert_not_called()
    with factory() as db:
        assert db.query(UserImage).count() == 0
        assert (
            db.query(MediaCleanupJob).one().last_error == "reference_validation_failed"
        )


def test_duplicate_jobs_are_idempotent_even_when_object_is_already_missing(
    cleanup_jobs_db,
):
    _, factory, storage, owner_id, _ = cleanup_jobs_db
    canonical = reference(storage, owner_id)
    with factory() as db:
        media_cleanup_service.lock_media_owner(db, owner_id)
        for _ in range(2):
            media_cleanup_service.cleanup_media_references(
                db, user_id=owner_id, references=[canonical, alias(storage, canonical)]
            )
        db.commit()
        assert db.query(MediaCleanupJob).count() == 2
    remaining = {canonical}
    observed_missing = []

    def delete(file_reference):
        observed_missing.append(file_reference not in remaining)
        remaining.discard(file_reference)
        return True

    storage.delete_file.side_effect = delete
    assert media_cleanup_service.process_cleanup_jobs() == 2
    assert observed_missing == [False, True]
    assert media_cleanup_service.process_cleanup_jobs() == 0
    with factory() as db:
        assert db.query(MediaCleanupJob).count() == 0


def test_each_job_commits_in_its_own_closed_session(cleanup_jobs_db, monkeypatch):
    engine, factory, storage, owner_id, _ = cleanup_jobs_db
    references = [reference(storage, owner_id, f"job-{i}.png") for i in range(3)]
    for canonical in references:
        add_job(factory, owner_id, canonical)
    sessions = []

    class TrackingSession(Session):
        closed = False

        def close(self):
            self.closed = True
            super().close()

    tracking_factory = sessionmaker(
        bind=engine, autoflush=False, class_=TrackingSession
    )

    def tracked_session():
        db = tracking_factory()
        sessions.append(db)
        return db

    monkeypatch.setattr(media_cleanup_service, "SessionLocal", tracked_session)
    assert media_cleanup_service.process_cleanup_jobs(batch_size=3) == 3
    assert len(sessions) == 3
    assert all(db.closed and not db.in_transaction() for db in sessions)
    assert [call.args[0] for call in storage.delete_file.call_args_list] == references
    with factory() as db:
        assert db.query(MediaCleanupJob).count() == 0


def test_later_database_failure_does_not_rollback_an_earlier_job(
    cleanup_jobs_db, monkeypatch
):
    _, factory, storage, owner_id, _ = cleanup_jobs_db
    first = reference(storage, owner_id, "first.png")
    second = reference(storage, owner_id, "second.png")
    first_id = add_job(factory, owner_id, first)
    second_id = add_job(factory, owner_id, second)
    sessions = []

    def fail_commit(_):
        raise RuntimeError("Simulated second job commit failure")

    def session_factory():
        db = factory()
        db.close = Mock(wraps=db.close)
        sessions.append(db)
        if len(sessions) == 2:
            event.listen(db, "before_commit", fail_commit, once=True)
        return db

    monkeypatch.setattr(media_cleanup_service, "SessionLocal", session_factory)
    with pytest.raises(RuntimeError, match="Simulated second job"):
        media_cleanup_service.process_cleanup_jobs(batch_size=2)
    assert [call.args[0] for call in storage.delete_file.call_args_list] == [
        first,
        second,
    ]
    assert len(sessions) == 2
    for db in sessions:
        db.close.assert_called_once()
        assert not db.in_transaction()
    with factory() as db:
        assert db.get(MediaCleanupJob, first_id) is None
        assert db.get(MediaCleanupJob, second_id) is not None


def test_crash_after_blob_delete_rolls_back_job_and_next_execution_is_idempotent(
    cleanup_jobs_db, monkeypatch
):
    _, factory, storage, owner_id, _ = cleanup_jobs_db
    canonical = reference(storage, owner_id)
    job_id = add_job(factory, owner_id, canonical)
    remaining = {canonical}
    observed_missing = []

    def delete(file_reference):
        observed_missing.append(file_reference not in remaining)
        remaining.discard(file_reference)
        return True

    storage.delete_file.side_effect = delete
    crashed_sessions = []

    def crash_before_commit(_):
        raise RuntimeError("Simulated interruption after blob deletion")

    def interrupted_session():
        db = factory()
        db.close = Mock(wraps=db.close)
        event.listen(db, "before_commit", crash_before_commit, once=True)
        crashed_sessions.append(db)
        return db

    monkeypatch.setattr(media_cleanup_service, "SessionLocal", interrupted_session)
    with pytest.raises(RuntimeError, match="Simulated interruption"):
        media_cleanup_service.process_cleanup_jobs(batch_size=1)
    assert remaining == set()
    assert len(crashed_sessions) == 1
    crashed_sessions[0].close.assert_called_once()
    assert not crashed_sessions[0].in_transaction()
    with factory() as db:
        assert db.get(MediaCleanupJob, job_id).attempts == 0

    monkeypatch.setattr(media_cleanup_service, "SessionLocal", factory)
    assert media_cleanup_service.process_cleanup_jobs(batch_size=1) == 1
    assert observed_missing == [False, True]
    with factory() as db:
        assert db.get(MediaCleanupJob, job_id) is None
