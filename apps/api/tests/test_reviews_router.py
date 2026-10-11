"""
Integration tests for POST/GET/DELETE /api/v1/reviews (Fase 3 DoD).
Uses LANGFLOW_MOCK=true so no real HTTP calls are made.
"""
from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.models.schemas import ApprovalOption, ApprovalRequest, JobStatus
from app.services.job_store import _store_holder, get_job_store
from app.services.review_runner import _retry_inputs, discard_retry_input


@pytest.fixture(autouse=True)
def reset_job_store() -> None:
    """Clear the in-memory store before each test."""
    _store_holder.clear()
    _retry_inputs.clear()


client = TestClient(app, raise_server_exceptions=False)

MAX_INPUT_CHARS = 500_000
VALID_TEXT = "a" * 2000


# ── POST /reviews ──────────────────────────────────────────────────────────────

def test_create_review_returns_202_immediately() -> None:
    """AC F2-1: POST /reviews returns 202 + review_id in < 1 s."""
    t0 = time.perf_counter()
    resp = client.post(
        "/api/v1/reviews",
        json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
    )
    elapsed = time.perf_counter() - t0
    assert resp.status_code == 202
    body = resp.json()
    assert "review_id" in body
    assert isinstance(body["review_id"], str)
    assert elapsed < 1.0, f"POST took {elapsed:.2f}s, expected < 1s"


def test_create_review_accepts_short_text() -> None:
    resp = client.post(
        "/api/v1/reviews",
        json={"doc_type": "proposal_skripsi", "text": "Tinjau bagian metodologi."},
    )
    assert resp.status_code == 202


