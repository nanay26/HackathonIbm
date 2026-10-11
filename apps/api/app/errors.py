"""
Uniform API error helpers (SDD §6, format: {error:{code, message}}).
"""
from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded


def api_error(code: str, message: str, status_code: int = 400) -> JSONResponse:
    """Return a uniform error response body."""
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


# ── FastAPI exception handlers ─────────────────────────────────────────────────

async def rate_limit_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle slowapi RateLimitExceeded → 429 with Retry-After."""
    assert isinstance(exc, RateLimitExceeded)
    retry_after = getattr(exc, "retry_after", None)
    response = api_error(
        code="RATE_LIMITED",
        message=(
            f"Terlalu banyak permintaan. Coba lagi dalam "
            f"{retry_after} detik." if retry_after else "Terlalu banyak permintaan."
        ),
        status_code=429,
    )
    if retry_after:
        response.headers["Retry-After"] = str(retry_after)
    return response
