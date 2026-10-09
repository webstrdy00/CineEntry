import asyncio
import hashlib
import json
import re
from html import unescape
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import pytest
from fastapi import HTTPException, status
from pydantic import ValidationError

from app.api.v1 import auth as auth_api
from app.api.v1.auth import (
    _consume_oauth_state,
    _build_pkce_pair,
    _build_status_action_markup,
    _ensure_existing_user_can_link_oauth,
    _ensure_oauth_email_verified,
    _get_oauth_redirect_uri,
    _is_google_email_verified,
    _is_kakao_email_verified,
    _oauth_states,
    _prune_oauth_states,
    _render_mobile_oauth_bridge_page,
    _render_password_reset_page,
    _store_oauth_state,
    google_auth_start,
    kakao_auth_start,
)
from app.config import settings
from app.models.user import User
from app.schemas.auth import AuthUserResponse, OAuthCallbackRequest


@pytest.fixture(autouse=True)
def isolated_oauth_states():
    _oauth_states.clear()
    yield
    _oauth_states.clear()


def test_get_oauth_redirect_uri_uses_backend_public_url_for_mobile(monkeypatch) -> None:
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.cineentry.com/")
    monkeypatch.setattr(settings, "BACKEND_PUBLIC_URL", "https://api.cineentry.com/")

    assert (
        _get_oauth_redirect_uri("google", "mobile")
        == "https://api.cineentry.com/api/v1/auth/google/mobile/callback"
    )
    assert (
        _get_oauth_redirect_uri("google", "web")
        == "https://app.cineentry.com/auth/google/callback"
    )


def test_web_oauth_client_is_opt_in(monkeypatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "google-client-id")
    monkeypatch.setattr(settings, "OAUTH_WEB_CLIENT_ENABLED", False)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(google_auth_start("web"))

    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN


def test_consume_oauth_state_returns_redirect_client_and_pops_state() -> None:
    transaction_token = "transaction-token-for-start-device"
    _store_oauth_state(
        "state-123",
        "google",
        "mobile",
        transaction_token=transaction_token,
        code_verifier="verifier-123",
    )

    assert (
        _oauth_states["state-123"]["transaction_token_hash"]
        == hashlib.sha256(transaction_token.encode("utf-8")).hexdigest()
    )
    assert transaction_token not in str(_oauth_states)
    assert _consume_oauth_state("state-123", "google", transaction_token) == (
        "mobile",
        "verifier-123",
    )
    assert "state-123" not in _oauth_states
    with pytest.raises(HTTPException) as exc_info:
        _consume_oauth_state("state-123", "google", transaction_token)

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.parametrize(
    "state,provider,transaction_token",
    [
        (None, "google", "transaction-token-for-start-device"),
        ("", "google", "transaction-token-for-start-device"),
        ("state-123", "google", None),
        ("state-123", "google", ""),
        ("state-123", "google", "wrong-transaction-token-for-device"),
        ("state-123", "kakao", "transaction-token-for-start-device"),
        ("unknown-state", "google", "transaction-token-for-start-device"),
    ],
)
def test_invalid_oauth_proof_does_not_consume_valid_transaction(
    state, provider, transaction_token
) -> None:
    correct_token = "transaction-token-for-start-device"
    _store_oauth_state("state-123", "google", "mobile", transaction_token=correct_token)

    with pytest.raises(HTTPException) as exc_info:
        _consume_oauth_state(state, provider, transaction_token)

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "state-123" in _oauth_states
    assert _consume_oauth_state("state-123", "google", correct_token) == (
        "mobile",
        None,
    )


