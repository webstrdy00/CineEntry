import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from threading import Event
from time import monotonic, sleep
from unittest.mock import Mock, call
from uuid import uuid4

import pytest
from fastapi import HTTPException, status
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import Session

from app.api.v1 import media, movies, users
from app.database import Base
from app.models.collection import Collection
from app.models.collection_movie import CollectionMovie
from app.models.movie import Movie
from app.models.movie_tag import MovieTag
from app.models.tag import Tag
from app.models.user import User
from app.models.user_image import UserImage
from app.models.user_movie import UserMovie
from app.schemas.image import UserImageCreate
from app.schemas.user import UserDeleteRequest, UserUpdate
from app.services import media_cleanup_service, response_serializers
from app.services.storage_service import StorageService


def mock_storage(monkeypatch):
    storage = StorageService.__new__(StorageService)
    storage.bucket_name = "cleanup-test-bucket"
    storage.bucket = None
    storage.delete_file = Mock(return_value=True)
    storage.resolve_file_url = Mock(side_effect=lambda reference: reference)
    for module in (media, users, media_cleanup_service, response_serializers):
        monkeypatch.setattr(module, "storage_service", storage)
    monkeypatch.setattr(movies.auto_collection_service, "sync_all_for_user", Mock())
    return storage


@pytest.fixture
def cleanup_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    # Keep UUID bind/result processors, as in the catalog fixture, so ownership
    # filters round-trip real UUIDs rather than changing the production columns.
    monkeypatch.setattr(
        engine.dialect.type_compiler_instance,
        "visit_UUID",
        lambda type_, **kwargs: "CHAR(32)",
        raising=False,
    )
    # Account cascades query collections too; JSONB uses its normal JSON processors.
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
    storage = mock_storage(monkeypatch)

    with Session(engine) as db:
        owner_id, other_id = uuid4(), uuid4()
        db.add_all(
            [
                User(
                    id=owner_id,
                    email="cleanup-owner@example.com",
                    display_name="기존 이름",
                    yearly_goal=100,
                ),
                User(id=other_id, email="cleanup-other@example.com"),
            ]
        )
        db.commit()
        yield db, storage, owner_id, other_id
    engine.dispose()


@pytest.fixture
def postgres_cleanup_db(monkeypatch):
    if os.environ.get("CINEENTRY_INTEGRATION_TESTS") != "1":
        pytest.skip(
            "PostgreSQL row-lock regression requires the isolated audit database"
        )
    try:
        url = make_url(os.environ.get("DATABASE_URL", ""))
        safe = (
            url.drivername in {"postgresql", "postgresql+psycopg2"}
            and url.host in {"localhost", "127.0.0.1", "::1"}
            and url.port == 15439
            and url.database == "cineentry_audit"
            and bool(url.username)
            and bool(url.password)
            and not url.query
        )
    except (ArgumentError, TypeError, ValueError):
        safe = False
    if not safe or any(
        os.environ.get(name)
        for name in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE")
    ):
        pytest.fail("Refusing non-audit PostgreSQL connection or libpq overrides")

    # Same opt-in loopback audit target as test_backend_integration; use existing
    # migrated tables, never create/drop/truncate schemas or contact GCS.
    engine = create_engine(
        url,
        hide_parameters=True,
        connect_args={
            "connect_timeout": 3,
            "options": "-c statement_timeout=10000 -c lock_timeout=8000",
        },
    )
    storage = mock_storage(monkeypatch)
    owner_id = uuid4()
    movie_ids = []
    try:
        with Session(engine) as db:
            db.add(User(id=owner_id, email=f"cleanup-{owner_id.hex}@example.com"))
            db.commit()
            removed_record = add_record(db, owner_id)
            movie_ids.append(removed_record.movie_id)
            retained_record = add_record(db, owner_id)
            movie_ids.append(retained_record.movie_id)
            shared = reference(storage, owner_id, "shared.png")
            image = add_image(db, removed_record, shared)
            record_id, retained_record_id, image_id = (
                removed_record.id,
                retained_record.id,
                image.id,
            )
        yield engine, storage, owner_id, record_id, retained_record_id, image_id, shared
    finally:
        with Session(engine) as db:
            owner = db.get(User, owner_id)
            if owner is not None:
                db.delete(owner)
                db.flush()
            for movie_id in movie_ids:
                movie = db.get(Movie, movie_id)
                if movie is not None:
                    db.delete(movie)
            db.commit()
        engine.dispose()


