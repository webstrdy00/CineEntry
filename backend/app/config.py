from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """
    Application settings with environment variables
    """

    # Application
    APP_NAME: str = "Filmory API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database (Independent PostgreSQL)
    DATABASE_URL: str

    # Supabase (Auth only - NOT using Supabase database)
    SUPABASE_URL: str
    SUPABASE_JWT_SECRET: Optional[str] = None
    SUPABASE_JWKS_URL: str
    SUPABASE_WEBHOOK_SECRET: Optional[str] = None  # Webhook 보안용

    # Redis (for caching)
    REDIS_URL: str = "redis://localhost:6379"

    # External APIs
    TMDB_API_KEY: Optional[str] = None
    KOBIS_API_KEY: Optional[str] = None
    KMDB_API_KEY: Optional[str] = None

    # AWS S3 (optional)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_S3_BUCKET: Optional[str] = None
    AWS_REGION: str = "ap-northeast-2"

    # JWT Settings
    JWT_ALGORITHM: str = "RS256"
    JWT_AUDIENCE: str = "authenticated"

    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
settings = Settings()
