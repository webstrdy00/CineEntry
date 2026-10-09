"""Opt-in API integration against the isolated, migrated audit PostgreSQL/Redis.

Run this file separately with CINEENTRY_INTEGRATION_TESTS=1, DATABASE_URL pointing
at localhost:15439/cineentry_audit, REDIS_URL at localhost:16389/0, DEBUG=True,
EMAIL_LOG_ONLY=True and an empty GCP_BUCKET_NAME. Apply Alembic first; this suite
checks migration heads but never creates tables, migrates, truncates or flushes.
Application imports happen only after the endpoint guard and with dotenv disabled.

These are real ASGI/lifespan, SQLAlchemy, PostgreSQL, Redis and JWT flows, not UI
fixtures or dependency-overridden route tests. Only email delivery, external
metadata providers and GCS operations are intercepted. Catalog records use the
supported manual metadata path, without external IDs. SMTP/provider availability,
OAuth and image upload/storage are intentionally outside this suite's evidence.
Deletion assertions cover populated movie, collection and tag relationships, not
UserImage cascades: this suite does not create uploaded image records.
"""

from __future__ import annotations

import asyncio
import importlib
import logging
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from unittest.mock import AsyncMock, Mock
from urllib.parse import parse_qs, urlsplit
from uuid import UUID, uuid4

import pytest

if os.environ.get("CINEENTRY_INTEGRATION_TESTS") != "1":
    pytest.skip(
        "Real audit PostgreSQL/Redis integration is explicitly opt-in",
        allow_module_level=True,
    )

import httpx
import pytest_asyncio
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from pydantic_settings import BaseSettings
from sqlalchemy import event, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

pytestmark = pytest.mark.asyncio

_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}
_TEST_PASSWORD = "Violet!7Quartz"


def _check(condition: bool, message: str) -> None:
    # Do not let assertion rewriting include tokens, email content or auth bodies.
    if not condition:
        pytest.fail(message, pytrace=False)


def _guard_audit_urls(database_url: str, redis_url: str) -> None:
    try:
        db = make_url(database_url)
        cache = urlsplit(redis_url)
        safe_db = (
            db.drivername in {"postgresql", "postgresql+psycopg2"}
            and db.host in _LOOPBACK_HOSTS
            and db.port == 15439
            and db.database == "cineentry_audit"
            and bool(db.username)
            and bool(db.password)
            and not db.query
        )
        safe_redis = (
            cache.scheme == "redis"
            and cache.hostname in _LOOPBACK_HOSTS
            and cache.port == 16389
            and cache.path in {"", "/", "/0"}
            and not cache.query
            and not cache.fragment
            and cache.username is None
            and cache.password is None
        )
    except (ArgumentError, TypeError, ValueError):
        safe_db = safe_redis = False
    _check(
        safe_db and safe_redis,
        "Refusing integration: only audit PostgreSQL localhost:15439/"
        "cineentry_audit with explicit test credentials and Redis "
        "localhost:16389/0 without URL overrides are permitted "
        "(connection values redacted)",
    )


@dataclass(repr=False)
class _Account:
    id: UUID
    email: str
    access_token: str = ""
    refresh_token: str = ""

    def replace_tokens(self, data: dict) -> None:
        access = data.get("access_token")
        refresh = data.get("refresh_token")
        _check(
            isinstance(access, str)
            and bool(access)
            and isinstance(refresh, str)
            and bool(refresh),
            "Authentication did not return a usable token pair",
        )
        self.access_token = access
        self.refresh_token = refresh


