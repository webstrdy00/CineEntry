"""
Authentication API endpoints
이메일/OAuth 로그인, 회원가입, 이메일 인증, 비밀번호 재설정, 토큰 갱신
"""
import json
import secrets
from html import escape
from string import Template
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.middleware.auth_middleware import get_current_user_id
from app.models.user import User
from app.schemas.auth import (
    AuthUserResponse,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    OAuthCallbackRequest,
    OAuthUrlResponse,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.common import BaseResponse
from app.services.auth_email_service import auth_email_service
from app.services.auth_flow_service import auth_flow_service
from app.services.auth_service import (
    create_tokens,
    hash_password,
    verify_password,
    verify_refresh_token,
)
from app.services.auto_collection_service import auto_collection_service
from app.services.password_policy_service import (
    PASSWORD_MIN_LENGTH,
    PASSWORD_POLICY_REQUIREMENTS,
    validate_password_policy,
)
from app.services.response_serializers import serialize_auth_user

router = APIRouter(prefix="/auth", tags=["auth"])

# OAuth state 임시 저장 (프로덕션에서는 Redis 사용 권장)
_oauth_states: dict[str, tuple[str, str]] = {}


def _normalize_oauth_client(client: str | None) -> str:
    normalized = (client or "web").strip().lower()
    if normalized not in {"web", "mobile"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="지원하지 않는 OAuth 클라이언트입니다.",
        )
    return normalized


def _store_oauth_state(state: str, provider: str, client: str) -> None:
    _oauth_states[state] = (provider, client)


def _consume_oauth_state(state: str | None, provider: str) -> str:
    """
    OAuth state 1회용 검증/소비.

    - state 누락 차단
    - provider 불일치 차단 (google state를 kakao에 재사용 방지)
    - web/mobile redirect 대상 불일치 방지
    - 재사용 차단(pop)
    """
    if not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="state 값이 필요합니다.",
        )

    saved_state = _oauth_states.pop(state, None)
    if not saved_state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효하지 않은 state입니다.",
        )

    saved_provider, saved_client = saved_state
    if saved_provider != provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효하지 않은 state입니다.",
        )

    return saved_client


def _provider_label(provider: str) -> str:
    labels = {
        "email": "이메일",
        "google": "Google",
        "kakao": "Kakao",
    }
    return labels.get(provider, provider)


def _build_auth_user_response(user: User) -> AuthUserResponse:
    return serialize_auth_user(user)


def _get_oauth_redirect_uri(provider: str, client: str) -> str:
    if client == "mobile":
        return (
            f"{settings.BACKEND_PUBLIC_URL.rstrip('/')}"
            f"/api/v1/auth/{provider}/mobile/callback"
        )

    return f"{settings.FRONTEND_URL.rstrip('/')}/auth/{provider}/callback"


def _build_app_callback_url(
    provider: str,
    *,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
) -> str:
    params = {
        key: value
        for key, value in {
            "code": code,
            "state": state,
            "error": error,
            "error_description": error_description,
        }.items()
        if value
    }
    query = urlencode(params)
    base_url = f"cineentry://auth/{provider}/callback"
    return f"{base_url}?{query}" if query else base_url


def _render_mobile_oauth_bridge_page(
    provider: str,
    *,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
) -> HTMLResponse:
    provider_label = _provider_label(provider)
    action_href = _build_app_callback_url(
        provider,
        code=code,
        state=state,
        error=error,
        error_description=error_description,
    )

    if error:
        description = error_description or (
            f"{provider_label} 로그인 완료를 처리하지 못했습니다. 앱으로 돌아가 다시 시도해주세요."
        )
        return _render_status_page(
            f"{provider_label} 로그인 실패",
            description,
            success=False,
            action_href=action_href,
            action_label="앱으로 돌아가기",
        )

    if not code or not state:
        return _render_status_page(
            f"{provider_label} 로그인 실패",
            "로그인 응답 값이 올바르지 않습니다. 앱에서 다시 시도해주세요.",
            success=False,
            action_href=action_href,
            action_label="앱으로 돌아가기",
        )

    return _render_status_page(
        f"{provider_label} 로그인 연결 완료",
        "앱으로 돌아가 로그인을 마무리하고 있습니다.",
        success=True,
        action_href=action_href,
        action_label="앱으로 돌아가기",
    )


def _get_client_ip(http_request: Request) -> str:
    forwarded_for = http_request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip() or "unknown"

    real_ip = http_request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip() or "unknown"

    return http_request.client.host if http_request.client else "unknown"


def _rate_limit_identities(email: str | None, client_ip: str | None) -> list[tuple[str, str]]:
    identities: list[tuple[str, str]] = []
    if email:
        identities.append(("email", email.strip().casefold()))
    if client_ip:
        identities.append(("ip", client_ip.strip()))
    return identities


async def _ensure_not_rate_limited(
    purpose: str,
    *,
    email: str | None = None,
    client_ip: str | None = None,
    limit: int,
    detail: str,
) -> None:
    retry_after = 0

    for identity_type, identity in _rate_limit_identities(email, client_ip):
        rate_limit_key = f"{purpose}:{identity_type}"
        count = await auth_flow_service.get_rate_limit_count(rate_limit_key, identity)
        if count >= limit:
            retry_after = max(
                retry_after,
                await auth_flow_service.get_rate_limit_retry_after(rate_limit_key, identity),
            )

    if retry_after > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers={"Retry-After": str(retry_after)},
        )


async def _record_rate_limited_attempt(
    purpose: str,
    *,
    email: str | None = None,
    client_ip: str | None = None,
    ttl_seconds: int,
) -> None:
    for identity_type, identity in _rate_limit_identities(email, client_ip):
        await auth_flow_service.record_rate_limit_attempt(
            f"{purpose}:{identity_type}",
            identity,
            ttl_seconds,
        )


