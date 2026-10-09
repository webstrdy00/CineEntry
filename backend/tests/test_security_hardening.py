import asyncio
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import jwt
import pytest
from fastapi import BackgroundTasks, HTTPException, status
from pydantic import ValidationError

from app.api.v1 import auth as auth_api
from app.api.v1.auth import _get_client_ip
from app.api.v1.media import _validate_image_signature, _validate_image_size
from app.api.v1.movies import parse_external_numeric_id
from app.config import get_jwt_secret_key, settings
from app.models.user import User
from app.schemas.auth import (
    AuthUserResponse,
    ChangePasswordRequest,
    LoginRequest,
    PasswordResetConfirmRequest,
    RefreshRequest,
    RegisterRequest,
)
from app.schemas.collection import CollectionCreate
from app.schemas.movie import UserMovieCreate
from app.schemas.tag import TagCreate
from app.schemas.user import UserDeleteRequest
from app.services.auth_flow_service import AuthFlowService
from app.services.auto_collection_service import auto_collection_service
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    verify_access_token,
    verify_refresh_token,
)
from app.services.redis_service import redis_service


@pytest.fixture
def auth_response_mocks(monkeypatch):
    def serialize_user(user):
        return AuthUserResponse(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
            auth_provider=user.auth_provider,
            auth_methods=user.auth_methods,
            email_verified=user.email_verified,
            has_password=user.has_password,
        )

    tokens = Mock(
        return_value={
            "access_token": "test-access-token",
            "refresh_token": "test-refresh-token",
            "expires_in": 3600,
        }
    )
    monkeypatch.setattr(auth_api, "create_tokens", tokens)
    monkeypatch.setattr(auth_api, "_build_auth_user_response", serialize_user)
    return tokens


@pytest.mark.parametrize("provider", ["email", "google", "kakao"])
@pytest.mark.parametrize("password_hash", [None, "existing-password-hash"])
@pytest.mark.parametrize("email_verified", [False, True])
def test_registration_rejects_every_existing_account_without_modification(
    monkeypatch, auth_response_mocks, provider, password_hash, email_verified
) -> None:
    user = User(
        id=uuid4(),
        email="existing@example.com",
        display_name="",
        password_hash=password_hash,
        auth_provider=provider,
        google_connected=provider == "google",
        kakao_connected=provider == "kakao",
        email_verified=email_verified,
        token_version=4,
    )
    db = Mock()
    db.query.return_value.filter.return_value.first.return_value = user
    password_hasher = Mock(return_value="new-password-hash")
    verification_email = AsyncMock()
    monkeypatch.setattr(auth_api, "_ensure_not_rate_limited", AsyncMock())
    monkeypatch.setattr(auth_api, "_record_rate_limited_attempt", AsyncMock())
    monkeypatch.setattr(auth_api, "hash_password", password_hasher)
    monkeypatch.setattr(auth_api, "_queue_verification_email", verification_email)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            auth_api.register(
                RegisterRequest(
                    email=user.email,
                    password="Violet!7Quartz",
                    display_name="새 사용자",
                ),
                BackgroundTasks(),
                SimpleNamespace(
                    headers={}, client=SimpleNamespace(host="198.51.100.7")
                ),
                db,
            )
        )

    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    assert user.password_hash == password_hash
    assert user.auth_provider == provider
    assert user.display_name == ""
    assert user.google_connected is (provider == "google")
    assert user.kakao_connected is (provider == "kakao")
    assert user.email_verified is email_verified
    assert user.token_version == 4
    db.add.assert_not_called()
    db.commit.assert_not_called()
    db.refresh.assert_not_called()
    password_hasher.assert_not_called()
    verification_email.assert_not_awaited()
    auth_response_mocks.assert_not_called()