@dataclass(repr=False)
class _Audit:
    client: httpx.AsyncClient
    database: object
    redis: object
    delete_file: Mock
    run_id: str = field(default_factory=lambda: uuid4().hex)
    emails: set[str] = field(default_factory=set)
    movie_titles: set[str] = field(default_factory=set)
    verification_tokens: dict[str, list[str]] = field(default_factory=dict)
    redis_keys: set[str] = field(default_factory=set)

    def capture_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str | None = None,
    ) -> None:
        _check(to_email in self.emails, "Email delivery targeted a non-test account")
        tokens = []
        for line in (text_body or "").splitlines():
            parsed = urlsplit(line.strip())
            if parsed.path == "/api/v1/auth/email/verify":
                tokens.extend(parse_qs(parsed.query).get("token", []))
        _check(len(tokens) == 1, "Expected one verification link in captured delivery")
        self.verification_tokens.setdefault(to_email, []).append(tokens[0])
        self.redis_keys.add(f"auth:verify-email:token:{tokens[0]}")
        # Subject and bodies are deliberately neither retained nor printed.

    async def request(
        self,
        method: str,
        path: str,
        account: _Account | None = None,
        *,
        expected: int = 200,
        **kwargs,
    ) -> httpx.Response:
        headers = {}
        if account is not None:
            headers["Authorization"] = f"Bearer {account.access_token}"
        response = await self.client.request(method, path, headers=headers, **kwargs)
        _check(
            response.status_code == expected,
            f"{method} {path}: expected HTTP {expected}, got "
            f"{response.status_code} (response body redacted)",
        )
        if path.startswith("/api/v1/auth/"):
            _check(
                response.headers.get("cache-control") == "no-store"
                and response.headers.get("pragma") == "no-cache"
                and response.headers.get("x-content-type-options") == "nosniff",
                "Authentication responses must be non-cacheable and nosniff",
            )
        return response

    async def data(self, method: str, path: str, account=None, **kwargs):
        response = await self.request(method, path, account, **kwargs)
        envelope = response.json()
        _check(envelope.get("success") is True, f"{method} {path} did not succeed")
        _check("data" in envelope, f"{method} {path} omitted its response data")
        return envelope["data"]

    async def register(self, *, verified: bool = True) -> _Account:
        email = f"cineentry-it-{self.run_id}-{len(self.emails)}@example.com"
        self.emails.add(email)
        for purpose in ("register", "login"):
            self.redis_keys.add(f"auth:rate-limit:{purpose}:email:{email}")
        for purpose in ("verify-email", "password-reset"):
            self.redis_keys.add(f"auth:flow:cooldown:{purpose}:{email}")
        data = await self.data(
            "POST",
            "/api/v1/auth/register",
            expected=201,
            json={
                "email": email,
                "password": _TEST_PASSWORD,
                "display_name": "통합 검증",
            },
        )
        account = _Account(UUID(data["user"]["id"]), email)
        _check(data["user"]["email"] == email, "Registration returned another account")
        _check(
            data["user"]["email_verified"] is False, "Registration skipped verification"
        )
        account.replace_tokens(data["tokens"])
        with self.database.SessionLocal() as db:
            from app.models.user import User

            row = db.get(User, account.id)
            _check(
                row is not None
                and row.email == email
                and bool(row.password_hash)
                and row.password_hash != _TEST_PASSWORD
                and not row.email_verified,
                "Registration was not persisted with a hashed password",
            )
        if verified:
            await self.verify_email(account)
            await self.login(account)
        return account

    async def verify_email(self, account: _Account) -> None:
        tokens = self.verification_tokens.get(account.email, [])
        _check(len(tokens) == 1, "Registration did not deliver one verification email")
        token = tokens[0]
        key = f"auth:verify-email:token:{token}"
        payload = await self.redis.get_json(key)
        _check(
            payload is not None
            and payload.get("user_id") == str(account.id)
            and payload.get("email") == account.email,
            "Verification token was not stored for this account in actual Redis",
        )
        _check(await self.redis.ttl(key) > 0, "Verification token has no Redis expiry")
        response = await self.request(
            "GET",
            "/api/v1/auth/email/verify",
            params={"token": token},
        )
        _check(
            response.headers.get("content-type", "").startswith("text/html")
            and "status-icon success" in response.text,
            "Verification link did not render a successful verification page",
        )
        _check(await self.redis.get(key) is None, "Verification token was not consumed")
        current = await self.data("GET", "/api/v1/auth/me", account)
        _check(
            current["email_verified"] is True,
            "Verified account state was not persisted",
        )

    async def login(self, account: _Account) -> None:
        data = await self.data(
            "POST",
            "/api/v1/auth/login",
            json={"email": account.email, "password": _TEST_PASSWORD},
        )
        _check(data["user"]["id"] == str(account.id), "Login returned another account")
        account.replace_tokens(data["tokens"])

    async def manual_movie(self, account: _Account, **metadata) -> int:
        title = f"audit-{self.run_id}-{len(self.movie_titles)}"
        self.movie_titles.add(title)
        data = await self.data(
            "POST",
            "/api/v1/movies/from-metadata",
            account,
            expected=201,
            json={"title": title, "year": 2026, **metadata},
        )
        movie_id = data["id"]
        with self.database.SessionLocal() as db:
            from app.models.movie import Movie

            row = db.get(Movie, movie_id)
            _check(
                row is not None
                and row.title_ko == title
                and row.tmdb_id is None
                and row.kobis_code is None
                and row.kmdb_id is None,
                "Manual catalog metadata was not persisted without provider identifiers",
            )
        return movie_id

    async def add_movie(self, account: _Account, movie_id: int, **personal) -> dict:
        return await self.data(
            "POST",
            "/api/v1/movies/",
            account,
            expected=201,
            json={"movie_id": movie_id, "status": "watchlist", **personal},
        )

    async def collection(self, account: _Account) -> int:
        data = await self.data(
            "POST",
            "/api/v1/collections/",
            account,
            expected=201,
            json={"name": "통합 검증 컬렉션", "description": "실제 DB 검증"},
        )
        return data["id"]

    async def tag(self, account: _Account) -> int:
        data = await self.data(
            "POST",
            "/api/v1/tags",
            account,
            expected=201,
            json={"name": "통합 검증 태그"},
        )
        return data["id"]

    async def cleanup(self) -> None:
        # Resolve even an account committed before a failed response, then delete
        # by explicit UUID only. Never delete by broad prefixes or clear tables.
        from app.models.movie import Movie
        from app.models.user import User

        with self.database.SessionLocal() as db:
            owned_user_ids = set()
            if self.emails:
                owned_user_ids.update(
                    row.id
                    for row in db.query(User.id).filter(User.email.in_(self.emails))
                )
            if owned_user_ids:
                db.query(User).filter(User.id.in_(owned_user_ids)).delete(
                    synchronize_session=False
                )
            if self.movie_titles:
                # The API has no catalog-delete endpoint. Remove only our UUID-
                # named manual catalog rows, and preserve any borrowed by others.
                owned = db.query(Movie.id).filter(
                    Movie.title_ko.in_(self.movie_titles),
                    Movie.tmdb_id.is_(None),
                    Movie.kobis_code.is_(None),
                    Movie.kmdb_id.is_(None),
                    ~Movie.user_movies.any(),
                )
                movie_ids = [row.id for row in owned]
                if movie_ids:
                    db.query(Movie).filter(
                        Movie.id.in_(movie_ids),
                        Movie.title_ko.in_(self.movie_titles),
                        ~Movie.user_movies.any(),
                    ).delete(synchronize_session=False)
            db.commit()
        if self.redis_keys:
            # Exact test-owned token/rate-limit keys only: no scan, FLUSHDB or FLUSHALL.
            await self.redis.redis_client.delete(*self.redis_keys)
        self.verification_tokens.clear()