def add_record(db, user_id):
    record = UserMovie(
        user_id=user_id,
        movie=Movie(title_ko="정리 테스트 작품"),
        status="completed",
        one_line_review="보존할 감상평",
    )
    db.add(record)
    db.commit()
    return record


def add_image(db, record, image_url, thumbnail_url=None):
    image = UserImage(
        user_id=record.user_id,
        user_movie_id=record.id,
        image_type="ticket",
        image_url=image_url,
        thumbnail_url=thumbnail_url,
    )
    db.add(image)
    db.commit()
    return image


def add_relations(db, record):
    tag = Tag(user_id=record.user_id, name="#정리 테스트")
    collection = Collection(user_id=record.user_id, name="보존할 컬렉션")
    db.add_all([tag, collection])
    db.flush()
    db.add_all(
        [
            MovieTag(user_movie_id=record.id, tag_id=tag.id),
            CollectionMovie(user_movie_id=record.id, collection_id=collection.id),
        ]
    )
    db.commit()


def reference(storage, user_id, name):
    return storage.build_storage_uri(f"{storage.build_user_folder(user_id)}/{name}")


def signed_alias(storage, storage_reference):
    return (
        f"https://storage.googleapis.com/{storage.bucket_name}/"
        f"{storage.extract_file_key(storage_reference)}?X-Goog-Signature=test-only"
    )


def remove_account(db, user_id):
    return asyncio.run(
        users.delete_current_user(
            UserDeleteRequest(confirmation_text="회원탈퇴"), user_id=user_id, db=db
        )
    )


def test_image_registration_normalizes_owned_reference_and_keeps_storage(cleanup_db):
    db, storage, owner_id, _ = cleanup_db
    record = add_record(db, owner_id)
    owned = reference(storage, owner_id, "image.png")

    response = asyncio.run(
        media.create_user_image(
            UserImageCreate(
                user_movie_id=record.id,
                image_type="ticket",
                image_url=signed_alias(storage, owned),
            ),
            user_id=owner_id,
            db=db,
        )
    )

    saved = db.get(UserImage, response.data.id)
    assert (saved.user_id, saved.user_movie_id, saved.image_url) == (
        owner_id,
        record.id,
        owned,
    )
    assert saved.thumbnail_url is None
    storage.delete_file.assert_not_called()


def test_image_without_thumbnail_deletes_blob_before_removing_row(cleanup_db):
    db, storage, owner_id, _ = cleanup_db
    record = add_record(db, owner_id)
    image_reference = reference(storage, owner_id, "image.png")
    image = add_image(db, record, image_reference)
    image_id, record_id = image.id, record.id

    def delete(file_reference):
        assert db.get(UserImage, image_id).image_url == file_reference
        return True

    storage.delete_file.side_effect = delete
    response = asyncio.run(media.delete_user_image(image_id, user_id=owner_id, db=db))

    assert response.data == {"deleted_image_id": image_id}
    storage.delete_file.assert_called_once_with(image_reference)
    assert db.get(UserImage, image_id) is None
    assert db.get(UserMovie, record_id) is not None


@pytest.mark.parametrize("alias_thumbnail", [False, True])
def test_image_and_thumbnail_references_are_normalized_and_deduplicated(
    cleanup_db, alias_thumbnail
):
    db, storage, owner_id, _ = cleanup_db
    image_reference = reference(storage, owner_id, "image.png")
    thumbnail = (
        signed_alias(storage, image_reference) if alias_thumbnail else image_reference
    )
    image = add_image(db, add_record(db, owner_id), image_reference, thumbnail)
    image_id = image.id

    asyncio.run(media.delete_user_image(image_id, user_id=owner_id, db=db))

    storage.delete_file.assert_called_once_with(image_reference)
    assert db.get(UserImage, image_id) is None


