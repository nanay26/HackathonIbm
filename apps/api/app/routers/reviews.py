"""
Routers for review jobs (SDD §6.3–6.6, F2).

Endpoints:
  POST   /reviews             → 202 {review_id}
  GET    /reviews/{id}        → status + result
  DELETE /reviews/{id}        → 204 cancel
  GET    /reviews/{id}/export.docx → .docx download (Fase 5)
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import JSONResponse, Response

from ..config import get_settings
from ..errors import api_error
from ..models.schemas import (
    ChatMessageRequest,
    ConversationMessage,
    CreateReviewRequest,
    DocType,
    JobStatus,
    RetryReviewRequest,
    ReviewApprovalRequest,
    ReviewJob,
)
from ..limits import limiter
from ..services.docx_builder import build_docx, export_filename
from ..services.job_store import get_job_store
from ..services.langflow_client import LangflowClient, LangflowMCPClient
from ..services.review_runner import (
    discard_retry_input,
    get_retry_input,
    request_cancel,
    retain_retry_input,
    run_review_job,
)

logger = logging.getLogger("dewan_penilai.router.reviews")

router = APIRouter(prefix="/reviews", tags=["reviews"])


def _review_input(text: str, history: list[ConversationMessage]) -> str:
    """Keep prior user intent without feeding the model a full old review answer."""
    context: list[str] = []
    for message in history:
        role = getattr(message, "role", "user")
        if role != "user":
            continue
        content = str(getattr(message, "content", "")).strip()
        if content:
            context.append(f"Pengguna: {content}")

    if not context:
        return text

    return (
        "Jawab pertanyaan terbaru dengan mengacu pada konteks percakapan sebelumnya, "
        "tetapi jangan mengulang hasil review lama secara verbatim. Fokus pada maksud "
        "terbaru dan prioritas informasi yang relevan.\n\n"
        "=== RIWAYAT PERTANYAAN PENGGUNA ===\n"
        + "\n\n".join(context)
        + "\n\n=== PESAN TERBARU ===\n"
        + text
    )


def _elapsed(job: ReviewJob) -> float:
    """Elapsed seconds since the job was created."""
    start = job.started_at or job.created_at
    end = job.finished_at or datetime.now(UTC)
    # Make both timezone-aware for safe subtraction
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    if end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    return max(0.0, (end - start).total_seconds())


# ── GET /reviews ───────────────────────────────────────────────────────────────

@router.get("", status_code=200)
@limiter.exempt
async def list_reviews(request: Request) -> JSONResponse:
    """Return all historical review jobs stored permanently in the database."""
    store = get_job_store()
    jobs = store.get_db().list_jobs(limit=100)
    return JSONResponse([
        {
            "id": j.id,
            "doc_type": j.doc_type.value,
            "status": j.status.value,
            "created_at": j.created_at.isoformat(),
            "conversation_id": j.conversation_id or j.id,
            "title": getattr(j, "title", "Review") or "Review",
        }
        for j in jobs
    ])


# ── POST /reviews ──────────────────────────────────────────────────────────────

@router.post("", status_code=202)
async def create_review(
    request: Request,
    body: CreateReviewRequest,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    """
    Create a review job and start it in the background.
    Returns 202 + review_id immediately (< 1 s).
    """
    settings = get_settings()

    # Validate doc_type (only proposal_skripsi supported in MVP)
    if body.doc_type != DocType.proposal_skripsi:
        return api_error(
            code="UNSUPPORTED_DOC_TYPE",
            message="Hanya 'proposal_skripsi' yang didukung saat ini.",
        )

    # Validate text length
    char_count = len(body.text)
    if not body.text.strip():
        return api_error(
            code="INVALID_INPUT",
            message="Masukkan prompt atau lampirkan dokumen terlebih dahulu.",
        )
    if char_count > settings.max_input_chars:
        return api_error(
            code="INVALID_LENGTH",
            message=(
                f"Teks terlalu panjang ({char_count} karakter). "
                f"Maksimum {settings.max_input_chars} karakter."
            ),
        )

    # Check global daily quota
    store = get_job_store()
    daily = await store.daily_count()
    if daily >= settings.global_daily_review_cap:
        return api_error(
            code="DAILY_QUOTA_EXCEEDED",
            message="Kuota review harian telah habis. Coba lagi besok.",
            status_code=503,
        )

    # Create job
    job = ReviewJob(
        doc_type=body.doc_type,
        input_chars=char_count,
        conversation_id=body.conversation_id,
        status=JobStatus.queued,
    )
    await store.create(job)
    await store.increment_daily_count()

    # Snapshot the input text — it lives only until the background task completes
    input_text = _review_input(body.text, body.history)
    retain_retry_input(job.id, input_text, settings.job_ttl_seconds)

    # Persist initial conversation in SQLite database
    conv_id = body.conversation_id or job.id
    if body.history:
        for prev in body.history:
            store.get_db().add_chat_message(
                review_id=job.id,
                conversation_id=conv_id,
                role=prev.role,
                content=prev.content,
            )
    store.get_db().add_chat_message(
        review_id=job.id,
        conversation_id=conv_id,
        role="user",
        content="Tinjau dokumen proposal yang saya lampirkan." if len(body.text.strip()) > 300 else body.text.strip(),
    )

    # Call reviewer tools over MCP; the runner executes them sequentially.
    langflow_client = LangflowMCPClient(settings)

    asyncio.create_task(
        run_review_job(
            job=job,
            input_text=input_text,
            store=store,
            settings=settings,
            langflow_client=langflow_client,
        )
    )

    logger.info(
        '"event":"review_created","id":"%s","chars":%d,"request_id":"%s"',
        job.id,
        char_count,
        getattr(request.state, "request_id", "-"),
    )

    return JSONResponse({"review_id": job.id}, status_code=202)


# ── GET /reviews/{id} ──────────────────────────────────────────────────────────

@router.get("/{review_id}")
@limiter.exempt
async def get_review(review_id: str, request: Request) -> JSONResponse:
    """Return job status, elapsed time, result (if done), and error (if failed)."""
    store = get_job_store()
    job = await store.get(review_id)

    if job is None:
        return api_error(code="NOT_FOUND", message="Review tidak ditemukan.", status_code=404)

    response: dict[str, object] = {
        "status": job.status.value,
        "elapsed_seconds": round(_elapsed(job), 1),
        "active_reviewer": job.active_reviewer,
        "completed_reviewers": job.completed_reviewers,
        "retry_available": (
            job.status in {JobStatus.failed, JobStatus.timeout}
            and get_retry_input(job.id) is not None
        ),
    }

    if job.status == JobStatus.done:
        response["raw_output"] = job.raw_output
        response["result"] = job.parsed.model_dump() if job.parsed else None
    elif job.raw_output is not None:
        response["raw_output"] = job.raw_output

    if job.error:
        response["error"] = {"code": job.error.code, "message": job.error.message}
    if job.approval:
        response["approval"] = job.approval.model_dump()

    return JSONResponse(response)


# ── GET /reviews/{id}/messages ────────────────────────────────────────────────

@router.get("/{review_id}/messages")
@limiter.exempt
async def get_review_messages(review_id: str, request: Request) -> JSONResponse:
    """Get persistent chat messages from SQLite database."""
    store = get_job_store()
    job = await store.get(review_id)
    conv_id = job.conversation_id if job and job.conversation_id else review_id
    messages = store.get_db().get_chat_messages(conv_id)
    return JSONResponse(messages)


# ── POST /reviews/{id}/chat ───────────────────────────────────────────────────

@router.post("/{review_id}/chat")
@limiter.exempt
async def chat_review(
    review_id: str,
    body: ChatMessageRequest,
    request: Request,
) -> JSONResponse:
    """Ask an AI follow-up question about the review results in the chatroom."""
    store = get_job_store()
    job = await store.get(review_id)
    conv_id = job.conversation_id if job and job.conversation_id else review_id

    # 1. Save user question to DB
    user_msg = store.get_db().add_chat_message(
        review_id=review_id,
        conversation_id=conv_id,
        role="user",
        content=body.content.strip(),
    )

    # 2. Retrieve history for context
    history = store.get_db().get_chat_messages(conv_id)

    # 3. Call ChatAgentService with full review result & context
    from ..services.chat_agent import ChatAgentService
    agent = ChatAgentService(get_settings())
    raw_output = job.raw_output if job else None
    answer_text = await agent.answer_question(
        question=body.content.strip(),
        job=job,
        history=history,
        raw_output=raw_output,
        proposal_text=get_retry_input(review_id),
    )

    # 4. Save assistant answer to DB
    assistant_msg = store.get_db().add_chat_message(
        review_id=review_id,
        conversation_id=conv_id,
        role="assistant",
        content=answer_text,
    )

    return JSONResponse(assistant_msg)


# ── POST /reviews/{id}/retry ───────────────────────────────────────────────────

@router.post("/{review_id}/retry", status_code=202)
async def retry_review(
    review_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    body: RetryReviewRequest | None = None,
) -> JSONResponse:
    """Retry a failed review in place, optionally replacing its input."""
    store = get_job_store()
    job = await store.get(review_id)
    if job is None:
        return api_error(
            code="EXPIRED",
            message="Sesi review sudah tidak tersedia. Mulai review baru untuk mengirim dokumen lagi.",
            status_code=410,
        )

    if job.status not in {JobStatus.failed, JobStatus.timeout}:
        return api_error(
            code="NOT_RETRYABLE",
            message="Hanya review yang gagal atau timeout yang dapat dicoba kembali.",
            status_code=409,
        )

    settings = get_settings()
    input_text = body.text if body is not None else get_retry_input(job.id)
    if input_text is not None and not input_text.strip():
        return api_error(
            code="INVALID_INPUT",
            message="Masukkan pertanyaan atau dokumen sebelum mencoba lagi.",
        )
    if input_text is not None and len(input_text) > settings.max_input_chars:
        return api_error(
            code="INVALID_LENGTH",
            message="Teks terlalu panjang untuk batas input review.",
        )
    if input_text is None:
        return api_error(
            code="RETRY_INPUT_EXPIRED",
            message=(
                "Teks dokumen untuk mencoba kembali sudah kedaluwarsa. "
                "Mulai review baru untuk mengirim dokumen lagi."
            ),
            status_code=410,
        )

    if await store.daily_count() >= settings.global_daily_review_cap:
        return api_error(
            code="DAILY_QUOTA_EXCEEDED",
            message="Kuota review harian telah habis. Coba lagi besok.",
            status_code=503,
        )

    job.status = JobStatus.queued
    job.created_at = datetime.now(UTC)
    job.started_at = None
    job.finished_at = None
    job.raw_output = None
    job.parsed = None
    job.error = None
    job.langflow_job_id = None
    job.approval = None
    job.active_reviewer = None
    job.completed_reviewers = []
    await store.update(job)
    await store.increment_daily_count()
    retain_retry_input(job.id, input_text, settings.job_ttl_seconds)

    background_tasks.add_task(
        run_review_job,
        job=job,
        input_text=input_text,
        store=store,
        settings=settings,
        langflow_client=LangflowMCPClient(settings),
    )
    logger.info(
        '"event":"review_retried","id":"%s","request_id":"%s"',
        job.id,
        getattr(request.state, "request_id", "-"),
    )
    return JSONResponse({"review_id": job.id}, status_code=202)


@router.post("/{review_id}/approval", status_code=202)
async def approve_review_tool(
    review_id: str,
    body: ReviewApprovalRequest,
    request: Request,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    """Apply an explicit user decision to a suspended Langflow tool request."""
    store = get_job_store()
    job = await store.get(review_id)
    if job is None:
        return api_error(code="NOT_FOUND", message="Review tidak ditemukan.", status_code=404)
    if job.status != JobStatus.awaiting_approval or job.approval is None:
        return api_error(
            code="NOT_AWAITING_APPROVAL",
            message="Review ini tidak sedang menunggu persetujuan.",
            status_code=409,
        )
    if job.langflow_job_id is None:
        return api_error(
            code="LANGFLOW_JOB_MISSING",
            message="ID workflow Langflow tidak tersedia. Coba ulang review ini.",
            status_code=409,
        )
    if body.action_id not in {option.action_id for option in job.approval.options}:
        return api_error(
            code="INVALID_APPROVAL",
            message="Pilihan persetujuan tidak tersedia untuk permintaan ini.",
            status_code=400,
        )

    approval_request_id = job.approval.request_id
    client = LangflowClient(get_settings())
    job.status = JobStatus.queued
    job.approval = None
    job.error = None
    await store.update(job)
    background_tasks.add_task(
        run_review_job,
        job=job,
        input_text=get_retry_input(job.id) or "",
        store=store,
        settings=get_settings(),
        langflow_client=client,
        approval_decision=(approval_request_id, body.action_id),
    )
    logger.info(
        '"event":"review_approval_submitted","id":"%s","request_id":"%s",'
        '"request":"%s"',
        job.id,
        getattr(request.state, "request_id", "-"),
        body.action_id,
    )
    return JSONResponse({"review_id": job.id}, status_code=202)


# ── DELETE /reviews/{id} ───────────────────────────────────────────────────────

@router.delete("/{review_id}", status_code=204)
async def cancel_review(review_id: str, request: Request) -> JSONResponse:
    """Cancel a running/queued job and remove it from the store."""
    store = get_job_store()
    job = await store.get(review_id)

    if job is None:
        return api_error(code="NOT_FOUND", message="Review tidak ditemukan.", status_code=404)

    # Signal background task to stop
    request_cancel(review_id)
    discard_retry_input(review_id)

    # Remove immediately from store (background task may still be winding down)
    await store.delete(review_id)

    logger.info('"event":"review_cancelled","id":"%s"', review_id)

    return JSONResponse(None, status_code=204)


# ── GET /reviews/{id}/export.docx ─────────────────────────────────────────────

@router.get("/{review_id}/export.docx")
async def export_review(review_id: str) -> Response:
    """
    Build and stream a .docx review document (SDD §F4).
    404 if expired, 409 if not done yet.
    """
    store = get_job_store()
    job = await store.get(review_id)

    if job is None:
        return api_error(code="EXPIRED", message="Review sudah kedaluwarsa.", status_code=410)  # type: ignore[return-value]

    if job.status != JobStatus.done:
        return api_error(  # type: ignore[return-value]
            code="NOT_READY",
            message="Review belum selesai. Tunggu sampai status 'done'.",
            status_code=409,
        )

    # Build parsed report (always present when status=done; use empty fallback if null)
    from ..models.schemas import ParsedReport  # noqa: PLC0415
    report = job.parsed if job.parsed is not None else ParsedReport(parse_ok=False)

    docx_bytes = build_docx(report, raw_output=job.raw_output)
    filename = export_filename()

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(docx_bytes)),
        },
    )