@pytest_asyncio.fixture
async def audit(monkeypatch):
    database_url = os.environ.get("DATABASE_URL", "")
    redis_url = os.environ.get("REDIS_URL", "")
    _guard_audit_urls(database_url, redis_url)
    _check(
        not any(
            os.environ.get(name)
            for name in (
                "PGHOSTADDR",
                "PGSERVICE",
                "PGSERVICEFILE",
                "PGPASSFILE",
            )
        ),
        "Integration refuses libpq host/service/credential-file overrides",
    )
    _check(
        os.environ.get("DEBUG", "").lower() in {"true", "1"}
        and os.environ.get("EMAIL_LOG_ONLY", "").lower() in {"true", "1"}
        and not os.environ.get("GCP_BUCKET_NAME"),
        "Integration requires explicit DEBUG=True, EMAIL_LOG_ONLY=True and no GCS bucket",
    )

    original_init = BaseSettings.__init__

    def env_only_init(self, *args, **kwargs):
        kwargs["_env_file"] = None
        original_init(self, *args, **kwargs)

    # Never load .env to find credentials or discover a database. If other tests
    # already imported the app, validate its effective configuration before use.
    with monkeypatch.context() as import_guard:
        import_guard.setattr(BaseSettings, "__init__", env_only_init)
        config = importlib.import_module("app.config")
        _guard_audit_urls(config.settings.DATABASE_URL, config.settings.REDIS_URL)
        _check(
            config.settings.DEBUG
            and config.settings.EMAIL_LOG_ONLY
            and not config.settings.GCP_BUCKET_NAME
            and config.settings.JWT_SECRET_KEY == os.environ.get("JWT_SECRET_KEY"),
            "Existing app settings are not the explicitly supplied audit settings",
        )
        database = importlib.import_module("app.database")
        _guard_audit_urls(
            database.engine.url.render_as_string(hide_password=False), redis_url
        )
        _check(
            database.engine.url == make_url(database_url),
            "App engine differs from audit URL",
        )
        _check(
            database.SessionLocal.kw.get("bind") is database.engine,
            "App sessions are not bound to the actual guarded PostgreSQL engine",
        )
        # DEBUG enables parameter echo in production code; credentials and email
        # content must not appear in integration logs or assertion failures.
        monkeypatch.setattr(database.engine, "echo", False)
        monkeypatch.setattr(database.engine, "hide_parameters", True)
        app = importlib.import_module("app.main").app

    _check(
        not app.dependency_overrides, "Integration must not use dependency overrides"
    )
    for logger_name in ("httpx", "httpcore"):
        # Keep warnings/errors, but prevent INFO URL logging of verification tokens.
        monkeypatch.setattr(logging.getLogger(logger_name), "level", logging.WARNING)

    from app.services.email_service import email_service
    from app.services.external_api_service import external_api_service
    from app.services.redis_service import redis_service
    from app.services.storage_service import storage_service

    _check(
        not storage_service.bucket_name
        and storage_service.client is None
        and storage_service.bucket is None,
        "Integration refuses an initialized external GCS client",
    )
    _check(
        redis_service.redis_client is None,
        "Run integration without an existing Redis client",
    )
    provider_mocks = []
    for method in (
        "search_kobis",
        "search_tmdb",
        "search_kmdb",
        "get_tmdb_metadata",
        "get_tmdb_tv_metadata",
        "get_kobis_metadata",
        "get_kmdb_metadata",
    ):
        blocked = AsyncMock(
            side_effect=AssertionError("External provider disabled in manual tests")
        )
        monkeypatch.setattr(external_api_service, method, blocked)
        provider_mocks.append(blocked)
    delete_file = Mock(return_value=False)
    monkeypatch.setattr(storage_service, "delete_file", delete_file)
    for method in ("upload_bytes", "generate_download_url"):
        monkeypatch.setattr(
            storage_service,
            method,
            Mock(side_effect=AssertionError("GCS operations disabled in this suite")),
        )

    # This is ASGI client metadata, not a network connection or forwarded header.
    # A unique documentation-only IP isolates real Redis rate limits between runs.
    ip_suffix = uuid4().hex[:12]
    client_ip = (
        "2001:db8:"
        + ":".join(ip_suffix[index : index + 4] for index in range(0, 12, 4))
        + "::1"
    )
    transport = httpx.ASGITransport(app=app, client=(client_ip, 12345))
    try:
        async with app.router.lifespan_context(app):
            _check(
                await redis_service.redis_client.ping(),
                "Actual audit Redis is unavailable",
            )
            with database.engine.connect() as connection:
                _check(
                    connection.execute(text("SELECT current_database()")).scalar_one()
                    == "cineentry_audit",
                    "Connected PostgreSQL is not the audit database",
                )
                migrations = ScriptDirectory(
                    str(Path(__file__).resolve().parents[1] / "alembic")
                )
                current_heads = MigrationContext.configure(
                    connection
                ).get_current_heads()
                _check(
                    bool(current_heads)
                    and set(current_heads) == set(migrations.get_heads()),
                    "Audit schema is not at the repository Alembic head; migrate before testing",
                )
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://cineentry.integration.invalid",
                follow_redirects=False,
            ) as client:
                harness = _Audit(client, database, redis_service, delete_file)
                for purpose in ("register", "login"):
                    harness.redis_keys.add(f"auth:rate-limit:{purpose}:ip:{client_ip}")
                monkeypatch.setattr(email_service, "send_email", harness.capture_email)
                try:
                    health = await harness.request("GET", "/health")
                    _check(
                        health.json().get("status") == "healthy",
                        "ASGI app health failed",
                    )
                    yield harness
                finally:
                    await harness.cleanup()
                    _check(
                        all(mock.await_count == 0 for mock in provider_mocks),
                        "Manual metadata unexpectedly invoked an external provider",
                    )
    finally:
        # Also close after startup failures before lifespan reaches its yield.
        try:
            await redis_service.disconnect()
        finally:
            redis_service.redis_client = None


