"""Router for POST /documents/extract (SDD §6.2, F1)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse

from ..config import get_settings
from ..errors import api_error
from ..services.extractor import ExtractionError, extract

logger = logging.getLogger("dewan_penilai.router.documents")

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/extract")
async def extract_document(
    request: Request,
    file: UploadFile = File(...),  # noqa: B008
) -> JSONResponse:
    """
    Extract text from an uploaded PDF or DOCX file.

    Returns: {text, char_count, filename, warnings}
    Errors: FILE_TOO_LARGE, UNSUPPORTED_TYPE, NO_TEXT_LAYER, EMPTY
    """
    settings = get_settings()
    max_bytes = settings.max_upload_mb * 1024 * 1024

    # Read file with size guard (stream limit)
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        return api_error(
            code="FILE_TOO_LARGE",
            message=(
                f"Ukuran file melebihi batas {settings.max_upload_mb} MB. "
                "Kompres atau gunakan opsi paste teks."
            ),
            status_code=400,
        )

    filename = file.filename or "upload"
    # Log only safe metadata — never the document content
    logger.info(
        '"event":"extract_request","filename_len":%d,"size_bytes":%d,"request_id":"%s"',
        len(filename),
        len(data),
        getattr(request.state, "request_id", "-"),
    )

    try:
        result = extract(data, filename)
    except ExtractionError as exc:
        return api_error(code=exc.code, message=exc.message, status_code=400)

    return JSONResponse(
        {
            "text": result.text,
            "char_count": result.char_count,
            "filename": result.filename,
            "warnings": result.warnings,
        }
    )
