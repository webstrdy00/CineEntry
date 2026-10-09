import asyncio
from datetime import date
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException, status
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.v1 import movies
from app.models.movie import Movie
from app.models.movie_tag import MovieTag
from app.models.tag import Tag
from app.models.user import User
from app.models.user_movie import UserMovie
from app.schemas.movie import MovieMetadata, MovieSearchResult, UserMovieUpdate
from app.services.external_api_service import ExternalAPIService, redis_service

PROVIDERS = [
    ("tmdb", "get_tmdb_metadata", "tmdb_id", 123, "movie"),
    ("tmdb_tv", "get_tmdb_tv_metadata", "tmdb_id", 123, "series"),
    ("kobis", "get_kobis_metadata", "kobis_code", "20210001", "movie"),
    ("kmdb", "get_kmdb_metadata", "kmdb_id", "K12345", "movie"),
]


@pytest.fixture
def movie_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    # SQLAlchemy 2.0.23 cannot compile native UUID DDL on SQLite. Scope this
    # override to this engine; keep the production UUID bind/result processors,
    # which store UUID.hex and restore UUID objects on non-native dialects.
    monkeypatch.setattr(
        engine.dialect.type_compiler_instance,
        "visit_UUID",
        lambda type_, **kwargs: "CHAR(32)",
        raising=False,
    )
    # Only these tables are needed; unrelated collections use PostgreSQL JSONB.
    for model in (User, Movie, UserMovie, Tag, MovieTag):
        model.__table__.create(engine)
    monkeypatch.setattr(
        movies.auto_collection_service, "sync_all_for_user", lambda *args: None
    )
    with Session(engine) as db:
        user_id = uuid4()
        db.add(User(id=user_id, email="catalog-test@example.invalid"))
        db.commit()
        yield db, user_id
    engine.dispose()


def add_library_record(db, user_id, movie):
    record = UserMovie(
        user_id=user_id,
        movie=movie,
        status="watching",
        rating=1,
        one_line_review="기존 기록",
        progress=10,
    )
    db.add(record)
    db.commit()
    return record


def add_other_owner(db, movie):
    other_id = uuid4()
    db.add(User(id=other_id, email=f"{other_id}@example.invalid"))
    return add_library_record(db, other_id, movie)


def test_sqlite_uuid_round_trip_preserves_user_ownership_filters(movie_db):
    db, user_id = movie_db
    movie = Movie(title_ko="공급자 작품", tmdb_id=123)
    own_record = add_library_record(db, user_id, movie)
    other_record = add_other_owner(db, movie)
    own_id, other_id = own_record.id, other_record.id
    db.add(Tag(name="#내 기록", user_id=user_id))
    db.commit()
    db.expunge_all()

    saved_user = db.query(User).filter(User.id == user_id).one()
    saved_record = db.query(UserMovie).filter(UserMovie.user_id == user_id).one()
    saved_tag = db.query(Tag).filter(Tag.user_id == user_id).one()
    saved_other = db.query(UserMovie).filter(UserMovie.id == other_id).one()

    assert saved_user.id == user_id
    assert saved_record.id == own_id
    assert saved_record.user_id == user_id
    assert saved_record.user.id == user_id
    assert saved_tag.user_id == user_id
    assert saved_other.user_id != user_id