@pytest.mark.parametrize("retained_field", ["image_url", "thumbnail_url"])
@pytest.mark.parametrize("other_owner", [False, True])
def test_image_removal_preserves_blob_referenced_by_a_retained_image(
    cleanup_db, retained_field, other_owner
):
    db, storage, owner_id, other_id = cleanup_db
    shared = reference(storage, owner_id, "shared.png")
    image = add_image(db, add_record(db, owner_id), shared)
    image_id = image.id
    retained_owner_id = other_id if other_owner else owner_id
    retained = add_image(
        db,
        add_record(db, retained_owner_id),
        reference(storage, retained_owner_id, "retained.png"),
    )
    setattr(retained, retained_field, signed_alias(storage, shared))
    db.commit()
    retained_id = retained.id
    db.expunge_all()

    asyncio.run(media.delete_user_image(image_id, user_id=owner_id, db=db))

    storage.delete_file.assert_not_called()
    assert db.get(UserImage, image_id) is None
    assert getattr(db.get(UserImage, retained_id), retained_field) == signed_alias(
        storage, shared
    )


@pytest.mark.parametrize("other_owner", [False, True])
def test_image_removal_preserves_blob_referenced_by_a_retained_avatar(
    cleanup_db, other_owner
):
    db, storage, owner_id, other_id = cleanup_db
    shared = reference(storage, owner_id, "shared.png")
    image = add_image(db, add_record(db, owner_id), shared)
    image_id = image.id
    retained_owner_id = other_id if other_owner else owner_id
    db.get(User, retained_owner_id).avatar_url = signed_alias(storage, shared)
    db.commit()

    asyncio.run(media.delete_user_image(image_id, user_id=owner_id, db=db))

    storage.delete_file.assert_not_called()
    assert db.get(User, retained_owner_id).avatar_url == signed_alias(storage, shared)


@pytest.mark.parametrize("holder", ["image", "avatar"])
def test_movie_cascade_cleans_private_images_and_preserves_shared_blobs(
    cleanup_db, holder
):
    db, storage, owner_id, _ = cleanup_db
    record = add_record(db, owner_id)
    record_id, movie_id = record.id, record.movie_id
    shared = reference(storage, owner_id, "shared.png")
    thumbnail = reference(storage, owner_id, "thumbnail.png")
    private = reference(storage, owner_id, "private.png")
    image = add_image(db, record, shared, thumbnail)
    duplicate = add_image(db, record, private, signed_alias(storage, private))
    image_ids = [image.id, duplicate.id]
    if holder == "image":
        retained_record = add_record(db, owner_id)
        retained = add_image(db, retained_record, signed_alias(storage, shared))
        retained_id = retained.id
    else:
        db.get(User, owner_id).avatar_url = signed_alias(storage, shared)
        db.commit()
    add_relations(db, record)

    response = asyncio.run(movies.delete_movie(record_id, user_id=owner_id, db=db))

    assert response.data == {"user_movie_id": record_id}
    assert storage.delete_file.call_args_list == [call(private), call(thumbnail)]
    assert db.get(UserMovie, record_id) is None
    assert all(db.get(UserImage, image_id) is None for image_id in image_ids)
    assert db.get(Movie, movie_id) is not None
    assert db.query(MovieTag).count() == 0
    assert db.query(CollectionMovie).count() == 0
    assert db.query(Tag).count() == 1
    assert db.query(Collection).count() == 1
    if holder == "image":
        assert db.get(UserImage, retained_id).image_url == signed_alias(storage, shared)
    else:
        assert db.get(User, owner_id).avatar_url == signed_alias(storage, shared)