def test_new_unverified_registration_keeps_current_device_access(
    monkeypatch, auth_response_mocks
) -> None:
    user_id = uuid4()
    db = Mock()
    db.query.return_value.filter.return_value.first.return_value = None
    db.refresh.side_effect = lambda user: setattr(user, "id", user_id)
    verification_email = AsyncMock()
    default_collections = Mock()
    monkeypatch.setattr(auth_api, "_ensure_not_rate_limited", AsyncMock())
    monkeypatch.setattr(auth_api, "_record_rate_limited_attempt", AsyncMock())
    monkeypatch.setattr(
        auth_api, "hash_password", Mock(return_value="new-password-hash")
    )
    monkeypatch.setattr(auth_api, "_queue_verification_email", verification_email)
    monkeypatch.setattr(
        auto_collection_service, "create_default_collections", default_collections
    )
    background_tasks = BackgroundTasks()
    request = RegisterRequest(
        email="new@example.com", password="Violet!7Quartz", display_name="새 사용자"
    )
    http_request = SimpleNamespace(
        headers={}, client=SimpleNamespace(host="198.51.100.7")
    )

    response = asyncio.run(
        auth_api.register(request, background_tasks, http_request, db)
    )

    user = db.add.call_args.args[0]
    assert response.success is True
    assert response.data.user.id == str(user_id)
    assert response.data.user.email_verified is False
    assert response.data.user.has_password is True
    assert response.data.tokens.access_token == "test-access-token"
    assert response.data.tokens.refresh_token == "test-refresh-token"
    auth_response_mocks.assert_called_once_with(user_id, 0)
    verification_email.assert_awaited_once_with(background_tasks, user)
    default_collections.assert_called_once_with(str(user_id), db)
    db.commit.assert_called_once_with()
    db.query.return_value.filter.return_value.first.return_value = user
    monkeypatch.setattr(auth_api, "verify_password", Mock(return_value=True))
    clear_attempts = AsyncMock()
    monkeypatch.setattr(auth_api, "_clear_rate_limited_attempts", clear_attempts)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            auth_api.login(
                LoginRequest(email=request.email, password=request.password),
                http_request,
                db,
            )
        )

    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
    clear_attempts.assert_not_awaited()
    auth_response_mocks.assert_called_once_with(user_id, 0)


def test_successful_login_preserves_ip_failures_and_cannot_bypass_shared_limit(
    monkeypatch, auth_response_mocks
) -> None:
    ip = "198.51.100.7"
    owned_user = User(
        id=uuid4(),
        email="owned@example.com",
        password_hash="owned-password-hash",
        auth_provider="email",
        email_verified=True,
        token_version=0,
    )
    victim_user = User(
        id=uuid4(),
        email="victim@example.com",
        password_hash="victim-password-hash",
        auth_provider="email",
        email_verified=True,
        token_version=0,
    )
    counts = {
        ("login:email", owned_user.email): 1,
        ("login:email", victim_user.email): 1,
        ("login:ip", ip): 2,
    }

    async def record_attempt(purpose, identity, ttl_seconds):
        key = (purpose, identity)
        counts[key] = counts.get(key, 0) + 1
        return counts[key]

    async def clear_attempts(purpose, identity):
        counts.pop((purpose, identity), None)

    monkeypatch.setattr(settings, "AUTH_LOGIN_ATTEMPT_LIMIT", 3)
    monkeypatch.setattr(
        auth_api.auth_flow_service,
        "get_rate_limit_count",
        AsyncMock(
            side_effect=lambda purpose, identity: counts.get((purpose, identity), 0)
        ),
    )
    monkeypatch.setattr(
        auth_api.auth_flow_service,
        "get_rate_limit_retry_after",
        AsyncMock(return_value=600),
    )
    monkeypatch.setattr(
        auth_api.auth_flow_service, "record_rate_limit_attempt", record_attempt
    )
    monkeypatch.setattr(auth_api.auth_flow_service, "clear_rate_limit", clear_attempts)
    monkeypatch.setattr(auth_api, "verify_password", Mock(side_effect=[True, False]))
    db = Mock()
    db.query.return_value.filter.return_value.first.side_effect = [
        owned_user,
        victim_user,
    ]
    http_request = SimpleNamespace(headers={}, client=SimpleNamespace(host=ip))
    owned_login = LoginRequest(email=owned_user.email, password="Violet!7Quartz")

    response = asyncio.run(auth_api.login(owned_login, http_request, db))

    assert response.success is True
    assert ("login:email", owned_user.email) not in counts
    assert counts[("login:email", victim_user.email)] == 1
    assert counts[("login:ip", ip)] == 2

    with pytest.raises(HTTPException) as bad_password:
        asyncio.run(
            auth_api.login(
                LoginRequest(email=victim_user.email, password="wrong-password"),
                http_request,
                db,
            )
        )

    assert bad_password.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert counts[("login:ip", ip)] == 3
    with pytest.raises(HTTPException) as rate_limited:
        asyncio.run(auth_api.login(owned_login, http_request, db))

    assert rate_limited.value.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert rate_limited.value.headers == {"Retry-After": "600"}
    assert db.query.call_count == 2
    auth_response_mocks.assert_called_once_with(owned_user.id, 0)


