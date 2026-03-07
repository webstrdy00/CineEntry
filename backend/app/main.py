from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.services.redis_service import redis_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan events
    """
    # Startup
    await redis_service.connect()
    print("✅ Redis connected")
    yield
    # Shutdown
    await redis_service.disconnect()
    print("✅ Redis disconnected")


app = FastAPI(
    title=settings.APP_NAME,
    description="Movie tracking app API with self-hosted JWT authentication",
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

cors_origins = settings.get_cors_allowed_origins()
if not cors_origins:
    print("⚠️  CORS_ALLOWED_ORIGINS 또는 FRONTEND_URL이 비어 있어 브라우저 요청이 차단됩니다.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "CineEntry API is running",
        "version": settings.APP_VERSION,
        "architecture": "Self-hosted JWT + PostgreSQL",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "cineentry-api"}


# API 라우터 등록
from app.api.v1 import movies, collections, stats, users, tags, media, auth

app.include_router(auth.router, prefix="/api/v1")  # 인증 API
app.include_router(movies.router, prefix="/api/v1")
app.include_router(collections.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(tags.router, prefix="/api/v1")
app.include_router(media.router, prefix="/api/v1")