@pytest.mark.parametrize("holder", ["image", "avatar"])
def test_account_removal_deduplicates_cascades_and_preserves_retained_references(
    cleanup_db, holder
):
    db, storage, owner_id, other_id = cleanup_db
    shared = reference(storage, owner_id, "shared.png")
    private = reference(storage, owner_id, "private.png")
    record = add_record(db, owner_id)
    add_image(db, record, shared, private)
    add_image(db, add_record(db, owner_id), signed_alias(storage, private))
    db.get(User, owner_id).avatar_url = signed_alias(storage, shared)
    db.commit()
    add_relations(db, record)
    retained_record = add_record(db, other_id)
    retained_record_id = retained_record.id
    if holder == "image":
        retained = add_image(
            db,
            retained_record,
            reference(storage, other_id, "other.png"),
            signed_alias(storage, shared),
        )
        retained_id = retained.id
    else:
        db.get(User, other_id).avatar_url = signed_alias(storage, shared)
        db.commit()

    response = remove_account(db, owner_id)

    assert response.data == {"deleted_user_id": str(owner_id)}
    storage.delete_file.assert_called_once_with(private)
    assert db.get(User, owner_id) is None
    assert db.query(UserMovie).filter(UserMovie.user_id == owner_id).count() == 0
    assert db.query(UserImage).filter(UserImage.user_id == owner_id).count() == 0
    assert db.query(Tag).count() == 0
    assert db.query(Collection).count() == 0
    assert db.get(User, other_id) is not None
    assert db.get(UserMovie, retained_record_id).one_line_review == "보존할 감상평"
    if holder == "image":
        assert db.get(UserImage, retained_id).thumbnail_url == signed_alias(
            storage, shared
        )
    else:
        assert db.get(User, other_id).avatar_url == signed_alias(storage, shared)


def test_account_removal_cleans_unique_avatar_and_deduplicated_image_blobs(cleanup_db):
    db, storage, owner_id, other_id = cleanup_db
    avatar = reference(storage, owner_id, "a-avatar.png")
    image_reference = reference(storage, owner_id, "b-image.png")
    thumbnail = reference(storage, owner_id, "c-thumbnail.png")
    db.get(User, owner_id).avatar_url = signed_alias(storage, avatar)
    db.commit()
    add_image(db, add_record(db, owner_id), image_reference, thumbnail)
    add_image(db, add_record(db, owner_id), signed_alias(storage, image_reference))

    remove_account(db, owner_id)

    assert storage.delete_file.call_args_list == [
        call(avatar),
        call(image_reference),
        call(thumbnail),
    ]
    assert db.get(User, owner_id) is None
    assert db.get(User, other_id) is not None
    assert db.query(UserImage).count() == 0


@pytest.mark.parametrize("operation", ["image", "movie", "account"])
@pytest.mark.parametrize("failure", ["false", "exception"])
def test_partial_storage_failure_retains_database_graph_and_allows_retry(
    cleanup_db, operation, failure
):
    db, storage, owner_id, other_id = cleanup_db
    first = reference(storage, owner_id, "a-image.png")
    second = reference(storage, owner_id, "b-thumbnail.png")
    record = add_record(db, owner_id)
    image = add_image(db, record, first, second)
    image_id, record_id = image.id, record.id
    add_relations(db, record)
    if operation == "account":
        db.get(User, owner_id).avatar_url = signed_alias(storage, first)
        db.commit()
    other_record = add_record(db, other_id)
    other_image = add_image(db, other_record, reference(storage, other_id, "other.png"))
    other_record_id, other_image_id = other_record.id, other_image.id
    deleted = set()
    fail_once = [True]

    def delete(file_reference):
        if file_reference == second and fail_once[0]:
            fail_once[0] = False
            if failure == "exception":
                raise OSError("mock storage unavailable")
            return False
        # An already-deleted object succeeds on retry, matching the storage contract.
        deleted.add(file_reference)
        return True

    storage.delete_file.side_effect = delete

    def remove():
        if operation == "image":
            return asyncio.run(
                media.delete_user_image(image_id, user_id=owner_id, db=db)
            )
        if operation == "movie":
            return asyncio.run(movies.delete_movie(record_id, user_id=owner_id, db=db))
        return remove_account(db, owner_id)

    with pytest.raises(HTTPException) as exc_info:
        remove()

    assert exc_info.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert exc_info.value.headers == {"Retry-After": "30"}
    assert storage.delete_file.call_args_list == [call(first), call(second)]
    assert deleted == {first}
    db.expunge_all()
    assert db.get(User, owner_id).display_name == "기존 이름"
    assert db.get(UserMovie, record_id).one_line_review == "보존할 감상평"
    saved_image = db.get(UserImage, image_id)
    assert (saved_image.image_url, saved_image.thumbnail_url) == (first, second)
    assert db.query(Tag).count() == 1
    assert db.query(MovieTag).count() == 1
    assert db.query(Collection).count() == 1
    assert db.query(CollectionMovie).count() == 1
    assert db.get(UserMovie, other_record_id) is not None
    assert db.get(UserImage, other_image_id) is not None

    remove()

    assert deleted == {first, second}
    assert storage.delete_file.call_args_list == [
        call(first),
        call(second),
        call(first),
        call(second),
    ]
    assert db.get(UserImage, image_id) is None
    assert (db.get(UserMovie, record_id) is None) == (operation != "image")
    assert (db.get(User, owner_id) is None) == (operation == "account")
    assert db.get(User, other_id) is not None
    assert db.get(UserMovie, other_record_id) is not None
    assert db.get(UserImage, other_image_id) is not None