async def test_real_auth_verification_refresh_replay_and_logout(audit):
    account = await audit.register(verified=False)
    await audit.request(
        "POST",
        "/api/v1/auth/login",
        expected=403,
        json={"email": account.email, "password": _TEST_PASSWORD},
    )
    await audit.request(
        "POST",
        "/api/v1/auth/register",
        expected=409,
        json={
            "email": account.email,
            "password": "Amber!9Cobalt",
            "display_name": "덮어쓰면 안 됨",
        },
    )
    key = f"auth:rate-limit:register:email:{account.email}"
    _check(
        await audit.redis.get(key) == "2",
        "Registration rate limit was not recorded in Redis",
    )
    await audit.verify_email(account)
    repeated = await audit.request(
        "GET",
        "/api/v1/auth/email/verify",
        params={"token": audit.verification_tokens[account.email][0]},
    )
    _check(
        "status-icon failure" in repeated.text,
        "Verification email token replay was accepted",
    )
    await audit.login(account)
    current = await audit.data("GET", "/api/v1/auth/me", account)
    _check(
        current["display_name"] == "통합 검증",
        "Duplicate registration changed the account",
    )
    await audit.request(
        "POST",
        "/api/v1/auth/login",
        expected=401,
        json={"email": account.email, "password": "Amber!9Cobalt"},
    )

    old_session = _Account(
        account.id, account.email, account.access_token, account.refresh_token
    )
    rotated = await audit.data(
        "POST",
        "/api/v1/auth/refresh",
        json={"refresh_token": old_session.refresh_token},
    )
    account.replace_tokens(rotated)
    _check(
        account.access_token != old_session.access_token
        and account.refresh_token != old_session.refresh_token,
        "Refresh did not rotate the actual JWT token pair",
    )
    await audit.request("GET", "/api/v1/auth/me", old_session, expected=401)
    await audit.request(
        "POST",
        "/api/v1/auth/refresh",
        expected=401,
        json={"refresh_token": old_session.refresh_token},
    )
    await audit.data("GET", "/api/v1/auth/me", account)
    logged_out = await audit.data("POST", "/api/v1/auth/logout", account)
    _check(
        logged_out["logged_out"] is True,
        "Logout did not acknowledge session revocation",
    )
    await audit.request("GET", "/api/v1/auth/me", account, expected=401)
    await audit.request(
        "POST",
        "/api/v1/auth/refresh",
        expected=401,
        json={"refresh_token": account.refresh_token},
    )
    await audit.login(account)
    await audit.data("GET", "/api/v1/users/me", account)


async def test_real_long_review_survives_session_restart_and_rejected_overflow(audit):
    from app.models.user_movie import UserMovie
    from app.schemas.movie import REVIEW_MAX_LENGTH

    account = await audit.register()
    movie_id = await audit.manual_movie(account)
    record = await audit.add_movie(account, movie_id)
    path = f"/api/v1/movies/{record['id']}"
    review = ("긴 감상 기록\n" * REVIEW_MAX_LENGTH)[:REVIEW_MAX_LENGTH]
    saved = await audit.data(
        "PUT",
        path,
        account,
        json={"one_line_review": review, "watch_date": "2026-10-07", "rating": 4.5},
    )
    _check(saved["review"] == review, "Long Unicode review was truncated")
    await audit.request(
        "PUT",
        path,
        account,
        expected=422,
        json={"one_line_review": review + "끝"},
    )
    await audit.request("POST", "/api/v1/auth/logout", account)
    await audit.request("GET", path, account, expected=401)
    await audit.login(account)
    restored = await audit.data("GET", path, account)
    _check(
        restored["review"] == review
        and restored["watch_date"] == "2026-10-07"
        and restored["rating"] == 4.5,
        "Reauthentication changed the persisted review/date/rating",
    )
    with audit.database.SessionLocal() as db:
        row = db.get(UserMovie, record["id"])
        _check(
            row is not None and row.one_line_review == review,
            "Fresh DB session did not recover the complete review",
        )


