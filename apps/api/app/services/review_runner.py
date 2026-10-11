"""
Background review runner (SDD §F2).

Responsibilities:
  - Concurrency gate: at most MAX_CONCURRENT_REVIEWS running jobs.
  - Queued jobs are started FIFO as running slots free up.
  - Calls LangflowClient.run_review(); handles timeout and unavailable errors.
  - Parses raw_output into ParsedReport via parser.parse_flow5_output().
  - Deletes input_text from the job as soon as it reaches a terminal state.
  - Exposes run_review_job() as the asyncio task entry point.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from ..config import Settings
from ..models.schemas import ApprovalOption, ApprovalRequest, JobError, JobStatus, ReviewJob
from ..services.job_store import JobStore
from ..services.langflow_client import (
    LangflowApprovalRequired,
    LangflowClient,
    LangflowError,
    LangflowMCPClient,
    LangflowTimeoutError,
)
from ..services.parser import parse_flow5_output

logger = logging.getLogger("dewan_penilai.runner")

# Per-job cancel signals: {job_id: asyncio.Event}
_cancel_events: dict[str, asyncio.Event] = {}
_retry_inputs: dict[str, tuple[str, datetime]] = {}


def _expire_retry_inputs(now: datetime) -> None:
    for review_id, (_, expires_at) in list(_retry_inputs.items()):
        if now >= expires_at:
            _retry_inputs.pop(review_id, None)


def retain_retry_input(review_id: str, input_text: str, ttl_seconds: int) -> None:
    """Keep failed-review input in memory briefly so it can be retried."""
    now = datetime.now(UTC)
    _expire_retry_inputs(now)
    _retry_inputs[review_id] = (
        input_text,
        now + timedelta(seconds=ttl_seconds),
    )


def get_retry_input(review_id: str) -> str | None:
    """Return an unexpired retry input, removing it once its TTL passes."""
    _expire_retry_inputs(datetime.now(UTC))
    entry = _retry_inputs.get(review_id)
    if entry is None:
        return None
    input_text, _ = entry
    return input_text


def discard_retry_input(review_id: str) -> None:
    """Remove retry input after success, cancellation, or job deletion."""
    _retry_inputs.pop(review_id, None)


def request_cancel(job_id: str) -> None:
    """Signal a running job to cancel. Safe to call even if job is not running."""
    event = _cancel_events.get(job_id)
    if event:
        event.set()


async def run_review_job(
    job: ReviewJob,
    input_text: str,
    store: JobStore,
    settings: Settings,
    langflow_client: LangflowClient | LangflowMCPClient,
    approval_decision: tuple[str, str] | None = None,
) -> None:
    """
    Execute a review job in the background.

    This coroutine is scheduled as an asyncio.Task by the POST /reviews endpoint.
    It manages:
      - Waiting for a concurrency slot (queued → running).
      - Calling Langflow with cancel/timeout awareness.
      - Persisting status transitions and errors.
      - Wiping input_text from memory on any terminal state.
    """
    cancel_event = asyncio.Event()
    _cancel_events[job.id] = cancel_event

    try:
        # ── Wait for a concurrency slot ────────────────────────────────────────
        while True:
            if cancel_event.is_set():
                await _finish(job, JobStatus.cancelled, store, input_text=None)
                return

            running = await store.count_running()
            if running < settings.max_concurrent_reviews:
                break

            logger.info('"event":"job_queued","id":"%s","running":%d', job.id, running)
            await asyncio.sleep(3)

        # ── Transition to running ──────────────────────────────────────────────
        job.status = JobStatus.running
        job.started_at = datetime.now(UTC)
        job.approval = None
        await store.update(job)
        logger.info('"event":"job_started","id":"%s"', job.id)

        # ── Call Langflow with cancellation awareness ──────────────────────────
        async def run_workflow() -> str:
            if approval_decision is not None:
                if isinstance(langflow_client, LangflowMCPClient):
                    raise LangflowError(
                        "Approval tidak tersedia untuk pemanggilan reviewer melalui MCP."
                    )
                if job.langflow_job_id is None:
                    raise RuntimeError("Approval continuation has no Langflow workflow ID.")
                request_id, action_id = approval_decision
                await langflow_client.resume_review(
                    job.langflow_job_id,
                    request_id,
                    action_id,
                )
            if isinstance(langflow_client, LangflowMCPClient):
                async def update_progress(state: str, reviewer: str) -> None:
                    if state == "started":
                        job.active_reviewer = reviewer
                    else:
                        job.completed_reviewers.append(reviewer)
                        job.active_reviewer = None
                    await store.update(job)

                return await langflow_client.run_review(
                    input_text,
                    idempotency_key=job.conversation_id or job.id,
                    progress_callback=update_progress,
                )

            return await langflow_client.run_review(
                input_text,
                workflow_job_id=job.langflow_job_id,
                idempotency_key=job.id,
            )

        langflow_task = asyncio.create_task(run_workflow())

        cancel_check = asyncio.create_task(_watch_cancel(cancel_event))

        done, pending = await asyncio.wait(
            {langflow_task, cancel_check},
            return_when=asyncio.FIRST_COMPLETED,
        )

        # Cancel whichever task didn't win
        for t in pending:
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass

        if cancel_check in done and not langflow_task.done():
            # User cancelled
            langflow_task.cancel()
            await _finish(job, JobStatus.cancelled, store, input_text=None)
            return

        # Langflow task finished (done or raised)
        try:
            raw_output = langflow_task.result()
        except LangflowTimeoutError as exc:
            logger.warning('"event":"job_timeout","id":"%s"', job.id)
            job.raw_output = exc.partial_output or None
            job.active_reviewer = None
            await _finish(
                job,
                JobStatus.timeout,
                store,
                error=JobError(
                    code="LANGFLOW_TIMEOUT",
                    message="Review tidak selesai dalam batas waktu yang ditetapkan. Coba lagi.",
                ),
                input_text=None,
            )
            return
        except LangflowApprovalRequired as exc:
            job.status = JobStatus.awaiting_approval
            job.langflow_job_id = exc.workflow_job_id
            job.approval = ApprovalRequest(
                request_id=exc.request_id,
                prompt=exc.prompt,
                options=[
                    ApprovalOption(action_id=option["action_id"], label=option["label"])
                    for option in exc.options
                ],
            )
            await store.update(job)
            logger.info('"event":"job_awaiting_approval","id":"%s"', job.id)
            return
        except LangflowError as exc:
            job.raw_output = exc.partial_output or None
            job.active_reviewer = None
            logger.error(
                '"event":"job_failed_langflow","id":"%s","code":"%s"',
                job.id,
                exc.code,
            )
            await _finish(
                job,
                JobStatus.failed,
                store,
                error=JobError(code=exc.code, message=exc.message),
                input_text=None,
            )
            return
        except Exception as exc:  # noqa: BLE001
            logger.error('"event":"job_failed_unexpected","id":"%s"', job.id)
            await _finish(
                job,
                JobStatus.failed,
                store,
                error=JobError(
                    code="UNEXPECTED_ERROR",
                    message=f"Terjadi kesalahan tak terduga: {type(exc).__name__}",
                ),
                input_text=None,
            )
            return

        # ── Success ────────────────────────────────────────────────────────────
        job.raw_output = raw_output
        job.approval = None
        job.langflow_job_id = None
        try:
            job.parsed = parse_flow5_output(raw_output)
        except Exception:  # noqa: BLE001
            logger.exception('"event":"parse_failed","id":"%s"', job.id)
            # parse failure is non-fatal; raw_output still available for fallback display
        await _finish(job, JobStatus.done, store, input_text=None)
        
        # Persist assistant notification in SQLite chat history
        conv_id = job.conversation_id or job.id
        summary_intro = (
            "Hasil telaah proposal oleh Dewan Penilai telah selesai disusun.\n\n"
            + (f"• Status Utama: {job.parsed.reviewers[0].verdict}\n" if job.parsed and job.parsed.reviewers else "")
            + (f"• Titik Perdebatan: Ditemukan {len(job.parsed.debate_points)} titik silang antar-reviewer.\n" if job.parsed and job.parsed.debate_points else "")
            + "\nSilakan periksa kartu telaah terstruktur di bawah, atau tanyakan hal apapun seputar hasil review di ruang obrolan ini!"
        )
        get_db_fn = getattr(store, "get_db", None)
        db = get_db_fn() if callable(get_db_fn) else None
        if db is not None:
            db.add_chat_message(
                review_id=job.id,
                conversation_id=conv_id,
                role="assistant",
                content=summary_intro,
            )

        discard_retry_input(job.id)
        logger.info('"event":"job_done","id":"%s"', job.id)

    finally:
        _cancel_events.pop(job.id, None)


async def _watch_cancel(event: asyncio.Event) -> None:
    """Coroutine that resolves when the cancel event is set."""
    while not event.is_set():
        await asyncio.sleep(0.5)


async def _finish(
    job: ReviewJob,
    status: JobStatus,
    store: JobStore,
    *,
    error: JobError | None = None,
    input_text: None,  # always None — forces caller to acknowledge wipe
) -> None:
    """
    Transition job to a terminal state and wipe sensitive data.
    input_text parameter is always None — the caller's input_text local
    variable goes out of scope, which is the actual wipe.
    """
    job.status = status
    job.finished_at = datetime.now(UTC)
    job.error = error
    # input_text has already been dropped by the caller; raw_output kept for results.
    await store.update(job)
    logger.info('"event":"job_terminal","id":"%s","status":"%s"', job.id, status.value)
