from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging
from app.config import settings
from app.services.redis_service import redis_service
from app.services.media_cleanup_service import process_cleanup_jobs


async def _run_media_cleanup(stop: asyncio.Event):
    while not stop.is_set():
        try:
            processed = await asyncio.to_thread(process_cleanup_jobs, batch_size=1)
        except Exception:
            logging.getLogger(__name__).warning("미디어 정리 작업을 재시도합니다.")
            processed = 0
        if processed:
            continue
        try:
            await asyncio.wait_for(stop.wait(), timeout=5)
        except TimeoutError:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan events
    """
    # Startup
    settings.validate_production()
    await redis_service.connect()
    stop = asyncio.Event()
    cleanup_task = asyncio.create_task(_run_media_cleanup(stop))
    try:
        yield
    finally:
        stop.set()
        # Do not cancel an in-flight thread holding database locks.
        await cleanup_task
        await redis_service.disconnect()


app = FastAPI(
    title=settings.APP_NAME,
    description="Movie tracking app API with self-hosted JWT authentication",
    version=settings.APP_VERSION,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

cors_origins = settings.get_cors_allowed_origins()
if not cors_origins:
    print(
        "⚠️  CORS_ALLOWED_ORIGINS 또는 FRONTEND_URL이 비어 있어 브라우저 요청이 차단됩니다."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def protect_auth_responses(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/api/v1/auth/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    return response


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