@pytest.mark.parametrize("source,method,id_field,external_id,content_type", PROVIDERS)
def test_import_replaces_spoofed_fields_and_discards_cross_source_ids(
    movie_db, monkeypatch, source, method, id_field, external_id, content_type
):
    db, user_id = movie_db
    provider = MovieMetadata(
        title="공급자 제목",
        original_title="Provider title",
        content_type=content_type,
        release_channel="tv" if content_type == "series" else "theatrical",
        year=2021,
        director="공급자 감독",
        runtime=45,
        total_episodes=8 if content_type == "series" else None,
        genre="드라마",
        poster_url="https://example.invalid/provider.jpg",
        synopsis="공급자 줄거리",
        kobis_code="99999999",
        tmdb_id=999,
        kmdb_id="F99999",
    ).model_copy(update={id_field: external_id})
    fetch = AsyncMock(return_value=provider)
    monkeypatch.setattr(movies.external_api_service, method, fetch)
    submitted = MovieMetadata(
        title="위조 제목",
        original_title="Spoofed title",
        content_type=content_type,
        release_channel="ott_original",
        year=1900,
        director="위조 감독",
        runtime=1,
        total_episodes=999,
        genre="위조 장르",
        poster_url="https://example.invalid/spoofed.jpg",
        backdrop_url="https://example.invalid/spoofed-backdrop.jpg",
        synopsis="위조 줄거리",
        **{id_field: external_id},
    )

    response = asyncio.run(
        movies.create_movie_from_metadata(submitted, db=db, user_id=user_id)
    )
    saved = response.data

    fetch.assert_awaited_once_with(external_id)
    assert saved.title_ko == provider.title
    assert saved.title_original == provider.original_title
    assert saved.movie_type == provider.content_type
    assert saved.release_channel == provider.release_channel
    assert saved.production_year == provider.year
    assert saved.director == provider.director
    assert saved.runtime == provider.runtime
    assert saved.total_episodes == provider.total_episodes
    assert saved.genre == provider.genre
    assert saved.poster_url == provider.poster_url
    assert saved.backdrop_url is None
    assert saved.synopsis == provider.synopsis
    for field in ("kobis_code", "tmdb_id", "kmdb_id"):
        assert getattr(saved, field) == (external_id if field == id_field else None)
    assert db.query(Movie).count() == 1


@pytest.mark.parametrize(
    "extra_id", [{"kobis_code": "20210001"}, {"kmdb_id": "K12345"}]
)
def test_import_rejects_client_cross_source_aliases(movie_db, monkeypatch, extra_id):
    db, user_id = movie_db
    existing = Movie(title_ko="다른 작품", **extra_id)
    db.add(existing)
    db.commit()
    fetch = AsyncMock()
    monkeypatch.setattr(movies.external_api_service, "get_tmdb_metadata", fetch)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            movies.create_movie_from_metadata(
                MovieMetadata(title="위조 제목", tmdb_id=123, **extra_id),
                db=db,
                user_id=user_id,
            )
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    fetch.assert_not_awaited()
    assert db.query(Movie).count() == 1
    assert existing.tmdb_id is None
    assert existing.title_ko == "다른 작품"


@pytest.mark.parametrize("existing", [False, True])
@pytest.mark.parametrize("failure", [None, RuntimeError("provider unavailable")])
def test_import_fails_closed_when_provider_is_unavailable(
    movie_db, monkeypatch, existing, failure
):
    db, user_id = movie_db
    if existing:
        db.add(Movie(title_ko="기존 작품", tmdb_id=123, movie_type="movie"))
        db.commit()
    fetch = (
        AsyncMock(side_effect=failure)
        if isinstance(failure, Exception)
        else AsyncMock(return_value=None)
    )
    monkeypatch.setattr(movies.external_api_service, "get_tmdb_metadata", fetch)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            movies.create_movie_from_metadata(
                MovieMetadata(title="신뢰할 수 없는 대체 제목", tmdb_id=123),
                db=db,
                user_id=user_id,
            )
        )

    assert exc_info.value.status_code == status.HTTP_502_BAD_GATEWAY
    fetch.assert_awaited_once_with(123)
    assert db.query(Movie).count() == int(existing)
    if existing:
        assert db.query(Movie).one().title_ko == "기존 작품"


@pytest.mark.parametrize(
    "mismatch", [{"tmdb_id": 999}, {"tmdb_id": 123, "content_type": "series"}]
)
def test_import_rejects_mismatched_provider_identity(movie_db, monkeypatch, mismatch):
    db, user_id = movie_db
    fetch = AsyncMock(return_value=MovieMetadata(title="다른 공급자 작품", **mismatch))
    monkeypatch.setattr(movies.external_api_service, "get_tmdb_metadata", fetch)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            movies.create_movie_from_metadata(
                MovieMetadata(title="위조 제목", tmdb_id=123), db=db, user_id=user_id
            )
        )

    assert exc_info.value.status_code == status.HTTP_502_BAD_GATEWAY
    assert db.query(Movie).count() == 0