async def _clear_rate_limited_attempts(
    purpose: str,
    *,
    email: str | None = None,
    client_ip: str | None = None,
) -> None:
    for identity_type, identity in _rate_limit_identities(email, client_ip):
        await auth_flow_service.clear_rate_limit(f"{purpose}:{identity_type}", identity)


def _validate_password_or_raise(
    password: str,
    *,
    email: str | None = None,
    display_name: str | None = None,
) -> None:
    errors = validate_password_policy(
        password,
        email=email,
        display_name=display_name,
    )
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="\n".join(errors),
        )


def _ensure_email_verified_or_raise(user: User) -> None:
    if user.email_verified:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "이메일 인증이 아직 완료되지 않았습니다. 가입 시 받은 인증 메일을 확인하거나 "
            "비밀번호 재설정을 완료한 뒤 다시 로그인해주세요."
        ),
    )


async def _queue_verification_email(background_tasks: BackgroundTasks, user: User) -> None:
    token = await auth_flow_service.create_email_verification_token(
        str(user.id),
        user.email,
        settings.EMAIL_VERIFICATION_TOKEN_TTL_HOURS * 3600,
    )
    background_tasks.add_task(
        auth_email_service.send_verification_email,
        user.email,
        user.display_name,
        token,
    )


async def _queue_password_reset_email(background_tasks: BackgroundTasks, user: User) -> None:
    token = await auth_flow_service.create_password_reset_token(
        str(user.id),
        user.email,
        settings.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60,
    )
    background_tasks.add_task(
        auth_email_service.send_password_reset_email,
        user.email,
        user.display_name,
        token,
        user.has_password,
    )


def _render_auth_shell(page_title: str, content: str) -> HTMLResponse:
    template = Template(
        """
        <!doctype html>
        <html lang="ko">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>$page_title</title>
            <style>
              :root {
                color-scheme: dark;
                --bg: #0b1120;
                --bg-soft: #111827;
                --card: rgba(15, 23, 42, 0.96);
                --card-border: rgba(148, 163, 184, 0.16);
                --text: #f8fafc;
                --muted: #94a3b8;
                --line: rgba(148, 163, 184, 0.18);
                --accent: #d4af37;
                --danger: #ef4444;
                --success: #10b981;
                --radius: 20px;
                --shadow: 0 20px 48px rgba(0, 0, 0, 0.34);
              }

              * {
                box-sizing: border-box;
              }

              body {
                min-height: 100%;
              }

              body {
                margin: 0;
                color: var(--text);
                font-family: Inter, "Segoe UI", system-ui, sans-serif;
                background: linear-gradient(180deg, var(--bg) 0%, var(--bg-soft) 100%);
              }

              [hidden] {
                display: none !important;
              }

              .auth-shell {
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px 16px;
              }

              .auth-card {
                width: min(100%, 460px);
                background: var(--card);
                border: 1px solid var(--card-border);
                border-radius: var(--radius);
                box-shadow: var(--shadow);
                padding: 28px 22px;
              }

              .brand-label {
                margin: 0 0 18px;
                font-size: 12px;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                color: var(--accent);
                font-weight: 700;
              }

              .status-icon {
                width: 52px;
                height: 52px;
                border-radius: 14px;
                display: grid;
                place-items: center;
                margin-bottom: 16px;
                border: 1px solid transparent;
              }

              .status-icon.success {
                background: rgba(16, 185, 129, 0.12);
                border-color: rgba(16, 185, 129, 0.22);
                color: #d1fae5;
              }

              .status-icon.failure {
                background: rgba(239, 68, 68, 0.12);
                border-color: rgba(239, 68, 68, 0.22);
                color: #fecaca;
              }

              .status-icon svg {
                width: 26px;
                height: 26px;
              }

              .page-title {
                margin: 0;
                font-size: clamp(1.75rem, 4vw, 2.15rem);
                line-height: 1.2;
                font-weight: 700;
              }

              .page-copy {
                margin: 12px 0 0;
                color: var(--muted);
                font-size: 15px;
                line-height: 1.7;
              }

              .field-stack,
              .action-row {
                margin-top: 22px;
              }

              .field-stack {
                display: grid;
                gap: 16px;
              }

              .field-group {
                display: grid;
                gap: 8px;
              }

              .field-label,
              .meter-label {
                font-size: 14px;
                font-weight: 600;
                color: var(--text);
              }

              .field-input {
                width: 100%;
                min-height: 52px;
                padding: 0 14px;
                border-radius: 14px;
                border: 1px solid var(--line);
                background: rgba(2, 6, 23, 0.62);
                color: var(--text);
                font: inherit;
              }

              .field-input::placeholder {
                color: rgba(148, 163, 184, 0.68);
              }

              .field-note {
                margin: 6px 0 0;
                color: var(--muted);
                font-size: 13px;
                line-height: 1.6;
              }

              .field-input:focus-visible,
              .primary-button:focus-visible {
                outline: none;
                border-color: rgba(212, 175, 55, 0.44);
                box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.16);
              }

              .policy-list {
                display: grid;
                gap: 10px;
                margin: 0;
                padding: 0;
                list-style: none;
              }

              .policy-item {
                display: flex;
                align-items: center;
                gap: 10px;
                color: var(--muted);
                font-size: 13px;
                line-height: 1.5;
              }

              .policy-item::before {
                content: "";
                width: 10px;
                height: 10px;
                flex-shrink: 0;
                border-radius: 999px;
                border: 1px solid rgba(148, 163, 184, 0.4);
                background: transparent;
              }

              .policy-item[data-passed="true"] {
                color: #d1fae5;
              }

              .policy-item[data-passed="true"]::before {
                border-color: rgba(16, 185, 129, 0.9);
                background: rgba(16, 185, 129, 0.9);
              }

              .meter-block {
                display: grid;
                gap: 8px;
              }

              .meter-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
              }

              .meter-value {
                color: var(--muted);
                font-size: 13px;
              }

              .meter-track {
                width: 100%;
                height: 10px;
                border-radius: 999px;
                background: rgba(148, 163, 184, 0.14);
                overflow: hidden;
              }

              .meter-fill {
                display: block;
                width: 0%;
                height: 100%;
                border-radius: inherit;
                background: rgba(148, 163, 184, 0.36);
                transition: width 0.2s ease, background-color 0.2s ease;
              }

              .meter-fill[data-level="1"] {
                background: #f59e0b;
              }

              .meter-fill[data-level="2"] {
                background: #d4af37;
              }

              .meter-fill[data-level="3"] {
                background: #10b981;
              }

              .primary-button {
                width: 100%;
                min-height: 52px;
                border: none;
                border-radius: 14px;
                background: var(--accent);
                color: #111827;
                font: inherit;
                font-weight: 700;
                cursor: pointer;
                transition: opacity 0.2s ease;
              }

              .primary-button:disabled {
                opacity: 0.45;
                cursor: not-allowed;
              }

              .action-row {
                display: grid;
                gap: 10px;
              }

              .button-link {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                min-height: 48px;
                padding: 0 16px;
                border-radius: 14px;
                background: var(--accent);
                color: #111827;
                text-decoration: none;
                font-weight: 700;
              }

              .message-box {
                padding: 13px 14px;
                border-radius: 14px;
                font-size: 14px;
                line-height: 1.6;
                white-space: pre-line;
              }

              .message-box.error {
                background: rgba(239, 68, 68, 0.1);
                border: 1px solid rgba(239, 68, 68, 0.2);
                color: #fecaca;
              }

              .message-box.success {
                background: rgba(16, 185, 129, 0.1);
                border: 1px solid rgba(16, 185, 129, 0.2);
                color: #d1fae5;
              }

              .helper-note {
                margin: 16px 0 0;
                color: var(--muted);
                font-size: 14px;
                line-height: 1.6;
              }

              @media (prefers-reduced-motion: reduce) {
                *,
                *::before,
                *::after {
                  animation: none !important;
                  transition: none !important;
                  scroll-behavior: auto !important;
                }
              }
            </style>
          </head>
          <body>
            <main class="auth-shell">
              $content
            </main>
          </body>
        </html>
        """
    )
    return HTMLResponse(content=template.substitute(page_title=escape(page_title), content=content))