def test_oauth_transaction_expires_at_ttl_boundary(monkeypatch) -> None:
    monkeypatch.setattr(settings, "OAUTH_STATE_TTL_SECONDS", 10)
    monkeypatch.setattr(auth_api.time, "monotonic", lambda: 10.0)
    _store_oauth_state(
        "state-123",
        "google",
        "mobile",
        transaction_token="transaction-token-for-start-device",
    )
    monkeypatch.setattr(auth_api.time, "monotonic", lambda: 20.0)

    with pytest.raises(HTTPException) as exc_info:
        _consume_oauth_state(
            "state-123", "google", "transaction-token-for-start-device"
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "state-123" not in _oauth_states


@pytest.mark.parametrize(
    "payload",
    [
        {"code": "code", "state": "state"},
        {"code": "code", "transaction_token": "t" * 43},
        {"code": "code", "state": None, "transaction_token": "t" * 43},
        {"code": "code", "state": "", "transaction_token": "t" * 43},
        {"code": "code", "state": "s" * 513, "transaction_token": "t" * 43},
        {"code": "code", "state": "state", "transaction_token": None},
        {"code": "code", "state": "state", "transaction_token": ""},
        {"code": "code", "state": "state", "transaction_token": "too-short"},
        {"code": "code", "state": "state", "transaction_token": "t" * 129},
    ],
)
def test_oauth_callback_requires_bounded_state_and_transaction_proof(payload) -> None:
    with pytest.raises(ValidationError):
        OAuthCallbackRequest(**payload)


@pytest.mark.parametrize("provider", ["google", "kakao"])
@pytest.mark.parametrize(
    "failure", ["wrong_proof", "wrong_provider", "expired", "unknown_state"]
)
def test_oauth_callback_rejects_bad_transaction_before_provider_exchange(
    monkeypatch, provider, failure
) -> None:
    correct_token = "t" * 43
    saved_provider = (
        ("kakao" if provider == "google" else "google")
        if failure == "wrong_provider"
        else provider
    )
    _store_oauth_state(
        "state-123",
        saved_provider,
        "mobile",
        transaction_token=correct_token,
        code_verifier="verifier-123",
    )
    if failure == "expired":
        _oauth_states["state-123"]["created_at"] -= settings.OAUTH_STATE_TTL_SECONDS + 1
    client_factory = Mock(
        side_effect=AssertionError("Invalid transaction must not contact the provider")
    )
    monkeypatch.setattr(auth_api.httpx, "AsyncClient", client_factory)
    callback = getattr(auth_api, f"{provider}_auth_callback")
    request = OAuthCallbackRequest(
        code="sample-code",
        state="unknown-state" if failure == "unknown_state" else "state-123",
        transaction_token="w" * 43 if failure == "wrong_proof" else correct_token,
    )
    db = Mock()

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(callback(request, db))

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    client_factory.assert_not_called()
    db.query.assert_not_called()
    if failure != "expired":
        assert "state-123" in _oauth_states


@pytest.mark.parametrize("provider", ["google", "kakao"])
def test_valid_oauth_proof_allows_only_one_provider_exchange(
    monkeypatch, provider
) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "google-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-google-secret")
    monkeypatch.setattr(settings, "KAKAO_CLIENT_ID", "kakao-client-id")
    monkeypatch.setattr(settings, "KAKAO_CLIENT_SECRET", "test-kakao-secret")
    transaction_token = "t" * 43
    _store_oauth_state(
        "state-123",
        provider,
        "mobile",
        transaction_token=transaction_token,
        code_verifier="verifier-123",
    )
    user = User(
        id=uuid4(),
        email="verified@example.com",
        display_name="소셜 사용자",
        password_hash="existing-password-hash",
        auth_provider="email",
        google_connected=False,
        kakao_connected=False,
        email_verified=True,
        token_version=2,
    )
    userinfo = (
        {"email": user.email, "email_verified": True}
        if provider == "google"
        else {
            "kakao_account": {
                "email": user.email,
                "is_email_valid": True,
                "is_email_verified": True,
            }
        }
    )
    client = AsyncMock()
    client.__aenter__.return_value = client
    client.post.return_value = SimpleNamespace(
        status_code=200, json=lambda: {"access_token": "test-provider-token"}
    )
    client.get.return_value = SimpleNamespace(status_code=200, json=lambda: userinfo)
    client_factory = Mock(return_value=client)
    monkeypatch.setattr(auth_api.httpx, "AsyncClient", client_factory)
    tokens = Mock(
        return_value={
            "access_token": "test-access-token",
            "refresh_token": "test-refresh-token",
            "expires_in": 3600,
        }
    )
    monkeypatch.setattr(auth_api, "create_tokens", tokens)
    monkeypatch.setattr(
        auth_api,
        "_build_auth_user_response",
        lambda current_user: AuthUserResponse(
            id=str(current_user.id),
            email=current_user.email,
            display_name=current_user.display_name,
            auth_provider=current_user.auth_provider,
            auth_methods=current_user.auth_methods,
            email_verified=current_user.email_verified,
            has_password=current_user.has_password,
        ),
    )
    callback = getattr(auth_api, f"{provider}_auth_callback")
    request = OAuthCallbackRequest(
        code="sample-code", state="state-123", transaction_token=transaction_token
    )
    db = Mock()
    db.query.return_value.filter.return_value.first.return_value = user

    response = asyncio.run(callback(request, db))

    assert response.success is True
    assert response.data.user.id == str(user.id)
    assert provider in response.data.user.auth_methods
    assert response.data.tokens.access_token == "test-access-token"
    tokens.assert_called_once_with(user.id, 2)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(callback(request, db))

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST

    assert "state-123" not in _oauth_states
    client_factory.assert_called_once_with()
    client.post.assert_awaited_once()
    client.get.assert_awaited_once()
    db.query.assert_called_once_with(User)
    db.commit.assert_called_once_with()
    db.refresh.assert_called_once_with(user)
    exchange_data = client.post.call_args.kwargs["data"]
    assert exchange_data["code"] == "sample-code"
    assert "transaction_token" not in exchange_data
    assert transaction_token not in str(exchange_data)
    if provider == "google":
        assert exchange_data["code_verifier"] == "verifier-123"


