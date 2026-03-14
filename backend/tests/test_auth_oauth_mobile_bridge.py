from app.api.v1.auth import (
    _consume_oauth_state,
    _get_oauth_redirect_uri,
    _oauth_states,
    _render_mobile_oauth_bridge_page,
    _store_oauth_state,
)
from app.config import settings


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


def test_consume_oauth_state_returns_redirect_client_and_pops_state() -> None:
    _oauth_states.clear()
    _store_oauth_state("state-123", "google", "mobile")

    assert _consume_oauth_state("state-123", "google") == "mobile"
    assert "state-123" not in _oauth_states


def test_render_mobile_oauth_bridge_page_contains_app_callback_url() -> None:
    response = _render_mobile_oauth_bridge_page(
        "kakao",
        code="sample-code",
        state="sample-state",
    )

    body = response.body.decode("utf-8")

    assert "cineentry://auth/kakao/callback?code=sample-code&state=sample-state" in body
    assert "앱으로 돌아가기" in body