class _TokenRedis:
    def __init__(self, values):
        self.values = values
        self.consumed_keys = []

    async def get(self, key):
        value = self.values.get(key)
        await asyncio.sleep(0)
        return value

    async def delete(self, key):
        return self.values.pop(key, None)

    async def getdel(self, key):
        self.consumed_keys.append(key)
        value = self.values.pop(key, None)
        await asyncio.sleep(0)
        return value


@pytest.mark.parametrize("purpose", ["password_reset", "email_verification"])
@pytest.mark.parametrize("already_connected", [False, True])
def test_auth_flow_token_has_only_one_concurrent_consumer(
    monkeypatch, purpose, already_connected
) -> None:
    service = AuthFlowService()
    prefix = (
        service.PASSWORD_RESET_PREFIX
        if purpose == "password_reset"
        else service.VERIFY_EMAIL_PREFIX
    )
    key = f"{prefix}:single-use-token"
    payload = {"user_id": str(uuid4()), "email": "한글@example.com"}
    client = _TokenRedis({key: json.dumps(payload, ensure_ascii=False)})

    async def connect():
        monkeypatch.setattr(redis_service, "redis_client", client)

    connection = AsyncMock(side_effect=connect)
    monkeypatch.setattr(
        redis_service, "redis_client", client if already_connected else None
    )
    monkeypatch.setattr(redis_service, "connect", connection)
    consume = getattr(service, f"consume_{purpose}_token")

    async def consume_twice():
        return await asyncio.gather(
            consume("single-use-token"), consume("single-use-token")
        )

    results = asyncio.run(consume_twice())

    assert sum(result == payload for result in results) == 1
    assert sum(result is None for result in results) == 1
    assert key not in client.values
    assert client.consumed_keys == [key, key]
    if already_connected:
        connection.assert_not_awaited()
    else:
        connection.assert_awaited_once_with()


@pytest.mark.parametrize("stored_value", [None, "", "not-json"])
def test_auth_flow_token_missing_or_malformed_payload_returns_none(
    monkeypatch, stored_value
) -> None:
    service = AuthFlowService()
    key = f"{service.PASSWORD_RESET_PREFIX}:invalid-token"
    client = _TokenRedis({key: stored_value})
    monkeypatch.setattr(redis_service, "redis_client", client)

    assert asyncio.run(service.consume_password_reset_token("invalid-token")) is None
    assert key not in client.values


def test_empty_auth_flow_token_does_not_connect_to_redis(monkeypatch) -> None:
    connection = AsyncMock()
    monkeypatch.setattr(redis_service, "redis_client", None)
    monkeypatch.setattr(redis_service, "connect", connection)

    assert asyncio.run(AuthFlowService().consume_password_reset_token("")) is None
    connection.assert_not_awaited()


@pytest.fixture
def auth_mutation_context(monkeypatch):
    user = User(
        id=uuid4(),
        email="recovery@example.com",
        display_name="사용자",
        password_hash="original-password-hash",
        auth_provider="email",
        email_verified=True,
        token_version=3,
    )
    db = Mock()
    query = db.query.return_value
    query.filter.return_value = query
    query.populate_existing.return_value = query
    query.first.return_value = user
    query.update.return_value = 1
    payload = {"user_id": str(user.id), "email": user.email, "token_version": 3}
    peek = AsyncMock(return_value=payload.copy())
    consume = AsyncMock(return_value=payload.copy())
    hasher = Mock(return_value="changed-password-hash")
    monkeypatch.setattr(auth_api.auth_flow_service, "peek_password_reset_token", peek)
    monkeypatch.setattr(
        auth_api.auth_flow_service, "consume_password_reset_token", consume
    )
    monkeypatch.setattr(auth_api, "verify_password", Mock(return_value=False))
    monkeypatch.setattr(auth_api, "hash_password", hasher)
    return SimpleNamespace(
        user=user,
        db=db,
        query=query,
        payload=payload,
        peek=peek,
        consume=consume,
        hasher=hasher,
    )