@pytest.mark.parametrize("source,method,id_field,external_id,content_type", PROVIDERS)
def test_canonical_preview_never_merges_client_fallback_or_other_provider_ids(
    monkeypatch, source, method, id_field, external_id, content_type
):
    provider = MovieMetadata(
        title="공급자 제목", content_type=content_type, **{id_field: external_id}
    )
    fetches = {}
    for _, provider_method, _, _, _ in PROVIDERS:
        fetches[provider_method] = AsyncMock(return_value=provider)
        monkeypatch.setattr(
            movies.external_api_service, provider_method, fetches[provider_method]
        )
    submitted = MovieSearchResult(
        title="위조 제목",
        year=1900,
        source=source,
        content_type="movie",  # The source, not a client content type, selects the TV endpoint.
        runtime=1,
        poster_url="https://example.invalid/spoofed.jpg",
        synopsis="신뢰할 수 없는 검색 결과",
        tmdb_id=123,
        kobis_code="20210001",
        kmdb_id="K12345",
    )

    response = asyncio.run(movies.merge_movie_metadata(submitted, user_id=str(uuid4())))

    assert response.data.model_dump() == provider.model_dump()
    fetches[method].assert_awaited_once_with(external_id)
    for other_method, fetch in fetches.items():
        if other_method != method:
            fetch.assert_not_awaited()


def test_canonical_preview_has_no_search_result_fallback_on_provider_failure(
    monkeypatch,
):
    monkeypatch.setattr(
        movies.external_api_service, "get_tmdb_metadata", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        movies.external_api_service, "get_kobis_metadata", AsyncMock(return_value=None)
    )
    submitted = MovieSearchResult(
        title="클라이언트 대체 제목",
        year=2021,
        source="tmdb",
        tmdb_id=123,
        kobis_code="20210001",
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(movies.merge_movie_metadata(submitted, user_id=str(uuid4())))

    assert exc_info.value.status_code == status.HTTP_502_BAD_GATEWAY
    movies.external_api_service.get_kobis_metadata.assert_not_awaited()


@pytest.mark.parametrize(
    "source,external_id",
    [
        ("tmdb", 0),
        ("tmdb_tv", -1),
        ("kobis", ""),
        ("kmdb", "invalid"),
        ("unknown", 123),
    ],
)
def test_invalid_provider_selectors_are_rejected(source, external_id):
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(movies.fetch_verified_metadata(source, external_id))

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.parametrize("source,method,id_field,external_id,content_type", PROVIDERS)
@pytest.mark.parametrize("matches", [None, False, True])
def test_provider_response_must_prove_the_requested_identifier(
    monkeypatch, source, method, id_field, external_id, content_type, matches
):
    response_id = (
        external_id if matches else (999 if id_field == "tmdb_id" else "F99999")
    )
    if matches is None:
        response_id = None
    if source == "tmdb":
        payload = {"id": response_id, "title": "공급자 제목"}
    elif source == "tmdb_tv":
        payload = {"id": response_id, "name": "공급자 제목"}
    elif source == "kobis":
        payload = {
            "movieInfoResult": {
                "movieInfo": {"movieCd": response_id, "movieNm": "공급자 제목"}
            }
        }
    else:
        payload = {
            "Data": [{"Result": [{"DOCID": response_id, "title": "공급자 제목"}]}]
        }
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json=payload)

    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original_client(
            transport=httpx.MockTransport(handle), **kwargs
        ),
    )
    monkeypatch.setattr(redis_service, "get_json", AsyncMock(return_value=None))
    monkeypatch.setattr(redis_service, "set_json", AsyncMock())

    metadata = asyncio.run(
        ExternalAPIService().get_verified_metadata(source, external_id)
    )

    assert len(requests) == 1
    assert requests[0].url.scheme == "https"
    if matches:
        assert metadata is not None
        assert getattr(metadata, id_field) == external_id
        assert metadata.title == "공급자 제목"
    else:
        assert metadata is None
    if source == "kmdb":
        assert requests[0].url.params["movieId"] == "K"
        assert requests[0].url.params["movieSeq"] == "12345"


