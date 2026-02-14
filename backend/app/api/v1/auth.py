"""
Authentication API endpoints
이메일/OAuth 로그인, 회원가입, 토큰 갱신
"""
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import httpx

from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    RefreshRequest,
    ChangePasswordRequest,
    OAuthCallbackRequest,
    TokenResponse,
    LoginResponse,
    AuthUserResponse,
    OAuthUrlResponse,
)
from app.schemas.common import BaseResponse
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_tokens,
    verify_refresh_token,
)
from app.middleware.auth_middleware import get_current_user_id
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

# OAuth state 임시 저장 (프로덕션에서는 Redis 사용 권장)
_oauth_states: dict[str, str] = {}


# ===========================
# 이메일 인증
# ===========================

@router.post("/register", response_model=BaseResponse[LoginResponse], status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    db: Session = Depends(get_db)
):
    """
    이메일 회원가입

    - 이메일 중복 확인
    - 비밀번호 해싱 후 저장
    - 자동 로그인 (토큰 발급)
    """
    # 이메일 중복 확인
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 이메일입니다."
        )

    # 새 사용자 생성
    new_user = User(
        email=request.email,
        password_hash=hash_password(request.password),
        display_name=request.display_name,
        auth_provider="email",
        email_verified=False,  # TODO: 이메일 인증 구현 시 False로 시작
        token_version=0,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # 토큰 발급
    tokens = create_tokens(new_user.id, new_user.token_version)

    return BaseResponse(
        success=True,
        message="회원가입이 완료되었습니다.",
        data=LoginResponse(
            user=AuthUserResponse(
                id=str(new_user.id),
                email=new_user.email,
                display_name=new_user.display_name,
                avatar_url=new_user.avatar_url,
                auth_provider=new_user.auth_provider,
                email_verified=new_user.email_verified,
            ),
            tokens=TokenResponse(**tokens),
        )
    )


@router.post("/login", response_model=BaseResponse[LoginResponse])
async def login(
    request: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    이메일 로그인

    - 이메일/비밀번호 검증
    - Access Token + Refresh Token 발급
    """
    # 사용자 조회
    user = db.query(User).filter(User.email == request.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다."
        )

    # OAuth 사용자인 경우
    if user.auth_provider != "email":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{user.auth_provider} 계정으로 가입된 사용자입니다. 해당 방식으로 로그인해주세요."
        )

    # 비밀번호 해시가 없는 레거시 계정 가드
    if not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="비밀번호가 설정되지 않은 계정입니다. 다시 회원가입하거나 비밀번호 재설정을 진행해주세요."
        )

    # 비밀번호 검증
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다."
        )

    # 토큰 발급
    tokens = create_tokens(user.id, user.token_version)

    return BaseResponse(
        success=True,
        message="로그인 성공",
        data=LoginResponse(
            user=AuthUserResponse(
                id=str(user.id),
                email=user.email,
                display_name=user.display_name,
                avatar_url=user.avatar_url,
                auth_provider=user.auth_provider,
                email_verified=user.email_verified,
            ),
            tokens=TokenResponse(**tokens),
        )
    )


@router.post("/refresh", response_model=BaseResponse[TokenResponse])
async def refresh_token(
    request: RefreshRequest,
    db: Session = Depends(get_db)
):
    """
    토큰 갱신

    - Refresh Token 검증
    - token_version 확인 (강제 로그아웃 체크)
    - 새로운 Access Token + Refresh Token 발급
    """
    # Refresh Token 검증
    token_data = verify_refresh_token(request.refresh_token)

    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 토큰입니다."
        )

    # 사용자 조회
    user = db.query(User).filter(User.id == token_data["user_id"]).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용자를 찾을 수 없습니다."
        )

    # token_version 확인 (강제 로그아웃 체크)
    if user.token_version != token_data["token_version"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="세션이 만료되었습니다. 다시 로그인해주세요."
        )

    # 새 토큰 발급
    tokens = create_tokens(user.id, user.token_version)

    return BaseResponse(
        success=True,
        message="토큰이 갱신되었습니다.",
        data=TokenResponse(**tokens)
    )


@router.post("/logout", response_model=BaseResponse[dict])
async def logout():
    """
    로그아웃

    - Stateless 방식: 클라이언트에서 토큰 삭제
    - 서버에서는 별도 처리 없음
    """
    return BaseResponse(
        success=True,
        message="로그아웃되었습니다.",
        data={"logged_out": True}
    )


@router.post("/change-password", response_model=BaseResponse[dict])
async def change_password(
    request: ChangePasswordRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    비밀번호 변경

    - 현재 비밀번호 확인
    - 새 비밀번호로 변경
    - token_version 증가 (기존 세션 무효화)
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )

    # OAuth 사용자는 비밀번호 변경 불가
    if user.auth_provider != "email":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="소셜 로그인 사용자는 비밀번호를 변경할 수 없습니다."
        )

    # 현재 비밀번호 확인
    if not verify_password(request.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="현재 비밀번호가 올바르지 않습니다."
        )

    # 비밀번호 변경 및 token_version 증가
    user.password_hash = hash_password(request.new_password)
    user.token_version += 1

    db.commit()

    return BaseResponse(
        success=True,
        message="비밀번호가 변경되었습니다. 다시 로그인해주세요.",
        data={"password_changed": True}
    )


# ===========================
# Google OAuth
# ===========================

@router.get("/google", response_model=BaseResponse[OAuthUrlResponse])
async def google_auth_start():
    """
    Google OAuth 시작

    - 인증 URL과 state 반환
    - 프론트엔드에서 이 URL로 리다이렉트
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google 로그인이 설정되지 않았습니다."
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
        data=OAuthUrlResponse(url=url, state=state)
    )


@router.post("/google/callback", response_model=BaseResponse[LoginResponse])
async def google_auth_callback(
    request: OAuthCallbackRequest,
    db: Session = Depends(get_db)
):
    """
    Google OAuth 콜백

    - Authorization code로 토큰 교환
    - 사용자 정보 조회
    - 기존 사용자면 로그인, 신규면 회원가입
    """
    # State 검증
    if request.state and request.state not in _oauth_states:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효하지 않은 state입니다."
        )

    if request.state:
        del _oauth_states[request.state]

    # Authorization code로 토큰 교환
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": request.code,
                "grant_type": "authorization_code",
                "redirect_uri": f"{settings.FRONTEND_URL}/auth/google/callback",
            }
        )

        if token_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google 토큰 교환 실패"
            )

        token_data = token_response.json()

        # 사용자 정보 조회
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"}
        )

        if userinfo_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google 사용자 정보 조회 실패"
            )

        userinfo = userinfo_response.json()

    # 사용자 처리
    email = userinfo.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이메일 정보를 가져올 수 없습니다."
        )

    user = db.query(User).filter(User.email == email).first()

    if user:
        # 기존 사용자
        if user.auth_provider != "google" and user.auth_provider != "email":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"이미 {user.auth_provider} 계정으로 가입된 이메일입니다."
            )
        # 이메일 사용자가 Google로 로그인하면 provider 업데이트
        if user.auth_provider == "email":
            user.auth_provider = "google"
            user.email_verified = True
            db.commit()
    else:
        # 신규 사용자 생성
        user = User(
            email=email,
            display_name=userinfo.get("name", email.split("@")[0]),
            avatar_url=userinfo.get("picture"),
            auth_provider="google",
            email_verified=True,
            token_version=0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # 토큰 발급
    tokens = create_tokens(user.id, user.token_version)

    return BaseResponse(
        success=True,
        message="Google 로그인 성공",
        data=LoginResponse(
            user=AuthUserResponse(
                id=str(user.id),
                email=user.email,
                display_name=user.display_name,
                avatar_url=user.avatar_url,
                auth_provider=user.auth_provider,
                email_verified=user.email_verified,
            ),
            tokens=TokenResponse(**tokens),
        )
    )


# ===========================
# Kakao OAuth
# ===========================

@router.get("/kakao", response_model=BaseResponse[OAuthUrlResponse])
async def kakao_auth_start():
    """
    Kakao OAuth 시작

    - 인증 URL과 state 반환
    """
    if not settings.KAKAO_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Kakao 로그인이 설정되지 않았습니다."
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
        data=OAuthUrlResponse(url=url, state=state)
    )