def _render_status_page(
    title: str,
    description: str,
    *,
    success: bool,
    action_href: str | None = None,
    action_label: str | None = None,
) -> HTMLResponse:
    seal_svg = (
        """
        <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <circle cx="24" cy="24" r="17" stroke="currentColor" stroke-width="2.4" opacity="0.34" />
          <path d="M16 24.5L21.5 30L32.5 19" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        """
        if success
        else """
        <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <circle cx="24" cy="24" r="17" stroke="currentColor" stroke-width="2.4" opacity="0.34" />
          <path d="M24 14V25" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" />
          <circle cx="24" cy="31.5" r="1.9" fill="currentColor" />
        </svg>
        """
    )
    action_button = ""
    auto_open_script = ""
    helper_note = "이 창은 닫아도 됩니다."
    if action_href and action_label:
        escaped_href = escape(action_href, quote=True)
        action_button = f'<div class="action-row"><a class="button-link" href="{escaped_href}">{escape(action_label)}</a></div>'
        helper_note = "앱이 자동으로 열리지 않으면 버튼을 눌러주세요."
        if action_href.startswith("cineentry://"):
            auto_open_script = f"""
            <script>
              setTimeout(function () {{
                window.location.href = "{escaped_href}";
              }}, 250);
            </script>
            """

    content = Template(
        """
        <section class="auth-card">
          <p class="brand-label">CineEntry</p>
          <div class="status-icon $icon_class">
            $seal_svg
          </div>
          <h1 class="page-title">$title</h1>
          <p class="page-copy">$description</p>
          $action_button
          <p class="helper-note">$helper_note</p>
          $auto_open_script
        </section>
        """
    ).substitute(
        icon_class="success" if success else "failure",
        seal_svg=seal_svg,
        title=escape(title),
        description=escape(description),
        action_button=action_button,
        helper_note=helper_note,
        auto_open_script=auto_open_script,
    )
    return _render_auth_shell(title, content)