@pytest.mark.parametrize("provider", ["google", "kakao"])
@pytest.mark.parametrize("client", ["mobile", "web"])
def test_oauth_start_returns_device_proof_only_in_json_not_provider_or_bridge(
    monkeypatch, provider, client
) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "google-client-id")
    monkeypatch.setattr(settings, "KAKAO_CLIENT_ID", "kakao-client-id")
    monkeypatch.setattr(settings, "OAUTH_WEB_CLIENT_ENABLED", True)
    start = google_auth_start if provider == "google" else kakao_auth_start
    response = asyncio.run(start(client))
    transaction_token = response.data.transaction_token
    state = response.data.state

    assert len(transaction_token) == 43
    assert transaction_token != state
    assert response.data.expires_in == settings.OAUTH_STATE_TTL_SECONDS
    assert transaction_token not in response.data.url
    assert "transaction_token" not in parse_qs(urlparse(response.data.url).query)
    assert (
        _oauth_states[state]["transaction_token_hash"]
        == hashlib.sha256(transaction_token.encode("utf-8")).hexdigest()
    )
    assert transaction_token not in str(_oauth_states)
    bridge = _render_mobile_oauth_bridge_page(provider, code="sample-code", state=state)
    bridge_body = bridge.body.decode("utf-8")
    assert transaction_token not in bridge_body
    assert "transaction_token" not in bridge_body
    script_url = re.search(r"window\.location\.href = (.+);", bridge_body)
    assert script_url is not None
    assert parse_qs(urlparse(json.loads(script_url.group(1))).query) == {
        "code": ["sample-code"],
        "state": [state],
    }


def test_prune_oauth_state_removes_expired_and_oldest_entries(monkeypatch) -> None:
    _oauth_states.clear()
    monkeypatch.setattr(settings, "OAUTH_STATE_TTL_SECONDS", 10)
    monkeypatch.setattr(settings, "OAUTH_STATE_MAX_ENTRIES", 2)

    _oauth_states.update(
        {
            "expired": {
                "provider": "google",
                "client": "web",
                "code_verifier": None,
                "created_at": 1.0,
            },
            "old": {
                "provider": "google",
                "client": "web",
                "code_verifier": None,
                "created_at": 20.0,
            },
            "newer": {
                "provider": "kakao",
                "client": "mobile",
                "code_verifier": None,
                "created_at": 21.0,
            },
            "newest": {
                "provider": "kakao",
                "client": "mobile",
                "code_verifier": None,
                "created_at": 22.0,
            },
        }
    )

    _prune_oauth_states(now=23.0)

    assert set(_oauth_states) == {"newer", "newest"}


def test_render_mobile_oauth_bridge_page_contains_app_callback_url() -> None:
    response = _render_mobile_oauth_bridge_page(
        "kakao",
        code="sample-code",
        state="sample-state",
    )

    body = response.body.decode("utf-8")

    callback_url = "cineentry://auth/kakao/callback?code=sample-code&state=sample-state"
    assert callback_url in unescape(body)
    script_url = re.search(r"window\.location\.href = (.+);", body)
    assert script_url is not None
    assert json.loads(script_url.group(1)) == callback_url
    assert "앱으로 돌아가기" in body
    assert "앱으로 돌아갑니다" in body
    assert "Kakao" in body
    assert "앱 복귀" in body