@pytest.mark.parametrize("operation", ["image", "movie", "account", "avatar"])
def test_missing_bucket_configuration_keeps_managed_database_references(
    cleanup_db, operation
):
    db, storage, owner_id, _ = cleanup_db
    owned = reference(storage, owner_id, "image.png")
    record = add_record(db, owner_id)
    image = add_image(db, record, owned)
    record_id, image_id = record.id, image.id
    if operation == "avatar":
        db.get(User, owner_id).avatar_url = owned
        db.commit()
    storage.bucket_name = None

    with pytest.raises(HTTPException) as exc_info:
        if operation == "image":
            asyncio.run(media.delete_user_image(image_id, user_id=owner_id, db=db))
        elif operation == "movie":
            asyncio.run(movies.delete_movie(record_id, user_id=owner_id, db=db))
        elif operation == "avatar":
            asyncio.run(
                users.update_current_user(
                    UserUpdate(avatar_url=None), user_id=owner_id, db=db
                )
            )
        else:
            remove_account(db, owner_id)

    assert exc_info.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    storage.delete_file.assert_not_called()
    db.expunge_all()
    assert db.get(User, owner_id) is not None
    assert db.get(UserMovie, record_id) is not None
    assert db.get(UserImage, image_id).image_url == owned
    if operation == "avatar":
        assert db.get(User, owner_id).avatar_url == owned


@pytest.mark.parametrize("operation", ["image", "movie", "account"])
def test_cleanup_never_deletes_another_users_storage_references(cleanup_db, operation):
    db, storage, owner_id, other_id = cleanup_db
    foreign = reference(storage, other_id, "foreign.png")
    owned = reference(storage, owner_id, "owned-thumbnail.png")
    record = add_record(db, owner_id)
    image = add_image(db, record, foreign, owned)
    image_id, record_id = image.id, record.id
    other_image = add_image(db, add_record(db, other_id), foreign)
    other_image_id = other_image.id
    db.get(User, owner_id).avatar_url = foreign
    db.commit()

    if operation == "image":
        asyncio.run(media.delete_user_image(image_id, user_id=owner_id, db=db))
    elif operation == "movie":
        asyncio.run(movies.delete_movie(record_id, user_id=owner_id, db=db))
    else:
        remove_account(db, owner_id)

    storage.delete_file.assert_called_once_with(owned)
    assert db.get(User, other_id) is not None
    assert db.get(UserImage, other_image_id).image_url == foreign


@pytest.mark.parametrize("operation", ["image", "movie", "create"])
def test_other_users_movies_and_images_cannot_be_mutated(cleanup_db, operation):
    db, storage, owner_id, other_id = cleanup_db
    record = add_record(db, other_id)
    image = add_image(db, record, reference(storage, other_id, "foreign.png"))
    image_id, record_id = image.id, record.id
    db.expunge_all()

    with pytest.raises(HTTPException) as exc_info:
        if operation == "image":
            asyncio.run(media.delete_user_image(image_id, user_id=owner_id, db=db))
        elif operation == "movie":
            asyncio.run(movies.delete_movie(record_id, user_id=owner_id, db=db))
        else:
            asyncio.run(
                media.create_user_image(
                    UserImageCreate(
                        user_movie_id=record_id,
                        image_type="ticket",
                        image_url=reference(storage, owner_id, "own.png"),
                    ),
                    user_id=owner_id,
                    db=db,
                )
            )

    assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND
    storage.delete_file.assert_not_called()
    assert db.get(UserMovie, record_id).user_id == other_id
    assert db.get(UserImage, image_id).user_id == other_id