async def test_real_personal_movies_collections_tags_and_stats(audit):
    account = await audit.register()
    await audit.data("PUT", "/api/v1/users/me", account, json={"yearly_goal": 4})
    movie_id = await audit.manual_movie(account, runtime=120, genre="드라마")
    movie = await audit.add_movie(account, movie_id, status="wishlist")
    user_movie_id = movie["id"]
    _check(movie["status"] == "watchlist", "Legacy wishlist was not normalized")
    await audit.request(
        "POST",
        "/api/v1/movies/",
        account,
        expected=400,
        json={"movie_id": movie_id, "status": "completed"},
    )
    collections = await audit.data("GET", "/api/v1/collections/", account)
    watchlist_auto = [
        c
        for c in collections
        if c["is_auto"] and c["auto_rules"] == {"status": "watchlist"}
    ]
    _check(
        len(watchlist_auto) == 1 and watchlist_auto[0]["movie_count"] == 1,
        "Automatic watchlist membership was not synced after creation",
    )
    watching = await audit.data(
        "PUT",
        f"/api/v1/movies/{user_movie_id}",
        account,
        json={
            "status": "watching",
            "rating": 0,
            "progress": 45,
            "one_line_review": "실제 저장 검증",
        },
    )
    _check(
        watching["status"] == "watching"
        and watching["rating"] == 0
        and watching["progress"] == 45
        and watching["review"] == "실제 저장 검증",
        "Personal watching/rating/progress/review updates were not persisted",
    )
    await audit.request(
        "PUT",
        f"/api/v1/movies/{user_movie_id}",
        account,
        expected=422,
        json={"rating": 5.5},
    )
    await audit.request(
        "PUT",
        f"/api/v1/movies/{user_movie_id}",
        account,
        expected=422,
        json={"watch_date": "2026-02-30"},
    )
    completed = await audit.data(
        "PUT",
        f"/api/v1/movies/{user_movie_id}",
        account,
        json={"status": "completed", "watch_date": "2026-04-09", "is_best_movie": True},
    )
    _check(
        completed["watch_date"] == "2026-04-09" and completed["rating"] == 0,
        "Completed status/date update lost the zero rating",
    )
    series_id = await audit.manual_movie(
        account,
        content_type="series",
        release_channel="ott_original",
        runtime=30,
        total_episodes=4,
        genre="드라마",
    )
    series = await audit.add_movie(
        account,
        series_id,
        status="completed",
        rating=5,
        watch_date="2026-04-10",
    )
    pending_id = await audit.manual_movie(account, runtime=90, genre="코미디")
    pending = await audit.add_movie(
        account,
        pending_id,
        status="watching",
        rating=4.5,
        progress=25,
    )
    filtered = await audit.data(
        "GET",
        "/api/v1/movies/",
        account,
        params={"status": "completed", "content_type": "series"},
    )
    _check(
        [m["id"] for m in filtered] == [series["id"]],
        "Library status/type filtering is inconsistent",
    )
    filtered = await audit.data(
        "GET",
        "/api/v1/movies/",
        account,
        params={"release_channel": "ott_original"},
    )
    _check(
        [m["id"] for m in filtered] == [series["id"]],
        "Release channel filtering is inconsistent",
    )

    collection_id = await audit.collection(account)
    collection_path = f"/api/v1/collections/{collection_id}"
    await audit.data("PUT", collection_path, account, json={"name": "수정된 컬렉션"})
    membership = f"{collection_path}/movies/{user_movie_id}"
    await audit.data("POST", membership, account, expected=201)
    await audit.request("POST", membership, account, expected=400)
    detail = await audit.data("GET", collection_path, account)
    _check(
        detail["name"] == "수정된 컬렉션"
        and detail["movie_count"] == 1
        and [m["id"] for m in detail["movies"]] == [user_movie_id],
        "Collection update/attachment did not persist exactly once",
    )
    collection_list = await audit.data("GET", "/api/v1/collections/", account)
    _check(
        next(c for c in collection_list if c["id"] == collection_id)["movie_count"]
        == 1,
        "Collection list and detail counts disagree",
    )
    _check(
        next(c for c in collection_list if c["id"] == watchlist_auto[0]["id"])[
            "movie_count"
        ]
        == 0,
        "Automatic watchlist membership was not removed after status transition",
    )
    await audit.data("DELETE", membership, account)
    detail = await audit.data("GET", collection_path, account)
    _check(
        detail["movie_count"] == 0 and detail["movies"] == [],
        "Collection detach did not persist",
    )
    await audit.data("DELETE", collection_path, account)
    await audit.request("GET", collection_path, account, expected=404)

    tag_id = await audit.tag(account)
    tag_path = f"/api/v1/tags/movies/{user_movie_id}/tags"
    await audit.data("POST", tag_path, account, params={"tag_id": tag_id})
    await audit.data("POST", tag_path, account, params={"tag_id": tag_id})
    popular = await audit.data("GET", "/api/v1/tags/popular", account)
    _check(
        len(popular) == 1 and popular[0]["count"] == 1,
        "Tag attachment was not idempotent",
    )
    detail = await audit.data("GET", f"/api/v1/movies/{user_movie_id}", account)
    _check(
        [tag["id"] for tag in detail["tags"]] == [tag_id],
        "Movie detail lost its attached tag",
    )
    tag_stats = await audit.data("GET", "/api/v1/stats/tags", account)
    _check(
        tag_stats == [{"tag": "통합 검증 태그", "count": 1}],
        "Tag statistics differ from real attachments",
    )

    stats = await audit.data("GET", "/api/v1/stats/", account, params={"year": 2026})
    expected = {
        "total_watched": 2,
        "completed_movie_count": 1,
        "completed_series_count": 1,
        "total_watch_time": 240,
        "average_rating": 2.5,
        "yearly_goal": 4,
        "yearly_progress": 2,
        "yearly_goal_percentage": 50.0,
    }
    _check(
        all(stats[k] == v for k, v in expected.items()),
        "Overview stats disagree with saved records",
    )
    monthly = await audit.data("GET", "/api/v1/stats/monthly", account)
    _check(
        monthly == [{"month": "2026-04", "count": 2}],
        "Monthly stats counted unfinished records",
    )
    genres = await audit.data("GET", "/api/v1/stats/genres", account)
    _check(
        genres == [{"genre": "드라마", "count": 2, "percentage": 100.0}],
        "Genre stats are inconsistent",
    )
    calendar = await audit.data(
        "GET",
        "/api/v1/stats/calendar",
        account,
        params={"year": 2026, "month": 4},
    )
    _check(
        [(day["date"], day["movie_count"]) for day in calendar["days"]]
        == [("2026-04-09", 1), ("2026-04-10", 1)]
        and {m["id"] for day in calendar["days"] for m in day["movies"]}
        == {movie_id, series_id},
        "Calendar dates/counts/catalog IDs disagree with personal records",
    )
    streak = await audit.data("GET", "/api/v1/stats/streak", account)
    _check(
        streak["longest_streak"] == 2,
        "Consecutive persisted watch dates did not form a streak",
    )
    best = await audit.data("GET", "/api/v1/stats/best-movies", account)
    _check(
        len(best) == 1 and best[0]["id"] == user_movie_id and best[0]["rating"] == 0,
        "Best movies did not retain the personal zero rating",
    )

    await audit.data("DELETE", f"{tag_path}/{tag_id}", account)
    _check(
        await audit.data("GET", "/api/v1/stats/tags", account) == [],
        "Removed tag remains in statistics",
    )
    await audit.data("DELETE", f"/api/v1/tags/{tag_id}", account)
    await audit.data("DELETE", f"/api/v1/movies/{pending['id']}", account)
    await audit.request("GET", f"/api/v1/movies/{pending['id']}", account, expected=404)
    await audit.data("DELETE", f"/api/v1/movies/{series['id']}", account)
    stats = await audit.data("GET", "/api/v1/stats/", account, params={"year": 2026})
    _check(
        stats["total_watched"] == 1
        and stats["completed_series_count"] == 0
        and stats["total_watch_time"] == 120
        and stats["average_rating"] == 0
        and stats["yearly_progress"] == 1,
        "Deleting a completed series did not recompute aggregate statistics",
    )
    await audit.data(
        "PUT",
        f"/api/v1/movies/{user_movie_id}",
        account,
        json={"watch_date": "2025-12-31", "rating": None, "one_line_review": None},
    )
    detail = await audit.data("GET", f"/api/v1/movies/{user_movie_id}", account)
    _check(
        detail["rating"] is None and detail["review"] is None,
        "Explicit null personal updates were not persisted",
    )
    stats = await audit.data("GET", "/api/v1/stats/", account, params={"year": 2026})
    _check(
        stats["total_watched"] == 1 and stats["yearly_progress"] == 0,
        "Changing a watch date did not move yearly statistics",
    )


