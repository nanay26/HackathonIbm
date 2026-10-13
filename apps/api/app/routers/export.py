"""
Stateless export endpoint (SDD F5 / spec Bagian 9).

POST /api/v1/export/docx
  Body: {parsed?: ParsedReport, raw_output?: str, doc_type: str}
  → .docx bytes (built on-the-fly, nothing stored)

Unlike GET /reviews/{id}/export.docx this endpoint does not require a
live job in the store, so it works for history entries whose TTL has passed.

Rate limit: same as /documents/extract (default_limits from SlowAPIMiddleware).
Body size: enforced by FastAPI body size limit (set in main.py).
"""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import BaseModel

from ..errors import api_error
from ..models.schemas import ParsedReport
from ..services.docx_builder import build_docx, export_filename

router = APIRouter(prefix="/export", tags=["export"])

# ── Request body ───────────────────────────────────────────────────────────────

class StatelessExportRequest(BaseModel):
    parsed: ParsedReport | None = None
    raw_output: str | None = None
    doc_type: str = "proposal_skripsi"


# ── POST /export/docx ──────────────────────────────────────────────────────────

@router.post("/docx")
async def export_docx_stateless(
    request: Request,
    body: StatelessExportRequest,
) -> Response:
    """
    Build a .docx from provided ParsedReport or raw_output.
    Returns 400 if both parsed and raw_output are absent.
    Stateless — nothing is stored server-side.
    """
    if body.parsed is None and not body.raw_output:
        return api_error(
            code="EMPTY_BODY",
            message="Diperlukan setidaknya satu dari: parsed, raw_output.",
            status_code=400,
        )

    # Build report object
    if body.parsed is not None:
        report = body.parsed
    else:
        report = ParsedReport(parse_ok=False)

    docx_bytes = build_docx(report, raw_output=body.raw_output)
    filename = export_filename()

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(docx_bytes)),
        },
    )