def test_refresh_two_stale_reads_have_only_one_cas_winner(
    monkeypatch, auth_mutation_context, auth_response_mocks
) -> None:
    context = auth_mutation_context
    token_data = {"user_id": str(context.user.id), "token_version": 3}
    monkeypatch.setattr(auth_api, "verify_refresh_token", Mock(return_value=token_data))
    context.query.update.side_effect = [1, 0]
    calls = Mock()
    calls.attach_mock(context.db.commit, "commit")
    calls.attach_mock(auth_response_mocks, "tokens")
    request = RefreshRequest(refresh_token="same-refresh-token")

    response = asyncio.run(auth_api.refresh_token(request, context.db))
    with pytest.raises(HTTPException) as replay:
        asyncio.run(auth_api.refresh_token(request, context.db))

    assert response.success is True
    assert replay.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert context.query.update.call_count == 2
    update_values = context.query.update.call_args.args[0]
    increment = update_values[User.token_version]
    assert increment.left.key == "token_version"
    assert increment.right.value == 1
    assert context.query.update.call_args.kwargs == {"synchronize_session": False}
    filter_values = {
        criterion.left.key: criterion.right.value
        for criterion in context.query.filter.call_args.args
    }
    assert filter_values == {"id": context.user.id, "token_version": 3}
    context.db.commit.assert_called_once_with()
    context.db.rollback.assert_called_once_with()
    context.db.refresh.assert_not_called()
    auth_response_mocks.assert_called_once_with(context.user.id, 4)
    assert [call[0] for call in calls.mock_calls] == ["commit", "tokens"]


def test_refresh_does_not_mint_tokens_if_commit_fails(
    monkeypatch, auth_mutation_context, auth_response_mocks
) -> None:
    context = auth_mutation_context
    monkeypatch.setattr(
        auth_api,
        "verify_refresh_token",
        Mock(return_value={"user_id": str(context.user.id), "token_version": 3}),
    )
    context.db.commit.side_effect = RuntimeError("test database commit failed")

    with pytest.raises(RuntimeError, match="test database commit failed"):
        asyncio.run(
            auth_api.refresh_token(
                RefreshRequest(refresh_token="test-token"), context.db
            )
        )

    auth_response_mocks.assert_not_called()


def test_refresh_mints_only_its_own_version_even_after_later_revocation(
    monkeypatch, auth_mutation_context, auth_response_mocks
) -> None:
    context = auth_mutation_context
    user_id = context.user.id
    monkeypatch.setattr(
        auth_api,
        "verify_refresh_token",
        Mock(return_value={"user_id": str(user_id), "token_version": 3}),
    )
    context.db.commit.side_effect = lambda: setattr(context.user, "token_version", 5)

    asyncio.run(
        auth_api.refresh_token(RefreshRequest(refresh_token="test-token"), context.db)
    )

    auth_response_mocks.assert_called_once_with(user_id, 4)
    context.db.refresh.assert_not_called()


@pytest.mark.parametrize("updated", [0, 1])
def test_logout_uses_database_side_increment_without_stale_read(
    auth_mutation_context, updated
) -> None:
    context = auth_mutation_context
    context.query.update.return_value = updated

    if updated:
        response = asyncio.run(auth_api.logout(str(context.user.id), context.db))
        assert response.data == {"logged_out": True}
        context.db.commit.assert_called_once_with()
        context.db.rollback.assert_not_called()
    else:
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_api.logout(str(context.user.id), context.db))
        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND
        context.db.rollback.assert_called_once_with()
        context.db.commit.assert_not_called()

    context.query.first.assert_not_called()
    increment = context.query.update.call_args.args[0][User.token_version]
    assert increment.left.key == "token_version"
    assert increment.right.value == 1
    assert context.query.update.call_args.kwargs == {"synchronize_session": False}


@pytest.mark.parametrize("updated", [0, 1])
def test_password_change_uses_version_guard_and_rolls_back_lost_race(
    monkeypatch, auth_mutation_context, updated
) -> None:
    context = auth_mutation_context
    context.query.update.return_value = updated
    monkeypatch.setattr(auth_api, "verify_password", Mock(side_effect=[True, False]))
    request = ChangePasswordRequest(
        current_password="Original!6Orchid", new_password="Violet!7Quartz"
    )

    if updated:
        response = asyncio.run(
            auth_api.change_password(request, str(context.user.id), context.db)
        )
        assert response.data == {"password_changed": True}
        context.db.commit.assert_called_once_with()
    else:
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                auth_api.change_password(request, str(context.user.id), context.db)
            )
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        context.db.rollback.assert_called_once_with()
        context.db.commit.assert_not_called()

    context.query.populate_existing.assert_called_once_with()
    filter_values = {
        criterion.left.key: criterion.right.value
        for criterion in context.query.filter.call_args.args
    }
    assert filter_values == {"id": context.user.id, "token_version": 3}
    values = context.query.update.call_args.args[0]
    assert values[User.password_hash] == "changed-password-hash"
    assert values[User.token_version].right.value == 1
    assert context.user.password_hash == "original-password-hash"
    assert context.user.token_version == 3