@pytest.mark.parametrize(
    "identifier", [{"tmdb_id": 123}, {"kobis_code": "20210001"}, {"kmdb_id": "K12345"}]
)
@pytest.mark.parametrize("shared", [False, True])
def test_canonical_put_cannot_modify_source_metadata_even_for_a_sole_owner(
    movie_db, identifier, shared
):
    db, user_id = movie_db
    movie = Movie(
        title_ko="공급자 작품",
        genre="드라마",
        runtime=120,
        movie_type="movie",
        release_channel="theatrical",
        **identifier,
    )
    record = add_library_record(db, user_id, movie)
    if shared:
        add_other_owner(db, movie)
    before = {
        field: getattr(movie, field)
        for field in (
            "title_ko",
            "genre",
            "runtime",
            "movie_type",
            "release_channel",
            "total_episodes",
        )
    }

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            movies.update_movie(
                record.id,
                UserMovieUpdate(
                    genre="위조 장르",
                    runtime=1,
                    content_type="series",
                    release_channel="ott_original",
                    total_episodes=999,
                    rating=5,
                    status="completed",
                ),
                db=db,
                user_id=user_id,
            )
        )

    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    db.refresh(movie)
    db.refresh(record)
    assert {field: getattr(movie, field) for field in before} == before
    assert record.rating == 1
    assert record.status == "watching"
    assert record.watch_date is None


@pytest.mark.parametrize(
    "field", ["genre", "runtime", "content_type", "release_channel", "total_episodes"]
)
def test_canonical_put_rejects_explicit_null_metadata_without_partial_edits(
    movie_db, field
):
    db, user_id = movie_db
    record = add_library_record(db, user_id, Movie(title_ko="공급자 작품", tmdb_id=123))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            movies.update_movie(
                record.id,
                UserMovieUpdate(**{field: None, "one_line_review": "부분 수정 시도"}),
                db=db,
                user_id=user_id,
            )
        )

    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    assert record.one_line_review == "기존 기록"


def test_personal_edits_are_isolated_from_shared_canonical_metadata_and_other_users(
    movie_db,
):
    db, user_id = movie_db
    movie = Movie(
        title_ko="공급자 시리즈",
        tmdb_id=123,
        movie_type="series",
        runtime=45,
        total_episodes=8,
        genre="드라마",
    )
    record = add_library_record(db, user_id, movie)
    other = add_other_owner(db, movie)
    tag = Tag(name="#내 기록", user_id=user_id)
    db.add(MovieTag(user_movie_id=record.id, tag=tag))
    db.commit()
    watched_on = date(2026, 10, 8)

    response = asyncio.run(
        movies.update_movie(
            record.id,
            UserMovieUpdate(
                status="completed",
                rating=4.5,
                one_line_review="나만의 감상평",
                watch_date=watched_on,
                progress=90,
                current_season=2,
                current_episode=3,
                watch_method="ott",
                watch_location="집",
                watched_with="친구",
                is_best_movie=True,
            ),
            db=db,
            user_id=user_id,
        )
    )

    assert response.data.status == "completed"
    assert response.data.rating == 4.5
    assert response.data.review == "나만의 감상평"
    assert response.data.watch_date == watched_on
    assert response.data.progress == 90
    assert response.data.current_season == 2
    assert response.data.current_episode == 3
    assert response.data.watch_method == "ott"
    assert response.data.watch_location == "집"
    assert response.data.watched_with == "친구"
    assert response.data.is_best_movie is True
    assert [item.name for item in response.data.tags] == ["#내 기록"]
    db.refresh(movie)
    db.refresh(other)
    assert (movie.title_ko, movie.runtime, movie.total_episodes, movie.genre) == (
        "공급자 시리즈",
        45,
        8,
        "드라마",
    )
    assert (other.status, other.rating, other.one_line_review, other.progress) == (
        "watching",
        1,
        "기존 기록",
        10,
    )
    assert other.watch_date is None
    assert other.current_episode is None


