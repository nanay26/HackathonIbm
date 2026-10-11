from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..config import get_settings
from ..services.langflow_client import LangflowError, LangflowMCPClient

logger = logging.getLogger("dewan_penilai.router.health")

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> JSONResponse:
    settings = get_settings()
    if settings.langflow_mock:
        return JSONResponse({"status": "ok", "langflow": "mock"})

    try:
        await LangflowMCPClient(settings).probe()
    except LangflowError as exc:
        logger.warning(
            '"event":"langflow_health_probe_failed","code":"%s"',
            exc.code,
        )
        langflow_status = "unreachable"
        detail: str | None = exc.message
        http_status = None
    else:
        langflow_status = "reachable"
        http_status = 200
        detail = None

    return JSONResponse(
        {
            "status": "ok",
            "langflow": langflow_status,
            "langflow_http_status": http_status,
            "langflow_error": detail,
        }
    )