def test_new_password_reset_token_payload_and_email_bind_current_version(
    monkeypatch,
) -> None:
    service = AuthFlowService()
    create_token = AsyncMock(return_value="new-reset-token")
    monkeypatch.setattr(service, "_create_token", create_token)
    user_id = str(uuid4())

    token = asyncio.run(
        service.create_password_reset_token(user_id, "recovery@example.com", 7, 600)
    )

    assert token == "new-reset-token"
    create_token.assert_awaited_once_with(
        service.PASSWORD_RESET_PREFIX,
        {"user_id": user_id, "email": "recovery@example.com", "token_version": 7},
        600,
    )
    create_reset_token = AsyncMock(return_value="new-reset-token")
    monkeypatch.setattr(
        auth_api.auth_flow_service, "create_password_reset_token", create_reset_token
    )
    user = User(id=uuid4(), email="recovery@example.com", token_version=9)
    background_tasks = BackgroundTasks()

    asyncio.run(auth_api._queue_password_reset_email(background_tasks, user))

    create_reset_token.assert_awaited_once_with(
        user_id=str(user.id),
        email=user.email,
        token_version=9,
        ttl_seconds=settings.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60,
    )
    assert background_tasks.tasks[0].args[2] == "new-reset-token"


@pytest.mark.parametrize("new_password", ["short", "recovery!7Quartz", "aaaaaaaaaa"])
def test_password_reset_policy_failure_does_not_consume_link(
    auth_mutation_context, new_password
) -> None:
    context = auth_mutation_context

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            auth_api.confirm_password_reset(
                PasswordResetConfirmRequest(
                    token="reset-token", new_password=new_password
                ),
                context.db,
            )
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    context.peek.assert_awaited_once_with("reset-token")
    context.consume.assert_not_awaited()
    context.hasher.assert_not_called()
    context.query.update.assert_not_called()
    context.db.commit.assert_not_called()


def test_password_reset_same_password_does_not_consume_link(
    monkeypatch, auth_mutation_context
) -> None:
    context = auth_mutation_context
    monkeypatch.setattr(auth_api, "verify_password", Mock(return_value=True))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            auth_api.confirm_password_reset(
                PasswordResetConfirmRequest(
                    token="reset-token", new_password="Original!6Orchid"
                ),
                context.db,
            )
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    context.consume.assert_not_awaited()
    context.query.update.assert_not_called()


@pytest.mark.parametrize("version", [None, "3", True, -1])
def test_password_reset_rejects_legacy_or_invalid_version_without_consumption(
    auth_mutation_context, version
) -> None:
    context = auth_mutation_context
    payload = context.payload.copy()
    if version is None:
        payload.pop("token_version")
    else:
        payload["token_version"] = version
    context.peek.return_value = payload

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            auth_api.confirm_password_reset(
                PasswordResetConfirmRequest(
                    token="reset-token", new_password="Violet!7Quartz"
                ),
                context.db,
            )
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    context.db.query.assert_not_called()
    context.consume.assert_not_awaited()


def test_password_reset_rejects_revoked_version_before_consumption(
    auth_mutation_context,
) -> None:
    context = auth_mutation_context
    context.user.token_version = 4

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            auth_api.confirm_password_reset(
                PasswordResetConfirmRequest(
                    token="reset-token", new_password="Violet!7Quartz"
                ),
                context.db,
            )
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    context.consume.assert_not_awaited()
    context.query.update.assert_not_called()


