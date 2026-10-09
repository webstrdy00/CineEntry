import asyncio
import logging

import httpx
import pytest

from app.config import Settings, settings
from app.main import app
from app.services.email_service import EmailService


def production_settings(**overrides):
    values = {
        "DATABASE_URL": "postgresql://test:test@localhost/test",
        "DEBUG": False,
        "JWT_SECRET_KEY": "test-only-configuration-key-at-least-32-bytes",
        "FRONTEND_URL": "https://app.example.test",
        "BACKEND_PUBLIC_URL": "https://api.example.test",
        "EMAIL_LOG_ONLY": False,
        "SMTP_HOST": "smtp.example.test",
        "SMTP_USE_TLS": True,
        "SMTP_USE_SSL": False,
        "SMTP_USERNAME": None,
        "SMTP_PASSWORD": None,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.mark.parametrize(
    "changes,field",
    [
        ({"JWT_SECRET_KEY": "short"}, "JWT_SECRET_KEY"),
        ({"JWT_SECRET_KEY": " " * 64}, "JWT_SECRET_KEY"),
        ({"JWT_SECRET_KEY": "a" * 64}, "JWT_SECRET_KEY"),
        (
            {"JWT_SECRET_KEY": "your-super-secret-jwt-key-generate-random-string"},
            "JWT_SECRET_KEY",
        ),
        ({"BACKEND_PUBLIC_URL": "http://api.example.test"}, "BACKEND_PUBLIC_URL"),
        ({"FRONTEND_URL": "https://user:password@app.example.test"}, "FRONTEND_URL"),
        ({"EMAIL_LOG_ONLY": True}, "EMAIL_LOG_ONLY"),
        ({"SMTP_HOST": None}, "SMTP_HOST"),
        ({"SMTP_USERNAME": "user", "SMTP_PASSWORD": None}, "SMTP_USERNAME"),
        ({"SMTP_USE_TLS": False, "SMTP_USE_SSL": False}, "SMTP_USE_TLS"),
        ({"SMTP_USE_TLS": True, "SMTP_USE_SSL": True}, "SMTP_USE_TLS"),
    ],
)
def test_invalid_production_settings_fail_without_secret_values(changes, field):
    with pytest.raises(RuntimeError, match=field) as error:
        production_settings(**changes).validate_production()
    for value in changes.values():
        if isinstance(value, str) and value:
            assert value not in str(error.value)


def test_valid_production_configuration_is_accepted():
    production_settings().validate_production()


def test_missing_smtp_does_not_silently_skip_delivery(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_LOG_ONLY", False)
    monkeypatch.setattr(settings, "SMTP_HOST", None)
    with pytest.raises(RuntimeError, match="SMTP_HOST"):
        EmailService().send_email("test@example.test", "test", "test content")


def test_development_email_logs_neither_recipient_nor_content(monkeypatch, caplog):
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "EMAIL_LOG_ONLY", True)
    with caplog.at_level(logging.INFO):
        EmailService().send_email(
            "private@example.test", "private subject", "private recovery URL"
        )
    assert "delivery skipped" in caplog.text
    assert "private" not in caplog.text


def test_production_email_logging_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.setattr(settings, "EMAIL_LOG_ONLY", True)
    with pytest.raises(RuntimeError, match="not permitted"):
        EmailService().send_email("test@example.test", "test", "test")


def test_auth_errors_are_not_cacheable():
    async def check():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/auth/nonexistent")
        assert response.status_code == 404
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert response.headers["x-content-type-options"] == "nosniff"

    asyncio.run(check())
