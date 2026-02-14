from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
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
    title="Filmory API",
    description="Movie tracking app API with self-hosted JWT authentication",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 환경, 운영 환경에서는 구체적인 도메인 지정
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Filmory API is running",
        "version": "1.0.0",
        "architecture": "Self-hosted JWT + PostgreSQL",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "filmory-api"}


# API 라우터 등록
from app.api.v1 import movies, collections, stats, users, tags, media, auth

app.include_router(auth.router, prefix="/api/v1")  # 인증 API
app.include_router(movies.router, prefix="/api/v1")
app.include_router(collections.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(tags.router, prefix="/api/v1")
app.include_router(media.router, prefix="/api/v1")