async def test_real_two_user_movie_collection_and_tag_id_isolation(audit):
    owner = await audit.register()
    other = await audit.register()
    movie_id = await audit.manual_movie(owner, runtime=100, genre="드라마")
    owner_movie = await audit.add_movie(
        owner,
        movie_id,
        status="completed",
        rating=4,
        watch_date="2026-04-09",
    )
    other_movie = await audit.add_movie(other, movie_id, rating=1)
    _check(
        owner_movie["id"] != other_movie["id"],
        "Shared catalog record reused a personal movie ID",
    )
    owner_collection = await audit.collection(owner)
    other_collection = await audit.collection(other)
    owner_tag = await audit.tag(owner)
    other_tag = await audit.tag(other)
    _check(owner_tag != other_tag, "Same-name private tags were shared across accounts")
    for account, movie, collection_id, tag_id in (
        (owner, owner_movie, owner_collection, owner_tag),
        (other, other_movie, other_collection, other_tag),
    ):
        await audit.data(
            "POST",
            f"/api/v1/collections/{collection_id}/movies/{movie['id']}",
            account,
            expected=201,
        )
        await audit.data(
            "POST",
            f"/api/v1/tags/movies/{movie['id']}/tags",
            account,
            params={"tag_id": tag_id},
        )

    for (
        attacker,
        victim_movie,
        victim_collection,
        victim_tag,
        own_movie,
        own_collection,
        own_tag,
    ) in (
        (
            other,
            owner_movie,
            owner_collection,
            owner_tag,
            other_movie,
            other_collection,
            other_tag,
        ),
        (
            owner,
            other_movie,
            other_collection,
            other_tag,
            owner_movie,
            owner_collection,
            owner_tag,
        ),
    ):
        movie_path = f"/api/v1/movies/{victim_movie['id']}"
        await audit.request("GET", movie_path, attacker, expected=404)
        await audit.request(
            "PUT", movie_path, attacker, expected=404, json={"rating": 2}
        )
        await audit.request("DELETE", movie_path, attacker, expected=404)
        collection_path = f"/api/v1/collections/{victim_collection}"
        await audit.request("GET", collection_path, attacker, expected=404)
        await audit.request(
            "PUT", collection_path, attacker, expected=404, json={"name": "변조"}
        )
        await audit.request("DELETE", collection_path, attacker, expected=404)
        for collection_id, user_movie_id in (
            (victim_collection, own_movie["id"]),
            (own_collection, victim_movie["id"]),
            (victim_collection, victim_movie["id"]),
        ):
            path = f"/api/v1/collections/{collection_id}/movies/{user_movie_id}"
            await audit.request("POST", path, attacker, expected=404)
            await audit.request("DELETE", path, attacker, expected=404)
        await audit.request(
            "DELETE", f"/api/v1/tags/{victim_tag}", attacker, expected=404
        )
        await audit.request(
            "POST",
            f"/api/v1/tags/movies/{victim_movie['id']}/tags",
            attacker,
            expected=404,
            params={"tag_id": own_tag},
        )
        await audit.request(
            "POST",
            f"/api/v1/tags/movies/{own_movie['id']}/tags",
            attacker,
            expected=404,
            params={"tag_id": victim_tag},
        )
        await audit.request(
            "DELETE",
            f"/api/v1/tags/movies/{victim_movie['id']}/tags/{victim_tag}",
            attacker,
            expected=404,
        )
        movies = await audit.data("GET", "/api/v1/movies/", attacker)
        _check(
            [m["id"] for m in movies] == [own_movie["id"]],
            "Library list leaked another user's record",
        )
        tags = await audit.data(
            "GET", "/api/v1/tags", attacker, params={"tag_type": "custom"}
        )
        _check(
            [t["id"] for t in tags] == [own_tag],
            "Custom tag list leaked another user's tag",
        )
        collections = await audit.data("GET", "/api/v1/collections/", attacker)
        _check(
            all(c["user_id"] == str(attacker.id) for c in collections)
            and victim_collection not in {c["id"] for c in collections},
            "Collection list leaked another user's collection",
        )

    # A manual catalog record becomes shared when the second account saves it;
    # the catalog boundary must reject an attempted global metadata overwrite.
    await audit.request(
        "PUT",
        f"/api/v1/movies/{other_movie['id']}",
        other,
        expected=409,
        json={"runtime": 999, "rating": 3},
    )
    for account, movie, collection_id, tag_id in (
        (owner, owner_movie, owner_collection, owner_tag),
        (other, other_movie, other_collection, other_tag),
    ):
        detail = await audit.data("GET", f"/api/v1/movies/{movie['id']}", account)
        _check(
            detail["runtime"] == 100
            and detail["rating"] == movie["rating"]
            and [tag["id"] for tag in detail["tags"]] == [tag_id],
            "Rejected cross-user/global writes changed an owner's persisted movie",
        )
        collection = await audit.data(
            "GET", f"/api/v1/collections/{collection_id}", account
        )
        _check(
            collection["movie_count"] == 1
            and [m["id"] for m in collection["movies"]] == [movie["id"]],
            "Rejected cross-user writes changed collection membership",
        )
    owner_stats = await audit.data(
        "GET", "/api/v1/stats/", owner, params={"year": 2026}
    )
    other_stats = await audit.data(
        "GET", "/api/v1/stats/", other, params={"year": 2026}
    )
    _check(
        owner_stats["total_watched"] == 1 and other_stats["total_watched"] == 0,
        "Statistics crossed the account boundary",
    )
    await audit.data(
        "DELETE",
        "/api/v1/users/me",
        other,
        json={"confirmation_text": "회원탈퇴"},
    )
    await audit.request("GET", "/api/v1/users/me", other, expected=401)
    await audit.data("GET", f"/api/v1/movies/{owner_movie['id']}", owner)
    await audit.data("GET", f"/api/v1/collections/{owner_collection}", owner)
    surviving_stats = await audit.data(
        "GET", "/api/v1/stats/", owner, params={"year": 2026}
    )
    _check(
        surviving_stats == owner_stats,
        "Deleting one account damaged another account's statistics",
    )