@pytest.mark.parametrize(
    "changed_field", ["missing", "user_id", "email", "token_version", "boolean_version"]
)
def test_password_reset_rechecks_atomically_consumed_payload(
    auth_mutation_context, changed_field
) -> None:
    context = auth_mutation_context
    consumed = context.payload.copy()
    if changed_field == "missing":
        consumed = None
    elif changed_field == "boolean_version":
        consumed["token_version"] = True
    else:
        consumed[changed_field] = {
            "user_id": str(uuid4()),
            "email": "other@example.com",
            "token_version": 4,
        }[changed_field]
    context.consume.return_value = consumed

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            auth_api.confirm_password_reset(
                PasswordResetConfirmRequest(
                    token="reset-token", new_password="Violet!7Quartz"
                ),
                context.db,
            )
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    context.consume.assert_awaited_once_with("reset-token")
    context.query.update.assert_not_called()
    context.db.commit.assert_not_called()


@pytest.mark.parametrize("updated", [0, 1])
def test_password_reset_guarded_update_preserves_revocations_and_verifies_email(
    auth_mutation_context, updated
) -> None:
    context = auth_mutation_context
    context.query.update.return_value = updated
    context.user.email_verified = False
    request = PasswordResetConfirmRequest(
        token="reset-token", new_password="Violet!7Quartz"
    )
    calls = Mock()
    calls.attach_mock(context.hasher, "hash")
    calls.attach_mock(context.consume, "consume")
    calls.attach_mock(context.query.update, "update")
    calls.attach_mock(context.db.commit, "commit")
    calls.attach_mock(context.db.rollback, "rollback")

    if updated:
        response = asyncio.run(auth_api.confirm_password_reset(request, context.db))
        assert response.data == {"password_reset": True}
        context.db.commit.assert_called_once_with()
        assert [call[0] for call in calls.mock_calls] == [
            "hash",
            "consume",
            "update",
            "commit",
        ]
    else:
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_api.confirm_password_reset(request, context.db))
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        context.db.rollback.assert_called_once_with()
        context.db.commit.assert_not_called()
        assert [call[0] for call in calls.mock_calls] == [
            "hash",
            "consume",
            "update",
            "rollback",
        ]

    filter_values = {
        criterion.left.key: criterion.right.value
        for criterion in context.query.filter.call_args.args
    }
    assert filter_values == {
        "id": context.payload["user_id"],
        "email": context.payload["email"],
        "token_version": context.payload["token_version"],
    }
    values = context.query.update.call_args.args[0]
    assert values[User.password_hash] == "changed-password-hash"
    assert values[User.auth_provider] == "email"
    assert values[User.email_verified] is True
    assert values[User.token_version].left.key == "token_version"
    assert values[User.token_version].right.value == 1
    assert context.query.update.call_args.kwargs == {"synchronize_session": False}
    assert context.user.password_hash == "original-password-hash"
    assert context.user.token_version == 3


def test_password_reset_typo_can_retry_same_stored_link_once(
    monkeypatch, auth_mutation_context
) -> None:
    context = auth_mutation_context
    service = AuthFlowService()
    key = f"{service.PASSWORD_RESET_PREFIX}:reset-token"
    client = _TokenRedis({key: json.dumps(context.payload)})
    monkeypatch.setattr(redis_service, "redis_client", client)
    monkeypatch.setattr(
        auth_api.auth_flow_service,
        "peek_password_reset_token",
        service.peek_password_reset_token,
    )
    monkeypatch.setattr(
        auth_api.auth_flow_service,
        "consume_password_reset_token",
        service.consume_password_reset_token,
    )

    with pytest.raises(HTTPException) as invalid_password:
        asyncio.run(
            auth_api.confirm_password_reset(
                PasswordResetConfirmRequest(token="reset-token", new_password="short"),
                context.db,
            )
        )

    assert invalid_password.value.status_code == status.HTTP_400_BAD_REQUEST
    assert key in client.values
    assert client.consumed_keys == []
    request = PasswordResetConfirmRequest(
        token="reset-token", new_password="Violet!7Quartz"
    )

    response = asyncio.run(auth_api.confirm_password_reset(request, context.db))

    assert response.data == {"password_reset": True}
    assert key not in client.values
    assert client.consumed_keys == [key]
    with pytest.raises(HTTPException) as replay:
        asyncio.run(auth_api.confirm_password_reset(request, context.db))

    assert replay.value.status_code == status.HTTP_400_BAD_REQUEST
    context.query.update.assert_called_once()
    context.db.commit.assert_called_once_with()


