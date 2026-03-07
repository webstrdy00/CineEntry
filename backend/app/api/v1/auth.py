"""
Authentication API endpoints
이메일/OAuth 로그인, 회원가입, 이메일 인증, 비밀번호 재설정, 토큰 갱신
"""
import secrets
from html import escape
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
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
from app.services.response_serializers import serialize_auth_user

router = APIRouter(prefix="/auth", tags=["auth"])

# OAuth state 임시 저장 (프로덕션에서는 Redis 사용 권장)
_oauth_states: dict[str, str] = {}


def _consume_oauth_state(state: str | None, provider: str) -> None:
    """
    OAuth state 1회용 검증/소비.

    - state 누락 차단
    - provider 불일치 차단 (google state를 kakao에 재사용 방지)
    - 재사용 차단(pop)
    """
    if not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="state 값이 필요합니다.",
        )

    saved_provider = _oauth_states.pop(state, None)
    if saved_provider != provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효하지 않은 state입니다.",
        )


def _provider_label(provider: str) -> str:
    labels = {
        "email": "이메일",
        "google": "Google",
        "kakao": "Kakao",
    }
    return labels.get(provider, provider)


def _build_auth_user_response(user: User) -> AuthUserResponse:
    return serialize_auth_user(user)


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


def _render_status_page(
    title: str,
    description: str,
    *,
    success: bool,
    action_href: str | None = None,
    action_label: str | None = None,
) -> HTMLResponse:
    accent = "#d4af37" if success else "#e74c3c"
    button = ""
    if action_href and action_label:
        button = (
            f'<a href="{escape(action_href, quote=True)}" '
            f'style="display:inline-block;padding:14px 20px;border-radius:12px;'
            f'background:{accent};color:#111827;text-decoration:none;font-weight:bold;">'
            f'{escape(action_label)}</a>'
        )

    html = f"""
    <!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{escape(title)}</title>
      </head>
      <body style="margin:0;background:#111827;color:#f9fafb;font-family:Arial,sans-serif;">
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;">
          <div style="width:100%;max-width:560px;background:#1f2937;border-radius:24px;padding:32px;box-sizing:border-box;">
            <p style="margin:0 0 12px;color:{accent};font-size:13px;font-weight:bold;letter-spacing:0.08em;">CINEENTRY</p>
            <h1 style="margin:0 0 16px;font-size:30px;line-height:1.25;">{escape(title)}</h1>
            <p style="margin:0 0 24px;line-height:1.7;color:#d1d5db;">{escape(description)}</p>
            {button}
            <p style="margin:24px 0 0;color:#9ca3af;line-height:1.6;">앱이 자동으로 열리지 않으면 직접 CineEntry를 열어 상태를 확인해주세요.</p>
          </div>
        </div>
      </body>
    </html>
    """
    return HTMLResponse(content=html)


def _render_password_reset_page(token: str) -> HTMLResponse:
    escaped_token = escape(token, quote=True)
    html = f"""
    <!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>CineEntry 비밀번호 재설정</title>
      </head>
      <body style="margin:0;background:#111827;color:#f9fafb;font-family:Arial,sans-serif;">
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;">
          <div style="width:100%;max-width:560px;background:#1f2937;border-radius:24px;padding:32px;box-sizing:border-box;">
            <p style="margin:0 0 12px;color:#d4af37;font-size:13px;font-weight:bold;letter-spacing:0.08em;">CINEENTRY</p>
            <h1 style="margin:0 0 16px;font-size:30px;line-height:1.25;">비밀번호 재설정</h1>
            <p style="margin:0 0 24px;line-height:1.7;color:#d1d5db;">새 비밀번호를 입력해주세요. 완료 후 기존 세션은 다시 로그인해야 할 수 있습니다.</p>

            <div id="error" style="display:none;margin-bottom:16px;padding:14px 16px;border-radius:12px;background:rgba(231,76,60,0.14);color:#fecaca;"></div>
            <div id="success" style="display:none;margin-bottom:16px;padding:14px 16px;border-radius:12px;background:rgba(212,175,55,0.14);color:#fef3c7;"></div>

            <input id="token" type="hidden" value="{escaped_token}" />
            <label for="password" style="display:block;margin-bottom:8px;color:#d1d5db;font-size:14px;">새 비밀번호</label>
            <input id="password" type="password" autocomplete="new-password" style="width:100%;box-sizing:border-box;margin-bottom:16px;padding:16px;border-radius:12px;border:1px solid #374151;background:#111827;color:#f9fafb;font-size:16px;" />

            <label for="confirmPassword" style="display:block;margin-bottom:8px;color:#d1d5db;font-size:14px;">새 비밀번호 확인</label>
            <input id="confirmPassword" type="password" autocomplete="new-password" style="width:100%;box-sizing:border-box;margin-bottom:20px;padding:16px;border-radius:12px;border:1px solid #374151;background:#111827;color:#f9fafb;font-size:16px;" />

            <button id="submitButton" type="button" style="width:100%;padding:16px;border:none;border-radius:12px;background:#d4af37;color:#111827;font-size:16px;font-weight:bold;cursor:pointer;">
              비밀번호 변경
            </button>

            <p style="margin:20px 0 0;color:#9ca3af;line-height:1.6;">링크가 만료되었으면 앱에서 비밀번호 재설정 메일을 다시 요청해주세요.</p>
          </div>
        </div>

        <script>
          const errorBox = document.getElementById('error');
          const successBox = document.getElementById('success');
          const submitButton = document.getElementById('submitButton');

          function showError(message) {{
            errorBox.textContent = message;
            errorBox.style.display = 'block';
            successBox.style.display = 'none';
          }}

          function showSuccess(message) {{
            successBox.innerHTML = message;
            successBox.style.display = 'block';
            errorBox.style.display = 'none';
          }}

          submitButton.addEventListener('click', async () => {{
            const token = document.getElementById('token').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (!password || !confirmPassword) {{
              showError('새 비밀번호를 모두 입력해주세요.');
              return;
            }}

            if (password.length < 6) {{
              showError('비밀번호는 최소 6자 이상이어야 합니다.');
              return;
            }}

            if (password !== confirmPassword) {{
              showError('비밀번호 확인이 일치하지 않습니다.');
              return;
            }}

            submitButton.disabled = true;
            submitButton.textContent = '변경 중...';

            try {{
              const response = await fetch('/api/v1/auth/password-reset/confirm', {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify({{ token, new_password: password }}),
              }});
              const data = await response.json();

              if (!response.ok || !data.success) {{
                throw new Error(data.detail || data.message || '비밀번호 변경에 실패했습니다.');
              }}

              showSuccess('비밀번호가 변경되었습니다. <a href="cineentry://auth/password-reset-complete" style="color:#d4af37;">앱으로 돌아가기</a>');
              document.getElementById('password').value = '';
              document.getElementById('confirmPassword').value = '';
            }} catch (error) {{
              showError(error.message || '비밀번호 변경에 실패했습니다.');
            }} finally {{
              submitButton.disabled = false;
              submitButton.textContent = '비밀번호 변경';
            }}
          }});
        </script>
      </body>
    </html>
    """
    return HTMLResponse(content=html)