def test_create_review_rejects_empty_text() -> None:
    resp = client.post(
        "/api/v1/reviews",
        json={"doc_type": "proposal_skripsi", "text": "  \n  "},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_INPUT"


def test_create_review_invalid_length_too_long() -> None:
    """Text over 500 000 chars → INVALID_LENGTH."""
    resp = client.post(
        "/api/v1/reviews",
        json={"doc_type": "proposal_skripsi", "text": "x" * (MAX_INPUT_CHARS + 1)},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_LENGTH"


def test_create_review_accepts_maximum_input_length() -> None:
    resp = client.post(
        "/api/v1/reviews",
        json={"doc_type": "proposal_skripsi", "text": "x" * MAX_INPUT_CHARS},
    )
    assert resp.status_code == 202


def test_follow_up_review_accepts_short_message_with_conversation_history() -> None:
    from unittest.mock import AsyncMock, patch

    with patch("app.routers.reviews.run_review_job", new_callable=AsyncMock):
        resp = client.post(
            "/api/v1/reviews",
            json={
                "doc_type": "proposal_skripsi",
                "text": "Jelaskan rekomendasi pertama.",
                "conversation_id": "conversation-1",
                "history": [
                    {"role": "user", "content": "Tinjau metode penelitian."},
                    {"role": "assistant", "content": "Temuan utama ada pada validasi."},
                ],
            },
        )
    assert resp.status_code == 202


def test_follow_up_context_is_forwarded_to_review_runner() -> None:
    from unittest.mock import AsyncMock, patch

    captured: dict[str, object] = {}

    async def capture_runner(**kwargs: object) -> None:
        captured.update(kwargs)

    with patch(
        "app.routers.reviews.run_review_job",
        new=AsyncMock(side_effect=capture_runner),
    ):
        resp = client.post(
            "/api/v1/reviews",
            json={
                "doc_type": "proposal_skripsi",
                "text": "Jelaskan rekomendasi pertama.",
                "conversation_id": "conversation-1",
                "history": [
                    {"role": "user", "content": "Tinjau metode penelitian."},
                    {"role": "assistant", "content": "Temuan utama ada pada validasi."},
                ],
            },
        )

    assert resp.status_code == 202
    input_text = captured["input_text"]
    assert isinstance(input_text, str)
    assert "Tinjau metode penelitian." in input_text
    assert "Jelaskan rekomendasi pertama." in input_text
    assert "Temuan utama ada pada validasi." not in input_text


def test_create_review_error_format_is_uniform() -> None:
    resp = client.post(
        "/api/v1/reviews",
        json={"doc_type": "proposal_skripsi", "text": ""},
    )
    body = resp.json()
    assert "error" in body
    assert "code" in body["error"]
    assert "message" in body["error"]


# ── GET /reviews/{id} ──────────────────────────────────────────────────────────

def test_get_review_not_found_returns_404() -> None:
    resp = client.get("/api/v1/reviews/nonexistent-id")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_get_review_returns_status_and_elapsed() -> None:
    """AC F2-2: GET returns status + elapsed_seconds."""
    create_resp = client.post(
        "/api/v1/reviews",
        json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
    )
    review_id = create_resp.json()["review_id"]

    get_resp = client.get(f"/api/v1/reviews/{review_id}")
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert "status" in body
    assert body["status"] in {"queued", "running", "done", "failed", "timeout", "cancelled"}
    assert "elapsed_seconds" in body
    assert isinstance(body["elapsed_seconds"], int | float)


# ── POST /reviews/{id}/retry ───────────────────────────────────────────────────

def test_retry_reuses_failed_review_id_and_original_input() -> None:
    captured: list[dict[str, object]] = []

    async def capture_runner(**kwargs: object) -> None:
        captured.append(kwargs)

    with patch(
        "app.routers.reviews.run_review_job",
        new=AsyncMock(side_effect=capture_runner),
    ):
        create_resp = client.post(
            "/api/v1/reviews",
            json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
        )
        review_id = create_resp.json()["review_id"]
        store = get_job_store()
        job = asyncio.run(store.get(review_id))
        assert job is not None
        job.status = JobStatus.timeout
        asyncio.run(store.update(job))

        retry_resp = client.post(f"/api/v1/reviews/{review_id}/retry")

    assert retry_resp.status_code == 202
    assert retry_resp.json()["review_id"] == review_id
    assert captured[-1]["input_text"] == VALID_TEXT
    retried_job = asyncio.run(get_job_store().get(review_id))
    assert retried_job is not None
    assert retried_job.status == JobStatus.queued
    assert retried_job.error is None


def test_retry_accepts_replacement_input_in_the_same_room() -> None:
    captured: list[dict[str, object]] = []

    async def capture_runner(**kwargs: object) -> None:
        captured.append(kwargs)

    with patch(
        "app.routers.reviews.run_review_job",
        new=AsyncMock(side_effect=capture_runner),
    ):
        create_resp = client.post(
            "/api/v1/reviews",
            json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
        )
        review_id = create_resp.json()["review_id"]
        job = asyncio.run(get_job_store().get(review_id))
        assert job is not None
        job.status = JobStatus.failed
        asyncio.run(get_job_store().update(job))

        retry_resp = client.post(
            f"/api/v1/reviews/{review_id}/retry",
            json={"text": "input pengganti"},
        )

    assert retry_resp.status_code == 202
    assert retry_resp.json()["review_id"] == review_id
    assert captured[-1]["input_text"] == "input pengganti"


def test_get_review_returns_pending_human_approval() -> None:
    with patch("app.routers.reviews.run_review_job", new_callable=AsyncMock):
        response = client.post(
            "/api/v1/reviews",
            json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
        )
    review_id = response.json()["review_id"]
    job = asyncio.run(get_job_store().get(review_id))
    assert job is not None
    job.status = JobStatus.awaiting_approval
    job.langflow_job_id = "langflow-job"
    job.approval = ApprovalRequest(
        request_id="approval-id",
        prompt="Tool: assess_proposal",
        options=[ApprovalOption(action_id="approve", label="Setujui")],
    )
    asyncio.run(get_job_store().update(job))

    status = client.get(f"/api/v1/reviews/{review_id}").json()
    assert status["status"] == "awaiting_approval"
    assert status["approval"]["request_id"] == "approval-id"


def test_approval_resumes_the_current_review_with_user_choice() -> None:
    with patch("app.routers.reviews.run_review_job", new_callable=AsyncMock):
        response = client.post(
            "/api/v1/reviews",
            json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
        )
    review_id = response.json()["review_id"]
    job = asyncio.run(get_job_store().get(review_id))
    assert job is not None
    job.status = JobStatus.awaiting_approval
    job.langflow_job_id = "langflow-job"
    job.approval = ApprovalRequest(
        request_id="approval-id",
        prompt="Tool: assess_proposal",
        options=[
            ApprovalOption(action_id="approve", label="Setujui"),
            ApprovalOption(action_id="reject", label="Tolak"),
        ],
    )
    asyncio.run(get_job_store().update(job))
    langflow_client = AsyncMock()
    runner = AsyncMock()

    with (
        patch("app.routers.reviews.get_settings", return_value=Settings()),
        patch("app.routers.reviews.LangflowClient", return_value=langflow_client),
        patch("app.routers.reviews.run_review_job", new=runner),
    ):
        approval_response = client.post(
            f"/api/v1/reviews/{review_id}/approval",
            json={"action_id": "approve"},
        )

    assert approval_response.status_code == 202
    assert approval_response.json()["review_id"] == review_id
    langflow_client.resume_review.assert_not_awaited()
    assert runner.await_args is not None
    assert runner.await_args.kwargs["approval_decision"] == ("approval-id", "approve")
    updated_job = asyncio.run(get_job_store().get(review_id))
    assert updated_job is not None
    assert updated_job.status == JobStatus.queued
    assert updated_job.approval is None


def test_approval_rejects_unknown_action_id() -> None:
    with patch("app.routers.reviews.run_review_job", new_callable=AsyncMock):
        response = client.post(
            "/api/v1/reviews",
            json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
        )
    review_id = response.json()["review_id"]
    job = asyncio.run(get_job_store().get(review_id))
    assert job is not None
    job.status = JobStatus.awaiting_approval
    job.langflow_job_id = "langflow-job"
    job.approval = ApprovalRequest(
        request_id="approval-id",
        prompt="Tool: assess_proposal",
        options=[ApprovalOption(action_id="approve", label="Setujui")],
    )
    asyncio.run(get_job_store().update(job))

    approval_response = client.post(
        f"/api/v1/reviews/{review_id}/approval",
        json={"action_id": "unexpected"},
    )
    assert approval_response.status_code == 400
    assert approval_response.json()["error"]["code"] == "INVALID_APPROVAL"


def test_retry_reports_expired_when_input_is_unavailable() -> None:
    with patch("app.routers.reviews.run_review_job", new_callable=AsyncMock):
        create_resp = client.post(
            "/api/v1/reviews",
            json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
        )
    review_id = create_resp.json()["review_id"]
    job = asyncio.run(get_job_store().get(review_id))
    assert job is not None
    job.status = JobStatus.failed
    asyncio.run(get_job_store().update(job))
    discard_retry_input(review_id)

    status_resp = client.get(f"/api/v1/reviews/{review_id}")
    retry_resp = client.post(f"/api/v1/reviews/{review_id}/retry")

    assert status_resp.json()["retry_available"] is False
    assert retry_resp.status_code == 410
    assert retry_resp.json()["error"]["code"] == "RETRY_INPUT_EXPIRED"


def test_retry_rejects_review_that_is_not_failed_or_timed_out() -> None:
    with patch("app.routers.reviews.run_review_job", new_callable=AsyncMock):
        create_resp = client.post(
            "/api/v1/reviews",
            json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
        )
    review_id = create_resp.json()["review_id"]

    resp = client.post(f"/api/v1/reviews/{review_id}/retry")

    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "NOT_RETRYABLE"


# ── DELETE /reviews/{id} ───────────────────────────────────────────────────────

def test_delete_review_returns_204() -> None:
    """AC F2-7: DELETE cancels and removes job → 204."""
    create_resp = client.post(
        "/api/v1/reviews",
        json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
    )
    review_id = create_resp.json()["review_id"]

    del_resp = client.delete(f"/api/v1/reviews/{review_id}")
    assert del_resp.status_code == 204


def test_delete_review_then_get_returns_404() -> None:
    """After DELETE, GET should return 404 (job removed from store)."""
    create_resp = client.post(
        "/api/v1/reviews",
        json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
    )
    review_id = create_resp.json()["review_id"]

    client.delete(f"/api/v1/reviews/{review_id}")

    get_resp = client.get(f"/api/v1/reviews/{review_id}")
    assert get_resp.status_code == 404


def test_delete_nonexistent_review_returns_404() -> None:
    resp = client.delete("/api/v1/reviews/no-such-id")
    assert resp.status_code == 404


# ── GET /reviews/{id}/export.docx — stub ──────────────────────────────────────

def test_export_not_found_returns_410() -> None:
    resp = client.get("/api/v1/reviews/nonexistent/export.docx")
    assert resp.status_code == 410


def test_export_not_ready_returns_409() -> None:
    """Job in queued/running state → 409 NOT_READY."""
    from unittest.mock import AsyncMock, patch

    with patch("app.routers.reviews.run_review_job", new_callable=AsyncMock):
        create_resp = client.post(
            "/api/v1/reviews",
            json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
        )
        review_id = create_resp.json()["review_id"]
        resp = client.get(f"/api/v1/reviews/{review_id}/export.docx")
    assert resp.status_code == 409


# ── Daily quota ────────────────────────────────────────────────────────────────

def test_daily_quota_exceeded_returns_503() -> None:
    """AC F2-4: global daily cap exceeded → 503 DAILY_QUOTA_EXCEEDED."""
    from unittest.mock import AsyncMock, patch

    async def quota_exceeded() -> int:
        return 10_000  # way above cap

    with patch(
        "app.routers.reviews.get_job_store",
        return_value=type(
            "FakeStore",
            (),
            {
                "daily_count": AsyncMock(return_value=10_000),
                "count_running": AsyncMock(return_value=0),
                "create": AsyncMock(),
                "increment_daily_count": AsyncMock(),
            },
        )(),
    ):
        resp = client.post(
            "/api/v1/reviews",
            json={"doc_type": "proposal_skripsi", "text": VALID_TEXT},
        )
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "DAILY_QUOTA_EXCEEDED"
