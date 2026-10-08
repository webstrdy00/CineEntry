import asyncio
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException, status

from app.api.v1.auth import (
    _consume_oauth_state,
    _build_pkce_pair,
    _ensure_existing_user_can_link_oauth,
    _ensure_oauth_email_verified,
    _get_oauth_redirect_uri,
    _is_google_email_verified,
    _is_kakao_email_verified,
    _oauth_states,
    _prune_oauth_states,
    _render_mobile_oauth_bridge_page,
    _store_oauth_state,
    google_auth_start,
)
from app.config import settings
from app.models.user import User


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
    _oauth_states.clear()
    _store_oauth_state("state-123", "google", "mobile", code_verifier="verifier-123")

    assert _consume_oauth_state("state-123", "google") == ("mobile", "verifier-123")
    assert "state-123" not in _oauth_states


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

    assert "cineentry://auth/kakao/callback?code=sample-code&state=sample-state" in body
    assert "앱으로 돌아가기" in body
    assert "앱으로 돌아갑니다" in body
    assert "Kakao" in body
    assert "앱 복귀" in body


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
        _is_kakao_email_verified(
            {"is_email_valid": True, "is_email_verified": True}
        )
        is True
    )
    assert (
        _is_kakao_email_verified(
            {"is_email_valid": True, "is_email_verified": False}
        )
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