async def test_real_profile_updates_and_account_deletion_cascades(audit):
    from app.models.collection import Collection
    from app.models.collection_movie import CollectionMovie
    from app.models.movie import Movie
    from app.models.movie_tag import MovieTag
    from app.models.tag import Tag
    from app.models.user import User
    from app.models.user_movie import UserMovie

    account = await audit.register()
    first_avatar = f"https://example.invalid/{audit.run_id}/avatar-one.png"
    second_avatar = f"https://example.invalid/{audit.run_id}/avatar-two.png"
    profile = await audit.data(
        "PUT",
        "/api/v1/users/me",
        account,
        json={
            "display_name": "  수정된 이름  ",
            "yearly_goal": 12,
            "streak_type": "custom",
            "streak_min_days": 2,
            "avatar_url": first_avatar,
        },
    )
    _check(
        profile["display_name"] == "수정된 이름"
        and profile["yearly_goal"] == 12
        and profile["avatar_url"] == first_avatar,
        "Profile updates were not normalized and persisted",
    )
    await audit.data(
        "PUT", "/api/v1/users/me", account, json={"avatar_url": second_avatar}
    )
    _check(
        not audit.delete_file.called,
        "Replacing an external avatar must not invoke owned-storage deletion",
    )
    for invalid in (
        {"yearly_goal": 0},
        {"display_name": "   "},
        {"streak_type": "invalid"},
    ):
        await audit.request(
            "PUT", "/api/v1/users/me", account, expected=422, json=invalid
        )
    profile = await audit.data("GET", "/api/v1/users/me", account)
    _check(
        profile["display_name"] == "수정된 이름"
        and profile["yearly_goal"] == 12
        and profile["avatar_url"] == second_avatar,
        "Invalid profile writes changed previously saved fields",
    )
    streak = await audit.data("GET", "/api/v1/stats/streak", account)
    _check(
        streak["streak_type"] == "custom" and streak["streak_min_days"] == 2,
        "Profile streak settings were not used by the stats endpoint",
    )
    with audit.database.SessionLocal() as db:
        user = db.get(User, account.id)
        _check(
            user.yearly_goal == 12
            and user.display_name == "수정된 이름"
            and user.avatar_url == second_avatar,
            "Profile response did not reflect real DB state",
        )

    movie_id = await audit.manual_movie(account, runtime=100)
    movie = await audit.add_movie(
        account, movie_id, status="completed", watch_date="2026-04-09"
    )
    collection_id = await audit.collection(account)
    tag_id = await audit.tag(account)
    await audit.data(
        "POST",
        f"/api/v1/collections/{collection_id}/movies/{movie['id']}",
        account,
        expected=201,
    )
    await audit.data(
        "POST",
        f"/api/v1/tags/movies/{movie['id']}/tags",
        account,
        params={"tag_id": tag_id},
    )
    with audit.database.SessionLocal() as db:
        collection_ids = [
            row.id
            for row in db.query(Collection.id).filter(Collection.user_id == account.id)
        ]
        _check(
            db.query(UserMovie).filter(UserMovie.user_id == account.id).count() == 1
            and db.query(MovieTag).filter(MovieTag.user_movie_id == movie["id"]).count()
            == 1
            and db.query(CollectionMovie)
            .filter(CollectionMovie.collection_id == collection_id)
            .count()
            == 1,
            "Account deletion preconditions were not actually persisted",
        )
    await audit.request(
        "DELETE",
        "/api/v1/users/me",
        account,
        expected=422,
        json={"confirmation_text": "delete"},
    )
    await audit.data("GET", "/api/v1/users/me", account)
    deleted = await audit.data(
        "DELETE",
        "/api/v1/users/me",
        account,
        json={"confirmation_text": "회원탈퇴"},
    )
    _check(
        deleted["deleted_user_id"] == str(account.id),
        "Deletion acknowledged another account",
    )
    with audit.database.SessionLocal() as db:
        _check(
            db.get(User, account.id) is None
            and db.query(UserMovie).filter(UserMovie.user_id == account.id).count() == 0
            and db.query(Collection).filter(Collection.user_id == account.id).count()
            == 0
            and db.query(Tag).filter(Tag.user_id == account.id).count() == 0
            and db.query(MovieTag).filter(MovieTag.user_movie_id == movie["id"]).count()
            == 0
            and db.query(CollectionMovie)
            .filter(CollectionMovie.collection_id.in_(collection_ids))
            .count()
            == 0,
            "Account deletion did not cascade through its actual persisted records",
        )
        _check(
            db.get(Movie, movie_id) is not None,
            "Account deletion incorrectly deleted shared catalog metadata",
        )
    _check(
        not audit.delete_file.called,
        "Account deletion must not try to delete external avatar objects",
    )
    await audit.request("GET", "/api/v1/auth/me", account, expected=401)
    await audit.request(
        "POST",
        "/api/v1/auth/refresh",
        expected=401,
        json={"refresh_token": account.refresh_token},
    )
    await audit.request(
        "POST",
        "/api/v1/auth/login",
        expected=401,
        json={"email": account.email, "password": _TEST_PASSWORD},
    )