@pytest.mark.parametrize("replacement", [None, "new.png"])
@pytest.mark.parametrize("failure", ["false", "exception"])
def test_avatar_storage_failure_preserves_all_profile_fields_and_allows_retry(
    cleanup_db, replacement, failure
):
    db, storage, owner_id, _ = cleanup_db
    old = reference(storage, owner_id, "old.png")
    new = reference(storage, owner_id, replacement) if replacement else None
    db.get(User, owner_id).avatar_url = old
    db.commit()
    update = UserUpdate(avatar_url=new, display_name="새 이름", yearly_goal=200)
    if failure == "exception":
        storage.delete_file.side_effect = OSError("mock storage unavailable")
    else:
        storage.delete_file.return_value = False

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(users.update_current_user(update, user_id=owner_id, db=db))

    assert exc_info.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert exc_info.value.headers == {"Retry-After": "30"}
    db.expunge_all()
    saved = db.get(User, owner_id)
    assert (saved.avatar_url, saved.display_name, saved.yearly_goal) == (
        old,
        "기존 이름",
        100,
    )
    storage.delete_file.assert_called_once_with(old)

    storage.delete_file.side_effect = None
    storage.delete_file.return_value = True
    response = asyncio.run(users.update_current_user(update, user_id=owner_id, db=db))

    assert response.data.avatar_url == new
    assert response.data.display_name == "새 이름"
    assert response.data.yearly_goal == 200
    assert db.get(User, owner_id).avatar_url == new
    assert storage.delete_file.call_args_list == [call(old), call(old)]


@pytest.mark.parametrize("holder", ["image", "thumbnail", "avatar"])
def test_avatar_replacement_preserves_blob_with_a_retained_reference(
    cleanup_db, holder
):
    db, storage, owner_id, other_id = cleanup_db
    old = reference(storage, owner_id, "old.png")
    new = reference(storage, owner_id, "new.png")
    db.get(User, owner_id).avatar_url = old
    db.commit()
    if holder == "avatar":
        db.get(User, other_id).avatar_url = signed_alias(storage, old)
        db.commit()
    else:
        add_image(
            db,
            add_record(db, owner_id),
            signed_alias(storage, old) if holder == "image" else new,
            signed_alias(storage, old) if holder == "thumbnail" else None,
        )

    response = asyncio.run(
        users.update_current_user(UserUpdate(avatar_url=new), user_id=owner_id, db=db)
    )

    storage.delete_file.assert_not_called()
    assert response.data.avatar_url == new
    assert db.get(User, owner_id).avatar_url == new


@pytest.mark.parametrize("include_avatar", [False, True])
def test_unchanged_avatar_or_unrelated_profile_update_does_not_delete_blob(
    cleanup_db, include_avatar
):
    db, storage, owner_id, _ = cleanup_db
    old = reference(storage, owner_id, "old.png")
    db.get(User, owner_id).avatar_url = old
    db.commit()
    update_data = {"display_name": "새 이름"}
    if include_avatar:
        update_data["avatar_url"] = signed_alias(storage, old)

    response = asyncio.run(
        users.update_current_user(UserUpdate(**update_data), user_id=owner_id, db=db)
    )

    storage.delete_file.assert_not_called()
    assert response.data.avatar_url == old
    assert response.data.display_name == "새 이름"