def _render_password_reset_page(
    token: str,
    *,
    email: str | None = None,
    display_name: str | None = None,
) -> HTMLResponse:
    escaped_token = escape(token, quote=True)
    policy_items = "".join(
        [
            f'<li class="policy-item" data-rule="length" data-passed="false">{escape(PASSWORD_POLICY_REQUIREMENTS[0])}</li>',
            f'<li class="policy-item" data-rule="personal" data-passed="false">{escape(PASSWORD_POLICY_REQUIREMENTS[1])}</li>',
            f'<li class="policy-item" data-rule="pattern" data-passed="false">{escape(PASSWORD_POLICY_REQUIREMENTS[2])}</li>',
            '<li class="policy-item" data-rule="match" data-passed="false">비밀번호 확인이 일치해야 합니다.</li>',
        ]
    )
    content = Template(
        """
        <section class="auth-card">
          <p class="brand-label">CineEntry</p>
          <h1 class="page-title">새 비밀번호 설정</h1>
          <p class="page-copy">가입과 같은 보안 기준으로 새 비밀번호를 설정해주세요.</p>

          <form id="passwordResetForm" class="field-stack" novalidate>
            <input id="token" type="hidden" value="$token" />
            <div id="error" class="message-box error" role="alert" aria-live="assertive" hidden></div>

            <div class="field-group">
              <label class="field-label" for="password">새 비밀번호</label>
              <input id="password" class="field-input" type="password" autocomplete="new-password" placeholder="새 비밀번호" />
              <p class="field-note">영문, 숫자, 특수문자를 섞으면 더 안전합니다.</p>
            </div>

            <div class="field-group">
              <label class="field-label" for="confirmPassword">새 비밀번호 확인</label>
              <input id="confirmPassword" class="field-input" type="password" autocomplete="new-password" placeholder="새 비밀번호 확인" />
            </div>

            <div class="meter-block" aria-label="보안 수준">
              <div class="meter-head">
                <span class="meter-label">보안 수준</span>
                <strong id="strengthText" class="meter-value">입력 대기</strong>
              </div>
              <div class="meter-track" aria-hidden="true">
                <span id="strengthFill" class="meter-fill" data-level="0"></span>
              </div>
            </div>

            <ul class="policy-list" aria-label="비밀번호 규칙">
              $policy_items
            </ul>

            <button id="submitButton" class="primary-button" type="submit" disabled>비밀번호 변경</button>
          </form>

          <div id="successBox" class="message-box success field-stack" hidden>
            비밀번호가 변경되었습니다.
          </div>

          <div id="successActions" class="action-row" hidden>
            <a class="button-link" href="$completion_link">앱 열기</a>
          </div>

          <p class="helper-note">링크가 만료되었으면 앱에서 비밀번호 재설정을 다시 요청해주세요.</p>
        </section>

        <script>
          const form = document.getElementById("passwordResetForm");
          const tokenInput = document.getElementById("token");
          const passwordInput = document.getElementById("password");
          const confirmInput = document.getElementById("confirmPassword");
          const errorBox = document.getElementById("error");
          const successBox = document.getElementById("successBox");
          const successActions = document.getElementById("successActions");
          const submitButton = document.getElementById("submitButton");
          const strengthFill = document.getElementById("strengthFill");
          const strengthText = document.getElementById("strengthText");
          const ruleItems = {
            length: document.querySelector('[data-rule="length"]'),
            personal: document.querySelector('[data-rule="personal"]'),
            pattern: document.querySelector('[data-rule="pattern"]'),
            match: document.querySelector('[data-rule="match"]'),
          };
          const passwordPolicy = {
            minLength: $password_min_length,
            email: $email_json,
            displayName: $display_name_json,
          };

          let isSubmitting = false;

          function normalizeValue(value) {
            return Array.from((value || "").toLowerCase())
              .filter((char) => /[0-9a-zA-Z가-힣]/.test(char))
              .join("");
          }

          function hasMeaningfulFragment(value) {
            if (value.length >= 3) {
              return true;
            }
            return value.length >= 2 && Array.from(value).some((char) => char.charCodeAt(0) > 127);
          }

          function collectPersonalFragments() {
            const fragments = new Set();

            const emailLocalPart = (passwordPolicy.email || "").split("@")[0] || "";
            const normalizedEmail = normalizeValue(emailLocalPart);
            if (hasMeaningfulFragment(normalizedEmail)) {
              fragments.add(normalizedEmail);
            }

            emailLocalPart
              .toLowerCase()
              .split(/[^0-9a-zA-Z가-힣]+/)
              .filter(Boolean)
              .forEach((token) => {
                const normalizedToken = normalizeValue(token);
                if (hasMeaningfulFragment(normalizedToken)) {
                  fragments.add(normalizedToken);
                }
              });

            const normalizedDisplayName = normalizeValue(passwordPolicy.displayName || "");
            if (hasMeaningfulFragment(normalizedDisplayName)) {
              fragments.add(normalizedDisplayName);
            }

            (passwordPolicy.displayName || "")
              .toLowerCase()
              .split(/[^0-9a-zA-Z가-힣]+/)
              .filter(Boolean)
              .forEach((token) => {
                const normalizedToken = normalizeValue(token);
                if (hasMeaningfulFragment(normalizedToken)) {
                  fragments.add(normalizedToken);
                }
              });

            return Array.from(fragments);
          }

          function isRepeatedChunk(value) {
            if (value.length < 6) {
              return false;
            }

            for (let size = 1; size <= Math.floor(value.length / 2); size += 1) {
              if (value.length % size !== 0) {
                continue;
              }
              const chunk = value.slice(0, size);
              if (chunk.repeat(value.length / size) === value) {
                return true;
              }
            }

            return false;
          }

          function hasSequence(value, minRun = 5) {
            if (value.length < minRun) {
              return false;
            }

            const sources = [
              "0123456789",
              "abcdefghijklmnopqrstuvwxyz",
              "qwertyuiop",
              "asdfghjkl",
              "zxcvbnm",
            ];

            for (let start = 0; start <= value.length - minRun; start += 1) {
              const chunk = value.slice(start, start + minRun);
              if (sources.some((source) => source.includes(chunk) || source.split("").reverse().join("").includes(chunk))) {
                return true;
              }
            }

            return false;
          }

          function getCharTypeCount(value) {
            let count = 0;
            if (/[a-z]/.test(value)) count += 1;
            if (/[A-Z]/.test(value)) count += 1;
            if (/[0-9]/.test(value)) count += 1;
            if (/[^0-9A-Za-z]/.test(value)) count += 1;
            return count;
          }

          function evaluatePassword(password, confirmPassword) {
            const normalizedPassword = normalizeValue(password);
            const personalFragments = collectPersonalFragments();
            const containsPersonalInfo = normalizedPassword
              ? personalFragments.some((fragment) => normalizedPassword.includes(fragment))
              : false;
            const usesCommonPattern = normalizedPassword
              ? [
                  "123456",
                  "1234567",
                  "12345678",
                  "123456789",
                  "1234567890",
                  "12345678910",
                  "abc123",
                  "admin",
                  "admin123",
                  "asdf1234",
                  "dragon",
                  "football",
                  "iloveyou",
                  "letmein",
                  "login",
                  "master",
                  "monkey",
                  "passw0rd",
                  "password",
                  "password1",
                  "password12",
                  "password123",
                  "qwer1234",
                  "qwerty",
                  "qwerty123",
                  "qwerty12345",
                  "user1234",
                  "welcome",
                  "welcome123",
                ].includes(normalizedPassword)
                || new Set(normalizedPassword).size === 1
                || isRepeatedChunk(normalizedPassword)
                || hasSequence(normalizedPassword)
              : false;
            const meetsLength = password.length >= passwordPolicy.minLength;
            const avoidsPersonalInfo = !!password && !containsPersonalInfo;
            const avoidsCommonPattern = !!password && !usesCommonPattern;
            const confirmMatches = !!confirmPassword && password === confirmPassword;

            const errors = [];
            if (!meetsLength) {
              errors.push("비밀번호는 최소 " + passwordPolicy.minLength + "자 이상이어야 합니다.");
            }
            if (!avoidsPersonalInfo) {
              errors.push("이메일이나 닉네임이 포함된 비밀번호는 사용할 수 없습니다.");
            }
            if (!avoidsCommonPattern) {
              errors.push("12345, qwerty, 반복 문자 같은 쉬운 비밀번호는 사용할 수 없습니다.");
            }
            if (!confirmMatches) {
              errors.push("비밀번호 확인이 일치하지 않습니다.");
            }

            let score = 0;
            if (meetsLength) score += 1;
            if (password.length >= passwordPolicy.minLength + 4) score += 1;
            if (getCharTypeCount(password) >= 2) score += 1;
            if (getCharTypeCount(password) >= 3) score += 1;
            if (avoidsPersonalInfo) score += 1;
            if (avoidsCommonPattern) score += 1;

            if (!meetsLength || !avoidsPersonalInfo || !avoidsCommonPattern) {
              score = Math.min(score, 3);
            }

            let strength = { level: 0, width: "0%", label: "입력 대기" };
            if (password) {
              if (score <= 2) {
                strength = { level: 1, width: "34%", label: "낮음" };
              } else if (score <= 4) {
                strength = { level: 2, width: "68%", label: "보통" };
              } else {
                strength = { level: 3, width: "100%", label: "높음" };
              }
            }

            return {
              meetsLength,
              avoidsPersonalInfo,
              avoidsCommonPattern,
              confirmMatches,
              isValid: meetsLength && avoidsPersonalInfo && avoidsCommonPattern && confirmMatches,
              errors,
              strength,
            };
          }

          function clearError() {
            errorBox.hidden = true;
            errorBox.textContent = "";
          }

          function showError(message) {
            errorBox.textContent = message;
            errorBox.hidden = false;
          }

          function updateRule(rule, passed) {
            if (!ruleItems[rule]) {
              return;
            }
            ruleItems[rule].dataset.passed = passed ? "true" : "false";
          }

          function updateFormState() {
            const result = evaluatePassword(passwordInput.value, confirmInput.value);

            updateRule("length", result.meetsLength);
            updateRule("personal", result.avoidsPersonalInfo);
            updateRule("pattern", result.avoidsCommonPattern);
            updateRule("match", result.confirmMatches);

            strengthFill.dataset.level = String(result.strength.level);
            strengthFill.style.width = result.strength.width;
            strengthText.textContent = result.strength.label;

            submitButton.disabled = !result.isValid || isSubmitting;
            return result;
          }

          passwordInput.addEventListener("input", () => {
            clearError();
            updateFormState();
          });

          confirmInput.addEventListener("input", () => {
            clearError();
            updateFormState();
          });

          form.addEventListener("submit", async (event) => {
            event.preventDefault();

            const token = tokenInput.value;
            const password = passwordInput.value;
            const confirmPassword = confirmInput.value;
            const result = evaluatePassword(password, confirmPassword);

            if (!password || !confirmPassword) {
              showError("새 비밀번호를 모두 입력해주세요.");
              return;
            }

            if (!result.isValid) {
              showError(result.errors[0] || "비밀번호 정책을 확인해주세요.");
              return;
            }

            isSubmitting = true;
            submitButton.textContent = "변경 중...";
            updateFormState();

            try {
              const response = await fetch("/api/v1/auth/password-reset/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, new_password: password }),
              });
              const data = await response.json();

              if (!response.ok || !data.success) {
                throw new Error(data.detail || data.message || "비밀번호 변경에 실패했습니다.");
              }

              clearError();
              form.hidden = true;
              successBox.hidden = false;
              successActions.hidden = false;
              passwordInput.value = "";
              confirmInput.value = "";
            } catch (error) {
              showError(error.message || "비밀번호 변경에 실패했습니다.");
            } finally {
              isSubmitting = false;
              submitButton.textContent = "비밀번호 변경";
              updateFormState();
            }
          });

          updateFormState();
        </script>
        """
    ).substitute(
        token=escaped_token,
        password_min_length=PASSWORD_MIN_LENGTH,
        policy_items=policy_items,
        email_json=json.dumps(email or "", ensure_ascii=False),
        display_name_json=json.dumps(display_name or "", ensure_ascii=False),
        completion_link=escape("cineentry://auth/password-reset-complete", quote=True),
    )
    return _render_auth_shell("CineEntry 비밀번호 재설정", content)


