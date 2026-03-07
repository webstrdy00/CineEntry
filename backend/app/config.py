import secrets
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    Application settings with environment variables
    """

    # Application
    APP_NAME: str = "CineEntry API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    FRONTEND_URL: str = "http://localhost:8081"  # 프론트엔드 URL (OAuth 콜백용)
    BACKEND_PUBLIC_URL: str = "http://localhost:8000"  # 이메일 인증/재설정 링크용
    CORS_ALLOWED_ORIGINS: Optional[str] = None

    # Database (Independent PostgreSQL)
    DATABASE_URL: str

    # Redis (for caching)
    REDIS_URL: str = "redis://localhost:6379"

    # JWT Settings (자체 인증)
    JWT_SECRET_KEY: Optional[str] = None  # 없으면 자동 생성 (개발용)
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30  # Access Token 만료: 30분
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30  # Refresh Token 만료: 30일
    EMAIL_VERIFICATION_TOKEN_TTL_HOURS: int = 24
    PASSWORD_RESET_TOKEN_TTL_MINUTES: int = 60
    AUTH_EMAIL_COOLDOWN_SECONDS: int = 60
    AUTH_LOGIN_ATTEMPT_LIMIT: int = 10
    AUTH_LOGIN_ATTEMPT_WINDOW_SECONDS: int = 600
    AUTH_REGISTER_ATTEMPT_LIMIT: int = 5
    AUTH_REGISTER_ATTEMPT_WINDOW_SECONDS: int = 3600

    # OAuth - Google
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None

    # OAuth - Kakao
    KAKAO_CLIENT_ID: Optional[str] = None
    KAKAO_CLIENT_SECRET: Optional[str] = None

    # External APIs
    TMDB_API_KEY: Optional[str] = None
    KOBIS_API_KEY: Optional[str] = None
    KMDB_API_KEY: Optional[str] = None

    # Google Cloud Storage (optional)
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None
    GCP_BUCKET_NAME: Optional[str] = None
    GCP_SIGNED_URL_EXPIRATION_SECONDS: int = 900

    # AWS S3 (optional)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_S3_BUCKET: Optional[str] = None
    AWS_REGION: str = "ap-northeast-2"

    # Email delivery
    EMAIL_FROM_ADDRESS: str = "no-reply@cineentry.app"
    EMAIL_FROM_NAME: str = "CineEntry"
    EMAIL_LOG_ONLY: bool = True
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False

    # Legacy Supabase settings (무시됨, 호환성 유지)
    SUPABASE_URL: Optional[str] = None
    SUPABASE_JWT_SECRET: Optional[str] = None
    SUPABASE_JWKS_URL: Optional[str] = None
    SUPABASE_WEBHOOK_SECRET: Optional[str] = None
    JWT_AUDIENCE: Optional[str] = None

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # 알 수 없는 환경변수 무시

    def get_jwt_secret(self) -> str:
        """JWT Secret 반환 (없으면 자동 생성)"""
        if self.JWT_SECRET_KEY:
            return self.JWT_SECRET_KEY
        # 개발 환경용 임시 시크릿 (재시작시 변경됨)
        print("⚠️  JWT_SECRET_KEY가 설정되지 않았습니다. 임시 키를 사용합니다.")
        return secrets.token_urlsafe(32)

    def get_cors_allowed_origins(self) -> list[str]:
        """CORS 허용 origin 목록 반환"""
        raw_origins: list[str] = []

        if self.CORS_ALLOWED_ORIGINS:
            raw_origins.extend(
                origin.strip() for origin in self.CORS_ALLOWED_ORIGINS.split(",")
            )
        elif self.FRONTEND_URL:
            raw_origins.append(self.FRONTEND_URL.strip())

        if self.DEBUG:
            raw_origins.extend(
                [
                    "http://localhost:3000",
                    "http://localhost:8081",
                    "http://127.0.0.1:8081",
                    "http://localhost:19006",
                    "http://127.0.0.1:19006",
                ]
            )

        origins: list[str] = []
        seen: set[str] = set()

        for origin in raw_origins:
            if not origin or origin == "*" or origin in seen:
                continue
            seen.add(origin)
            origins.append(origin)

        return origins


# Global settings instance
settings = Settings()

# JWT Secret 미리 설정 (앱 시작 시 한 번만)
_jwt_secret_key = settings.get_jwt_secret()

def get_jwt_secret_key() -> str:
    return _jwt_secret_key