def test_manual_record_creation_and_private_metadata_edits_remain_supported(
    movie_db, monkeypatch
):
    db, user_id = movie_db
    provider_fetch = AsyncMock()
    monkeypatch.setattr(
        movies.external_api_service, "get_verified_metadata", provider_fetch
    )
    created = asyncio.run(
        movies.create_movie_from_metadata(
            MovieMetadata(title="직접 등록한 작품", runtime=120, genre="드라마"),
            db=db,
            user_id=user_id,
        )
    )
    movie = created.data
    provider_fetch.assert_not_awaited()
    assert (movie.tmdb_id, movie.kobis_code, movie.kmdb_id) == (None, None, None)
    record = add_library_record(db, user_id, movie)

    response = asyncio.run(
        movies.update_movie(
            record.id,
            UserMovieUpdate(
                genre="코미디",
                runtime=30,
                content_type="series",
                release_channel="ott_original",
                total_episodes=6,
                current_episode=2,
                rating=4,
                one_line_review="개인 기록도 유지",
            ),
            db=db,
            user_id=user_id,
        )
    )

    assert response.data.genre == "코미디"
    assert response.data.runtime == 30
    assert response.data.content_type == "series"
    assert response.data.release_channel == "ott_original"
    assert response.data.total_episodes == 6
    assert response.data.current_episode == 2
    assert response.data.rating == 4
    assert response.data.review == "개인 기록도 유지"
    assert (movie.tmdb_id, movie.kobis_code, movie.kmdb_id) == (None, None, None)


def test_shared_manual_metadata_remains_protected(movie_db):
    db, user_id = movie_db
    movie = Movie(title_ko="공유된 직접 등록 작품", genre="드라마")
    record = add_library_record(db, user_id, movie)
    add_other_owner(db, movie)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            movies.update_movie(
                record.id, UserMovieUpdate(genre="위조 장르"), db=db, user_id=user_id
            )
        )

    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    assert movie.genre == "드라마"


@pytest.mark.parametrize("reverse_order", [False, True])
def test_search_display_enrichment_does_not_expose_cross_source_identity_aliases(
    reverse_order,
):
    results = [
        MovieSearchResult(
            title="괴물",
            original_title="The Host",
            year=2006,
            source="tmdb",
            tmdb_id=123,
            poster_url="https://example.invalid/provider.jpg",
            synopsis="공급자 줄거리",
            kobis_code="99999999",
            kmdb_id="F99999",
        ),
        MovieSearchResult(
            title="괴물",
            original_title="The Host",
            year=2006,
            source="kobis",
            kobis_code="20210001",
            director="봉준호",
            runtime=120,
            genre="드라마",
        ),
    ]
    if reverse_order:
        results.reverse()

    ranked = ExternalAPIService()._rank_and_dedupe("괴물", results)

    assert len(ranked) == 1
    assert ranked[0].source == "tmdb"
    assert ranked[0].tmdb_id == 123
    assert ranked[0].kobis_code is None
    assert ranked[0].kmdb_id is None
    assert ranked[0].director == "봉준호"
    assert ranked[0].runtime == 120
    assert ranked[0].poster_url == "https://example.invalid/provider.jpg"


def test_preview_requires_the_selected_sources_own_id_instead_of_a_foreign_alias(
    monkeypatch,
):
    fetch = AsyncMock()
    monkeypatch.setattr(movies.external_api_service, "get_kobis_metadata", fetch)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            movies.merge_movie_metadata(
                MovieSearchResult(
                    title="위조 제목", year=2021, source="kobis", tmdb_id=123
                ),
                user_id=str(uuid4()),
            )
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    fetch.assert_not_awaited()


def test_put_cannot_edit_another_users_personal_record(movie_db):
    db, user_id = movie_db
    movie = Movie(title_ko="공급자 작품", tmdb_id=123)
    record = add_other_owner(db, movie)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            movies.update_movie(
                record.id,
                UserMovieUpdate(
                    rating=5,
                    one_line_review="다른 사용자 기록 수정 시도",
                ),
                db=db,
                user_id=user_id,
            )
        )

    assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND
    assert record.rating == 1
    assert record.one_line_review == "기존 기록"