# ===========================
# 이메일 인증 / 회원가입
# ===========================

@router.post("/register", response_model=BaseResponse[LoginResponse], status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    background_tasks: BackgroundTasks,
    http_request: Request,
    db: Session = Depends(get_db),
):
    """
    이메일 회원가입 또는 기존 소셜 계정에 이메일 로그인 연결
    """
    client_ip = _get_client_ip(http_request)
    await _ensure_not_rate_limited(
        "register",
        email=request.email,
        client_ip=client_ip,
        limit=settings.AUTH_REGISTER_ATTEMPT_LIMIT,
        detail="회원가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
    )
    await _record_rate_limited_attempt(
        "register",
        email=request.email,
        client_ip=client_ip,
        ttl_seconds=settings.AUTH_REGISTER_ATTEMPT_WINDOW_SECONDS,
    )

    _validate_password_or_raise(
        request.password,
        email=request.email,
        display_name=request.display_name,
    )

    existing_user = db.query(User).filter(User.email == request.email).first()
    created_user = False
    should_send_verification = False

    if existing_user:
        if existing_user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이미 이메일 로그인이 연결된 계정입니다. 로그인해주세요.",
            )

        existing_user.password_hash = hash_password(request.password)
        existing_user.auth_provider = "email"
        if not existing_user.display_name:
            existing_user.display_name = request.display_name

        should_send_verification = not existing_user.email_verified
        user = existing_user
    else:
        user = User(
            email=request.email,
            password_hash=hash_password(request.password),
            display_name=request.display_name,
            auth_provider="email",
            google_connected=False,
            kakao_connected=False,
            email_verified=False,
            token_version=0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        created_user = True
        should_send_verification = True

        try:
            auto_collection_service.create_default_collections(str(user.id), db)
        except Exception:
            pass

    if not created_user:
        db.commit()
        db.refresh(user)

    if should_send_verification:
        await _queue_verification_email(background_tasks, user)

    tokens = create_tokens(user.id, user.token_version)

    if created_user:
        message = "회원가입이 완료되었습니다. 인증 메일을 확인해주세요."
    elif should_send_verification:
        message = "이메일 로그인이 연결되었습니다. 인증 메일을 확인해주세요."
    else:
        message = "이메일 로그인이 연결되었습니다."

    return BaseResponse(
        success=True,
        message=message,
        data=LoginResponse(
            user=_build_auth_user_response(user),
            tokens=TokenResponse(**tokens),
        ),
    )


@router.post("/email/verification/resend", response_model=BaseResponse[dict])
async def resend_email_verification(
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다.",
        )

    if user.email_verified:
        return BaseResponse(
            success=True,
            message="이미 인증된 이메일입니다.",
            data={"sent": False, "email_verified": True},
        )

    if await auth_flow_service.has_cooldown("verify-email", user.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="방금 인증 메일을 보냈습니다. 잠시 후 다시 시도해주세요.",
        )

    await auth_flow_service.set_cooldown(
        "verify-email",
        user.email,
        settings.AUTH_EMAIL_COOLDOWN_SECONDS,
    )
    await _queue_verification_email(background_tasks, user)

    return BaseResponse(
        success=True,
        message="인증 메일을 다시 보냈습니다.",
        data={"sent": True},
    )


@router.get("/email/verify", response_class=HTMLResponse)
async def verify_email(
    token: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    payload = await auth_flow_service.consume_email_verification_token(token)
    if not payload:
        return _render_status_page(
            "인증 링크가 유효하지 않습니다.",
            "링크가 만료되었거나 이미 사용되었습니다. 앱에서 인증 메일을 다시 요청해주세요.",
            success=False,
            action_href="cineentry://auth/email/verified",
            action_label="앱으로 돌아가기",
        )

    user = (
        db.query(User)
        .filter(User.id == payload["user_id"], User.email == payload["email"])
        .first()
    )
    if not user:
        return _render_status_page(
            "계정을 찾을 수 없습니다.",
            "이미 삭제된 계정이거나 유효하지 않은 인증 요청입니다.",
            success=False,
        )

    user.email_verified = True
    db.commit()

    return _render_status_page(
        "이메일 인증이 완료되었습니다.",
        "이제 이메일 로그인과 비밀번호 재설정을 안전하게 사용할 수 있습니다.",
        success=True,
        action_href="cineentry://auth/email/verified",
        action_label="앱으로 돌아가기",
    )


# ===========================
# 로그인 / 토큰
# ===========================

@router.post("/login", response_model=BaseResponse[LoginResponse])
async def login(
    request: LoginRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    client_ip = _get_client_ip(http_request)
    await _ensure_not_rate_limited(
        "login",
        email=request.email,
        client_ip=client_ip,
        limit=settings.AUTH_LOGIN_ATTEMPT_LIMIT,
        detail="로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
    )

    user = db.query(User).filter(User.email == request.email).first()

    if not user:
        await _record_rate_limited_attempt(
            "login",
            email=request.email,
            client_ip=client_ip,
            ttl_seconds=settings.AUTH_LOGIN_ATTEMPT_WINDOW_SECONDS,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )

    if not user.password_hash:
        await _record_rate_limited_attempt(
            "login",
            email=request.email,
            client_ip=client_ip,
            ttl_seconds=settings.AUTH_LOGIN_ATTEMPT_WINDOW_SECONDS,
        )
        social_methods = [_provider_label(method) for method in user.auth_methods if method != "email"]
        if social_methods:
            social_login_help = " 또는 ".join(social_methods)
            detail = f"이 계정은 비밀번호 로그인이 설정되지 않았습니다. {social_login_help}로 로그인하거나 비밀번호 재설정을 진행해주세요."
        else:
            detail = "비밀번호가 설정되지 않은 계정입니다. 비밀번호 재설정을 진행해주세요."
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )

    if not verify_password(request.password, user.password_hash):
        await _record_rate_limited_attempt(
            "login",
            email=request.email,
            client_ip=client_ip,
            ttl_seconds=settings.AUTH_LOGIN_ATTEMPT_WINDOW_SECONDS,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )

    _ensure_email_verified_or_raise(user)

    await _clear_rate_limited_attempts(
        "login",
        email=request.email,
        client_ip=client_ip,
    )

    user.auth_provider = "email"
    db.commit()
    db.refresh(user)

    tokens = create_tokens(user.id, user.token_version)

    return BaseResponse(
        success=True,
        message="로그인 성공",
        data=LoginResponse(
            user=_build_auth_user_response(user),
            tokens=TokenResponse(**tokens),
        ),
    )


@router.post("/refresh", response_model=BaseResponse[TokenResponse])
async def refresh_token(
    request: RefreshRequest,
    db: Session = Depends(get_db),
):
    token_data = verify_refresh_token(request.refresh_token)

    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 토큰입니다.",
        )

    user = db.query(User).filter(User.id == token_data["user_id"]).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용자를 찾을 수 없습니다.",
        )

    if user.token_version != token_data["token_version"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="세션이 만료되었습니다. 다시 로그인해주세요.",
        )

    tokens = create_tokens(user.id, user.token_version)

    return BaseResponse(
        success=True,
        message="토큰이 갱신되었습니다.",
        data=TokenResponse(**tokens),
    )