async def test_real_concurrent_refresh_has_one_winner(audit):
    from fastapi import HTTPException

    from app.api.v1.auth import refresh_token
    from app.models.user import User
    from app.schemas.auth import RefreshRequest

    account = await audit.register()
    with audit.database.SessionLocal() as db:
        original_version = db.get(User, account.id).token_version

    barrier = threading.Barrier(2)

    def synchronize_updates(connection, cursor, statement, parameters, context, many):
        if statement.lstrip().upper().startswith("UPDATE USERS SET TOKEN_VERSION"):
            barrier.wait(timeout=10)

    def redeem():
        with audit.database.SessionLocal() as db:
            try:
                response = asyncio.run(
                    refresh_token(
                        RefreshRequest(refresh_token=account.refresh_token), db
                    )
                )
                return 200, response.data.model_dump()
            except HTTPException as error:
                return error.status_code, None

    event.listen(audit.database.engine, "before_cursor_execute", synchronize_updates)
    try:
        outcomes = await asyncio.gather(
            asyncio.to_thread(redeem), asyncio.to_thread(redeem)
        )
    finally:
        event.remove(
            audit.database.engine, "before_cursor_execute", synchronize_updates
        )

    _check(
        sorted(code for code, _ in outcomes) == [200, 401],
        "Concurrent redemption of one refresh credential must have exactly one winner",
    )
    with audit.database.SessionLocal() as db:
        _check(
            db.get(User, account.id).token_version == original_version + 1,
            "Concurrent refresh must advance the stored version exactly once",
        )
    account.replace_tokens(next(tokens for code, tokens in outcomes if code == 200))
    await audit.request("GET", "/api/v1/auth/me", account)
