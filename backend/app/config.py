from pydantic_settings import BaseSettings
from typing import Optional
import secrets


class Settings(BaseSettings):
    """
    Application settings with environment variables
    """

    # Application
    APP_NAME: str = "Filmory API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    FRONTEND_URL: str = "http://localhost:8081"  # 프론트엔드 URL (OAuth 콜백용)

    # Database (Independent PostgreSQL)
    DATABASE_URL: str

    # Redis (for caching)
    REDIS_URL: str = "redis://localhost:6379"

    # JWT Settings (자체 인증)
    JWT_SECRET_KEY: Optional[str] = None  # 없으면 자동 생성 (개발용)
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30  # Access Token 만료: 30분
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30  # Refresh Token 만료: 30일

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

    # AWS S3 (optional)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_S3_BUCKET: Optional[str] = None
    AWS_REGION: str = "ap-northeast-2"

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


# Global settings instance
settings = Settings()

# JWT Secret 미리 설정 (앱 시작 시 한 번만)
_jwt_secret_key = settings.get_jwt_secret()

def get_jwt_secret_key() -> str:
    return _jwt_secret_key