# ===========================
# 이메일 인증 / 회원가입
# ===========================

@router.post("/register", response_model=BaseResponse[LoginResponse], status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    이메일 회원가입 또는 기존 소셜 계정에 이메일 로그인 연결
    """
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
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == request.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )

    if not user.password_hash:
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
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

    if not verify_password(request.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="현재 비밀번호가 올바르지 않습니다.",
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
async def password_reset_page(token: str = Query(..., min_length=1)):
    payload = await auth_flow_service.peek_password_reset_token(token)
    if not payload:
        return _render_status_page(
            "재설정 링크가 유효하지 않습니다.",
            "링크가 만료되었거나 이미 사용되었습니다. 앱에서 비밀번호 재설정을 다시 요청해주세요.",
            success=False,
            action_href="cineentry://auth/password-reset-complete",
            action_label="앱으로 돌아가기",
        )

    return _render_password_reset_page(token)


# ===========================
# Google OAuth
# ===========================

@router.get("/google", response_model=BaseResponse[OAuthUrlResponse])
async def google_auth_start():
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google 로그인이 설정되지 않았습니다.",
        )

    state = secrets.token_urlsafe(32)
    _oauth_states[state] = "google"

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": f"{settings.FRONTEND_URL}/auth/google/callback",
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


@router.post("/google/callback", response_model=BaseResponse[LoginResponse])
async def google_auth_callback(
    request: OAuthCallbackRequest,
    db: Session = Depends(get_db),
):
    _consume_oauth_state(request.state, "google")

    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": request.code,
                "grant_type": "authorization_code",
                "redirect_uri": f"{settings.FRONTEND_URL}/auth/google/callback",
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
async def kakao_auth_start():
    if not settings.KAKAO_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Kakao 로그인이 설정되지 않았습니다.",
        )

    state = secrets.token_urlsafe(32)
    _oauth_states[state] = "kakao"

    params = {
        "client_id": settings.KAKAO_CLIENT_ID,
        "redirect_uri": f"{settings.FRONTEND_URL}/auth/kakao/callback",
        "response_type": "code",
        "state": state,
    }

    url = f"https://kauth.kakao.com/oauth/authorize?{urlencode(params)}"

    return BaseResponse(
        success=True,
        message="Kakao 인증 URL",
        data=OAuthUrlResponse(url=url, state=state),
    )


@router.post("/kakao/callback", response_model=BaseResponse[LoginResponse])
async def kakao_auth_callback(
    request: OAuthCallbackRequest,
    db: Session = Depends(get_db),
):
    _consume_oauth_state(request.state, "kakao")

    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://kauth.kakao.com/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": settings.KAKAO_CLIENT_ID,
                "client_secret": settings.KAKAO_CLIENT_SECRET or "",
                "redirect_uri": f"{settings.FRONTEND_URL}/auth/kakao/callback",
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