@router.post("/logout", response_model=BaseResponse[dict])
async def logout():
    return BaseResponse(
        success=True,
        message="로그아웃되었습니다.",
        data={"logged_out": True},
    )


@router.post("/change-password", response_model=BaseResponse[dict])
async def change_password(
    request: ChangePasswordRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다.",
        )

    if not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="비밀번호가 설정되지 않은 계정입니다. 비밀번호 재설정 메일로 비밀번호를 먼저 설정해주세요.",
        )

    _ensure_email_verified_or_raise(user)

    if not verify_password(request.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="현재 비밀번호가 올바르지 않습니다.",
        )

    if verify_password(request.new_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="현재 비밀번호와 동일한 비밀번호는 사용할 수 없습니다.",
        )

    _validate_password_or_raise(
        request.new_password,
        email=user.email,
        display_name=user.display_name,
    )

    user.password_hash = hash_password(request.new_password)
    user.auth_provider = "email"
    user.token_version += 1

    db.commit()

    return BaseResponse(
        success=True,
        message="비밀번호가 변경되었습니다. 다시 로그인해주세요.",
        data={"password_changed": True},
    )


# ===========================
# 비밀번호 재설정
# ===========================

@router.post("/password-reset/request", response_model=BaseResponse[dict])
async def request_password_reset(
    request: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == request.email).first()

    if user and not await auth_flow_service.has_cooldown("password-reset", user.email):
        await auth_flow_service.set_cooldown(
            "password-reset",
            user.email,
            settings.AUTH_EMAIL_COOLDOWN_SECONDS,
        )
        await _queue_password_reset_email(background_tasks, user)

    return BaseResponse(
        success=True,
        message="입력한 이메일로 재설정 안내가 필요하면 메일을 보냈습니다. 메일이 보이지 않으면 스팸함을 확인해주세요.",
        data={"sent": True},
    )