@router.post("/kakao/callback", response_model=BaseResponse[LoginResponse])
async def kakao_auth_callback(
    request: OAuthCallbackRequest,
    db: Session = Depends(get_db)
):
    """
    Kakao OAuth 콜백

    - Authorization code로 토큰 교환
    - 사용자 정보 조회
    - 기존 사용자면 로그인, 신규면 회원가입
    """
    # State 검증
    if request.state and request.state not in _oauth_states:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효하지 않은 state입니다."
        )

    if request.state:
        del _oauth_states[request.state]

    # Authorization code로 토큰 교환
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
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

        if token_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Kakao 토큰 교환 실패"
            )

        token_data = token_response.json()

        # 사용자 정보 조회
        userinfo_response = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {token_data['access_token']}"}
        )

        if userinfo_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Kakao 사용자 정보 조회 실패"
            )

        userinfo = userinfo_response.json()

    # 사용자 처리
    kakao_account = userinfo.get("kakao_account", {})
    email = kakao_account.get("email")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이메일 정보를 가져올 수 없습니다. Kakao 계정에서 이메일 제공에 동의해주세요."
        )

    profile = kakao_account.get("profile", {})

    user = db.query(User).filter(User.email == email).first()

    if user:
        # 기존 사용자
        if user.auth_provider != "kakao" and user.auth_provider != "email":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"이미 {user.auth_provider} 계정으로 가입된 이메일입니다."
            )
        # 이메일 사용자가 Kakao로 로그인하면 provider 업데이트
        if user.auth_provider == "email":
            user.auth_provider = "kakao"
            user.email_verified = True
            db.commit()
    else:
        # 신규 사용자 생성
        user = User(
            email=email,
            display_name=profile.get("nickname", email.split("@")[0]),
            avatar_url=profile.get("profile_image_url"),
            auth_provider="kakao",
            email_verified=True,
            token_version=0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # 토큰 발급
    tokens = create_tokens(user.id, user.token_version)

    return BaseResponse(
        success=True,
        message="Kakao 로그인 성공",
        data=LoginResponse(
            user=AuthUserResponse(
                id=str(user.id),
                email=user.email,
                display_name=user.display_name,
                avatar_url=user.avatar_url,
                auth_provider=user.auth_provider,
                email_verified=user.email_verified,
            ),
            tokens=TokenResponse(**tokens),
        )
    )


# ===========================
# 현재 사용자 정보
# ===========================

@router.get("/me", response_model=BaseResponse[AuthUserResponse])
async def get_current_user(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """
    현재 로그인한 사용자 정보 조회
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )

    return BaseResponse(
        success=True,
        message="사용자 정보 조회 성공",
        data=AuthUserResponse(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            auth_provider=user.auth_provider,
            email_verified=user.email_verified,
        )
    )
