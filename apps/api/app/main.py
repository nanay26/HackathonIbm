from __future__ import annotations

import logging
import time
import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import get_settings
from .errors import rate_limit_handler
from .limits import limiter

# ── Structured JSON logging ────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", '
           '"logger": "%(name)s", "message": %(message)s}',
)
logger = logging.getLogger("dewan_penilai.main")


# ── App factory ────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Telaah API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # Rate limiter state + middleware
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
    app.add_middleware(SlowAPIMiddleware)

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type", "Accept"],
    )

    # ── Request-id middleware ──────────────────────────────────────────────────
    @app.middleware("http")
    async def add_request_id(request: Request, call_next: Any) -> Any:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - start) * 1000)
        response.headers["X-Request-Id"] = request_id
        # Log only metadata — never document content
        logger.info(
            '"method": "%s", "path": "%s", '
            '"status": %d, "elapsed_ms": %d, "request_id": "%s"',
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request_id,
        )
        return response

    # ── Security headers ───────────────────────────────────────────────────────
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next: Any) -> Any:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    # ── Lifespan: start/stop JobStore TTL sweep ────────────────────────────────
    from .services.job_store import get_job_store  # noqa: PLC0415

    @app.on_event("startup")
    async def startup() -> None:
        store = get_job_store()
        store.start_sweep()
        db = store.get_db()
        if db is not None:
            cleaned = db.clean_stale_jobs()
            if cleaned > 0:
                logger.info('"event":"cleaned_stale_jobs","count":%d', cleaned)
        logger.info('"event":"startup_complete"')

    @app.on_event("shutdown")
    async def shutdown() -> None:
        get_job_store().stop_sweep()
        logger.info('"event":"shutdown"')

    # ── Routers ────────────────────────────────────────────────────────────────
    from .routers.documents import router as documents_router  # noqa: PLC0415
    from .routers.export import router as export_router  # noqa: PLC0415
    from .routers.health import router as health_router  # noqa: PLC0415
    from .routers.reviews import router as reviews_router  # noqa: PLC0415

    app.include_router(health_router, prefix="/api/v1")
    app.include_router(documents_router, prefix="/api/v1")
    app.include_router(reviews_router, prefix="/api/v1")
    app.include_router(export_router, prefix="/api/v1")

    return app


app = create_app()