@router.post("/password-reset/confirm", response_model=BaseResponse[dict])
async def confirm_password_reset(
    request: PasswordResetConfirmRequest,
    db: Session = Depends(get_db),
):
    payload = await auth_flow_service.consume_password_reset_token(request.token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효하지 않거나 만료된 재설정 링크입니다.",
        )

    user = (
        db.query(User)
        .filter(User.id == payload["user_id"], User.email == payload["email"])
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다.",
        )

    if user.password_hash and verify_password(request.new_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="기존과 동일한 비밀번호는 사용할 수 없습니다.",
        )

    _validate_password_or_raise(
        request.new_password,
        email=user.email,
        display_name=user.display_name,
    )

    user.password_hash = hash_password(request.new_password)
    user.auth_provider = "email"
    user.email_verified = True
    user.token_version += 1
    db.commit()

    return BaseResponse(
        success=True,
        message="비밀번호가 변경되었습니다.",
        data={"password_reset": True},
    )


@router.get("/password-reset", response_class=HTMLResponse)
async def password_reset_page(
    token: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    payload = await auth_flow_service.peek_password_reset_token(token)
    if not payload:
        return _render_status_page(
            "재설정 링크가 유효하지 않습니다.",
            "링크가 만료되었거나 이미 사용되었습니다. 앱에서 비밀번호 재설정을 다시 요청해주세요.",
            success=False,
            action_href="cineentry://auth/password-reset-complete",
            action_label="앱으로 돌아가기",
        )

    user = (
        db.query(User)
        .filter(User.id == payload["user_id"], User.email == payload["email"])
        .first()
    )

    if not user:
        return _render_status_page(
            "계정을 찾을 수 없습니다.",
            "이미 삭제된 계정이거나 유효하지 않은 재설정 요청입니다.",
            success=False,
            action_href="cineentry://auth/password-reset-complete",
            action_label="앱으로 돌아가기",
        )

    return _render_password_reset_page(
        token,
        email=user.email,
        display_name=user.display_name,
    )


# ===========================
# Google OAuth
# ===========================

@router.get("/google", response_model=BaseResponse[OAuthUrlResponse])
async def google_auth_start(client: str = Query("web")):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google 로그인이 설정되지 않았습니다.",
        )

    oauth_client = _normalize_oauth_client(client)
    state = secrets.token_urlsafe(32)
    _store_oauth_state(state, "google", oauth_client)
    redirect_uri = _get_oauth_redirect_uri("google", oauth_client)

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }

    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"

    return BaseResponse(
        success=True,
        message="Google 인증 URL",
        data=OAuthUrlResponse(url=url, state=state),
    )