@pytest.mark.parametrize("version", [None, 2, 3])
def test_password_reset_page_rejects_old_or_revoked_authorization(
    auth_mutation_context, version
) -> None:
    context = auth_mutation_context
    payload = context.payload.copy()
    if version is None:
        payload.pop("token_version")
    else:
        payload["token_version"] = version
    context.peek.return_value = payload

    response = asyncio.run(auth_api.password_reset_page("reset-token", context.db))
    body = response.body.decode("utf-8")

    if version == 3:
        assert 'id="passwordResetForm"' in body
    else:
        assert 'id="passwordResetForm"' not in body
        assert "재설정 링크가 유효하지 않습니다." in body
    context.consume.assert_not_awaited()


def test_access_token_includes_and_requires_token_version() -> None:
    user_id = uuid4()
    token = create_access_token(user_id, token_version=3)

    token_data = verify_access_token(token)

    assert token_data == {"user_id": str(user_id), "token_version": 3}

    legacy_payload = {
        "sub": str(user_id),
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        "iat": datetime.now(timezone.utc),
    }
    legacy_token = jwt.encode(
        legacy_payload,
        get_jwt_secret_key(),
        algorithm=settings.JWT_ALGORITHM,
    )

    assert verify_access_token(legacy_token) is None


def test_refresh_token_requires_integer_token_version() -> None:
    user_id = uuid4()
    valid_token = create_refresh_token(user_id, token_version=2)

    assert verify_refresh_token(valid_token) == {
        "user_id": str(user_id),
        "token_version": 2,
    }

    invalid_payload = {
        "sub": str(user_id),
        "type": "refresh",
        "token_version": "2",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        "iat": datetime.now(timezone.utc),
    }
    invalid_token = jwt.encode(
        invalid_payload,
        get_jwt_secret_key(),
        algorithm=settings.JWT_ALGORITHM,
    )

    assert verify_refresh_token(invalid_token) is None


def test_get_client_ip_only_trusts_forwarded_headers_from_trusted_proxy(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "TRUSTED_PROXY_CIDRS", "10.0.0.0/8")

    spoofed_request = SimpleNamespace(
        headers={"x-forwarded-for": "198.51.100.7"},
        client=SimpleNamespace(host="203.0.113.10"),
    )
    trusted_proxy_request = SimpleNamespace(
        headers={"x-forwarded-for": "198.51.100.7, 10.0.0.5"},
        client=SimpleNamespace(host="10.0.0.5"),
    )

    assert _get_client_ip(spoofed_request) == "203.0.113.10"
    assert _get_client_ip(trusted_proxy_request) == "198.51.100.7"


def test_image_size_limit_rejects_large_payload(monkeypatch) -> None:
    monkeypatch.setattr(settings, "MAX_IMAGE_UPLOAD_BYTES", 3)

    with pytest.raises(HTTPException) as exc_info:
        _validate_image_size(4)

    assert exc_info.value.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE


def test_image_signature_must_match_declared_type() -> None:
    _validate_image_signature(b"\x89PNG\r\n\x1a\nsample", "image/png")

    with pytest.raises(HTTPException) as exc_info:
        _validate_image_signature(b"\x89PNG\r\n\x1a\nsample", "image/jpeg")

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST


def test_external_numeric_id_rejects_non_numeric_value() -> None:
    assert parse_external_numeric_id("12345", "TMDb") == 12345

    with pytest.raises(HTTPException) as exc_info:
        parse_external_numeric_id("abc", "TMDb")

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST


def test_request_schemas_reject_unbounded_user_input() -> None:
    with pytest.raises(ValidationError):
        CollectionCreate(name="x" * 101)

    with pytest.raises(ValidationError):
        TagCreate(name="   ")

    with pytest.raises(ValidationError):
        UserMovieCreate(
            movie_id=1,
            status="completed",
            one_line_review="x" * 2001,
        )

    with pytest.raises(ValidationError):
        UserDeleteRequest(confirmation_text="delete")

    assert (
        UserDeleteRequest(confirmation_text="회원탈퇴").confirmation_text == "회원탈퇴"
    )


def test_auto_collection_rule_validation_rejects_bad_types() -> None:
    with pytest.raises(ValueError, match="rating.min must be a number"):
        auto_collection_service.validate_auto_rule(
            {"status": "completed", "rating": {"min": "4"}}
        )

    with pytest.raises(ValueError, match="watch_date.min must be an ISO date string"):
        auto_collection_service.validate_auto_rule(
            {"status": "completed", "watch_date": {"min": "not-a-date"}}
        )