def test_password_reset_inline_json_cannot_close_script_and_preserves_korean() -> None:
    malicious_value = (
        "한글 </ScRiPt><script>alert('x')</script><!-- & \" \\ \u2028\u2029"
    )
    response = _render_password_reset_page(
        "reset-token",
        email=malicious_value,
        display_name=malicious_value,
    )
    body = response.body.decode("utf-8")
    scripts = re.findall(
        r"<script>(.*?)</script>", body, flags=re.DOTALL | re.IGNORECASE
    )

    assert len(scripts) == 1
    assert "한글" in scripts[0]
    for field in ("email", "displayName"):
        serialized_value = re.search(
            rf"^\s*{field}: (.*),$", scripts[0], flags=re.MULTILINE
        )
        assert serialized_value is not None
        encoded = serialized_value.group(1)
        assert not any(char in encoded for char in "<>&'\u2028\u2029")
        assert json.loads(encoded) == malicious_value


def test_status_action_inline_json_preserves_url_without_script_injection() -> None:
    action_href = (
        "cineentry://auth/한글</script><script>alert('x')</script>?a=1&b=2\u2028\u2029"
    )
    action_button, auto_open_script, _ = _build_status_action_markup(
        action_href, "앱 열기"
    )
    scripts = re.findall(
        r"<script>(.*?)</script>", auto_open_script, flags=re.DOTALL | re.IGNORECASE
    )

    assert len(scripts) == 1
    assert "한글" in scripts[0]
    assert action_href in unescape(action_button)
    script_url = re.search(r"window\.location\.href = (.+);", scripts[0])
    assert script_url is not None
    encoded = script_url.group(1)
    assert not any(char in encoded for char in "<>&'\u2028\u2029")
    assert json.loads(encoded) == action_href


def test_mobile_oauth_error_description_is_escaped_and_callback_query_round_trips() -> (
    None
):
    error_description = "연결 실패 </script><img src=x onerror=alert(1)> & 다시 시도"
    response = _render_mobile_oauth_bridge_page(
        "google",
        state="state-with-&-separator",
        error="access_denied",
        error_description=error_description,
    )
    body = response.body.decode("utf-8")

    assert "<img src=x" not in body
    assert "연결 실패" in body
    assert len(re.findall(r"<script>", body, flags=re.IGNORECASE)) == 1
    script_url = re.search(r"window\.location\.href = (.+);", body)
    assert script_url is not None
    callback_url = json.loads(script_url.group(1))
    assert parse_qs(urlparse(callback_url).query) == {
        "state": ["state-with-&-separator"],
        "error": ["access_denied"],
        "error_description": [error_description],
    }


def test_build_pkce_pair_returns_s256_compatible_values() -> None:
    verifier, challenge = _build_pkce_pair()

    assert verifier
    assert challenge
    assert "=" not in challenge


def test_google_auth_start_includes_pkce_parameters() -> None:
    _oauth_states.clear()
    original_client_id = settings.GOOGLE_CLIENT_ID

    try:
        settings.GOOGLE_CLIENT_ID = "google-client-id"
        response = asyncio.run(google_auth_start("mobile"))
    finally:
        settings.GOOGLE_CLIENT_ID = original_client_id

    parsed = urlparse(response.data.url)
    query = parse_qs(parsed.query)
    state = response.data.state

    assert query["code_challenge_method"] == ["S256"]
    assert len(query["code_challenge"][0]) >= 43
    assert state in _oauth_states
    assert _oauth_states[state]["code_verifier"]


def test_oauth_email_verification_flags_are_required() -> None:
    assert _is_google_email_verified({"email_verified": True}) is True
    assert _is_google_email_verified({"verified_email": True}) is True
    assert _is_google_email_verified({"email_verified": False}) is False

    assert (
        _is_kakao_email_verified({"is_email_valid": True, "is_email_verified": True})
        is True
    )
    assert (
        _is_kakao_email_verified({"is_email_valid": True, "is_email_verified": False})
        is False
    )

    with pytest.raises(HTTPException) as exc_info:
        _ensure_oauth_email_verified("google", False)

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST


def test_existing_user_must_have_verified_email_before_oauth_auto_link() -> None:
    unverified_user = User(email="user@example.com", email_verified=False)
    verified_user = User(email="user@example.com", email_verified=True)

    _ensure_existing_user_can_link_oauth(verified_user, "google")

    with pytest.raises(HTTPException) as exc_info:
        _ensure_existing_user_can_link_oauth(unverified_user, "google")

    assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