@router.get("/google/mobile/callback", response_class=HTMLResponse)
async def google_mobile_callback_bridge(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
):
    return _render_mobile_oauth_bridge_page(
        "google",
        code=code,
        state=state,
        error=error,
        error_description=error_description,
    )


@router.post("/google/callback", response_model=BaseResponse[LoginResponse])
async def google_auth_callback(
    request: OAuthCallbackRequest,
    db: Session = Depends(get_db),
):
    oauth_client = _consume_oauth_state(request.state, "google")
    redirect_uri = _get_oauth_redirect_uri("google", oauth_client)

    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": request.code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )

        if token_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google 토큰 교환 실패",
            )

        token_data = token_response.json()

        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )

        if userinfo_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google 사용자 정보 조회 실패",
            )

        userinfo = userinfo_response.json()

    email = userinfo.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이메일 정보를 가져올 수 없습니다.",
        )

    user = db.query(User).filter(User.email == email).first()

    if user:
        user.google_connected = True
        user.email_verified = True
        if not user.display_name:
            user.display_name = userinfo.get("name", email.split("@")[0])
        if not user.avatar_url:
            user.avatar_url = userinfo.get("picture")
        if not user.password_hash and user.auth_provider not in {"google", "kakao"}:
            user.auth_provider = "google"
        db.commit()
        db.refresh(user)
    else:
        user = User(
            email=email,
            display_name=userinfo.get("name", email.split("@")[0]),
            avatar_url=userinfo.get("picture"),
            auth_provider="google",
            google_connected=True,
            kakao_connected=False,
            email_verified=True,
            token_version=0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        try:
            auto_collection_service.create_default_collections(str(user.id), db)
        except Exception:
            pass

    tokens = create_tokens(user.id, user.token_version)

    return BaseResponse(
        success=True,
        message="Google 로그인 성공",
        data=LoginResponse(
            user=_build_auth_user_response(user),
            tokens=TokenResponse(**tokens),
        ),
    )


# ===========================
# Kakao OAuth
# ===========================

@router.get("/kakao", response_model=BaseResponse[OAuthUrlResponse])
async def kakao_auth_start(client: str = Query("web")):
    if not settings.KAKAO_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Kakao 로그인이 설정되지 않았습니다.",
        )

    oauth_client = _normalize_oauth_client(client)
    state = secrets.token_urlsafe(32)
    _store_oauth_state(state, "kakao", oauth_client)
    redirect_uri = _get_oauth_redirect_uri("kakao", oauth_client)

    params = {
        "client_id": settings.KAKAO_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
    }

    url = f"https://kauth.kakao.com/oauth/authorize?{urlencode(params)}"

    return BaseResponse(
        success=True,
        message="Kakao 인증 URL",
        data=OAuthUrlResponse(url=url, state=state),
    )


@router.get("/kakao/mobile/callback", response_class=HTMLResponse)
async def kakao_mobile_callback_bridge(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
):
    return _render_mobile_oauth_bridge_page(
        "kakao",
        code=code,
        state=state,
        error=error,
        error_description=error_description,
    )


@router.post("/kakao/callback", response_model=BaseResponse[LoginResponse])
async def kakao_auth_callback(
    request: OAuthCallbackRequest,
    db: Session = Depends(get_db),
):
    oauth_client = _consume_oauth_state(request.state, "kakao")
    redirect_uri = _get_oauth_redirect_uri("kakao", oauth_client)

    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://kauth.kakao.com/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": settings.KAKAO_CLIENT_ID,
                "client_secret": settings.KAKAO_CLIENT_SECRET or "",
                "redirect_uri": redirect_uri,
                "code": request.code,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        if token_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Kakao 토큰 교환 실패",
            )

        token_data = token_response.json()

        userinfo_response = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )

        if userinfo_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Kakao 사용자 정보 조회 실패",
            )

        userinfo = userinfo_response.json()

    kakao_account = userinfo.get("kakao_account", {})
    email = kakao_account.get("email")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이메일 정보를 가져올 수 없습니다. Kakao 계정에서 이메일 제공에 동의해주세요.",
        )

    profile = kakao_account.get("profile", {})
    user = db.query(User).filter(User.email == email).first()

    if user:
        user.kakao_connected = True
        user.email_verified = True
        if not user.display_name:
            user.display_name = profile.get("nickname", email.split("@")[0])
        if not user.avatar_url:
            user.avatar_url = profile.get("profile_image_url")
        if not user.password_hash and user.auth_provider not in {"google", "kakao"}:
            user.auth_provider = "kakao"
        db.commit()
        db.refresh(user)
    else:
        user = User(
            email=email,
            display_name=profile.get("nickname", email.split("@")[0]),
            avatar_url=profile.get("profile_image_url"),
            auth_provider="kakao",
            google_connected=False,
            kakao_connected=True,
            email_verified=True,
            token_version=0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        try:
            auto_collection_service.create_default_collections(str(user.id), db)
        except Exception:
            pass

    tokens = create_tokens(user.id, user.token_version)

    return BaseResponse(
        success=True,
        message="Kakao 로그인 성공",
        data=LoginResponse(
            user=_build_auth_user_response(user),
            tokens=TokenResponse(**tokens),
        ),
    )


# ===========================
# 현재 사용자 정보
# ===========================

@router.get("/me", response_model=BaseResponse[AuthUserResponse])
async def get_current_user(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다.",
        )

    return BaseResponse(
        success=True,
        message="사용자 정보 조회 성공",
        data=_build_auth_user_response(user),
    )