@pytest.mark.parametrize("operation", ["avatar", "account"])
@pytest.mark.parametrize(
    "old_reference",
    [
        "https://oauth.example.com/avatar.jpg",
        "gcs://unrelated-bucket/cineentry/users/foreign/uploads/avatar.jpg",
        "gcs://cleanup-test-bucket/cineentry/legacy/avatar.jpg",
    ],
)
def test_unmanaged_or_not_user_owned_avatars_are_never_deleted(
    cleanup_db, operation, old_reference
):
    db, storage, owner_id, _ = cleanup_db
    db.get(User, owner_id).avatar_url = old_reference
    db.commit()

    if operation == "avatar":
        new = reference(storage, owner_id, "new.png")
        response = asyncio.run(
            users.update_current_user(
                UserUpdate(avatar_url=new), user_id=owner_id, db=db
            )
        )
        assert response.data.avatar_url == new
    else:
        remove_account(db, owner_id)
        assert db.get(User, owner_id) is None

    storage.delete_file.assert_not_called()


def test_foreign_avatar_replacement_is_rejected_before_old_avatar_cleanup(cleanup_db):
    db, storage, owner_id, other_id = cleanup_db
    old = reference(storage, owner_id, "old.png")
    foreign = reference(storage, other_id, "foreign.png")
    db.get(User, owner_id).avatar_url = old
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            users.update_current_user(
                UserUpdate(avatar_url=foreign), user_id=owner_id, db=db
            )
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    storage.delete_file.assert_not_called()
    assert db.get(User, owner_id).avatar_url == old


@pytest.mark.parametrize("holder", ["image", "avatar"])
@pytest.mark.parametrize("operation", ["image", "movie"])
def test_postgres_concurrent_reference_write_commits_before_cleanup_scan(
    postgres_cleanup_db, holder, operation
):
    engine, storage, owner_id, record_id, retained_record_id, image_id, shared = (
        postgres_cleanup_db
    )
    writer_ready = Event()
    release_writer = Event()
    deletion_pid = Queue()

    def write_reference():
        with Session(engine) as db:

            @event.listens_for(db, "before_commit", once=True)
            def hold_owner_lock(_):
                writer_ready.set()
                if not release_writer.wait(timeout=10):
                    raise TimeoutError("Owner lock was not released by the test")

            if holder == "image":
                return asyncio.run(
                    media.create_user_image(
                        UserImageCreate(
                            user_movie_id=retained_record_id,
                            image_type="ticket",
                            image_url=signed_alias(storage, shared),
                        ),
                        user_id=owner_id,
                        db=db,
                    )
                )
            return asyncio.run(
                users.update_current_user(
                    UserUpdate(avatar_url=signed_alias(storage, shared)),
                    user_id=owner_id,
                    db=db,
                )
            )

    def remove():
        with Session(engine) as db:
            deletion_pid.put(db.execute(text("SELECT pg_backend_pid()")).scalar_one())
            if operation == "image":
                return asyncio.run(
                    media.delete_user_image(image_id, user_id=owner_id, db=db)
                )
            return asyncio.run(movies.delete_movie(record_id, user_id=owner_id, db=db))

    with ThreadPoolExecutor(max_workers=2) as executor:
        writer = executor.submit(write_reference)
        try:
            if not writer_ready.wait(timeout=5):
                writer.result(timeout=1)
                pytest.fail("Reference writer did not reach its locked commit")
            deletion = executor.submit(remove)
            pid = deletion_pid.get(timeout=5)
            deadline = monotonic() + 5
            observed_lock_wait = False
            while monotonic() < deadline:
                with engine.connect() as connection:
                    wait_type = connection.execute(
                        text(
                            "SELECT wait_event_type FROM pg_stat_activity WHERE pid = :pid"
                        ),
                        {"pid": pid},
                    ).scalar_one_or_none()
                if wait_type == "Lock":
                    observed_lock_wait = True
                    break
                if deletion.done():
                    deletion.result()
                    break
                sleep(0.02)
            assert observed_lock_wait
            assert not deletion.done()
        finally:
            release_writer.set()
        written = writer.result(timeout=10)
        deletion.result(timeout=10)

    storage.delete_file.assert_not_called()
    with Session(engine) as db:
        assert db.get(UserImage, image_id) is None
        assert db.get(UserMovie, retained_record_id) is not None
        if holder == "image":
            assert db.get(UserImage, written.data.id).image_url == shared
        else:
            assert db.get(User, owner_id).avatar_url == shared
