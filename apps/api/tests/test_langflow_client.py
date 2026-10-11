from __future__ import annotations

import json

import httpx
import pytest

from app.config import Settings
from app.services.langflow_client import (
    LangflowAPIError,
    LangflowApprovalRequired,
    LangflowClient,
)

BASE_URL = "http://langflow-test.example"
FLOW_ID = "test-flow-id"
WORKFLOWS_URL = f"{BASE_URL}/api/v2/workflows"


def make_settings(mock: bool = False) -> Settings:
    return Settings(
        langflow_base_url=BASE_URL,
        langflow_api_key="test-key",
        langflow_flow5_id=FLOW_ID,
        langflow_mock=mock,
    )


def make_client(handler) -> LangflowClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return LangflowClient(settings=make_settings(), http_client=http)


def queued_job() -> dict[str, str]:
    return {
        "object": "job",
        "job_id": "langflow-job-1",
        "flow_id": FLOW_ID,
        "status": "queued",
    }


async def test_mock_mode_explicitly_says_document_was_not_analyzed() -> None:
    client = LangflowClient(make_settings(mock=True))
    result = await client.run_review("any input")
    assert "SIMULASI" in result
    assert "tidak dianalisis" in result
    assert "hasil review nyata tidak tersedia" in result


async def test_real_mode_uses_v2_background_workflow_and_extracts_output() -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "POST":
            return httpx.Response(200, json=queued_job())
        return httpx.Response(
            200,
            json={
                "job_id": "langflow-job-1",
                "flow_id": FLOW_ID,
                "object": "response",
                "status": "completed",
                "output": {"text": "REVIEWER OUTPUT"},
            },
        )

    result = await make_client(respond).run_review(
        "proposal text",
        idempotency_key="review-123",
    )

    assert result == "REVIEWER OUTPUT"
    assert [request.method for request in requests] == ["POST", "GET"]
    assert requests[0].url.path == "/api/v2/workflows"
    assert requests[0].headers["x-api-key"] == "test-key"
    body = json.loads(requests[0].content)
    assert body["flow_id"] == FLOW_ID
    assert body["input_value"] == "proposal text"
    assert body["mode"] == "background"
    assert body["idempotency_key"] == "review-123"


async def test_workflow_exposes_safe_human_approval_request() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(200, json=queued_job())
        if request.url.path == "/api/v2/workflows/pending":
            return httpx.Response(
                200,
                json=[
                    {
                        "job_id": "langflow-job-1",
                        "request_id": "approval-1",
                        "kind": "tool_approval",
                        "prompt": "Tool execution requires approval\n\n"
                        "Tool: assess_proposal\nArgs: private document data",
                        "options": [
                            {"action_id": "approve", "label": "Approve"},
                            {"action_id": "reject", "label": "Reject"},
                        ],
                    }
                ],
            )
        return httpx.Response(200, json={"status": "suspended"})

    with pytest.raises(LangflowApprovalRequired) as caught:
        await make_client(respond).run_review("proposal text")

    error = caught.value
    assert error.workflow_job_id == "langflow-job-1"
    assert error.request_id == "approval-1"
    assert "assess_proposal" in error.prompt
    assert "private document data" not in error.prompt
    assert [option["action_id"] for option in error.options] == ["approve", "reject"]


async def test_resume_sends_exact_user_decision() -> None:
    captured: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json={"job_id": "langflow-job-1", "status": "resuming"})

    await make_client(respond).resume_review(
        "langflow-job-1",
        "approval-1",
        "approve",
    )
    assert captured[0].url.path == "/api/v2/workflows/langflow-job-1/resume"
    assert json.loads(captured[0].content) == {
        "request_id": "approval-1",
        "decision": {"action_id": "approve"},
    }


async def test_quota_failure_is_not_reported_as_unavailable() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(200, json=queued_job())
        return httpx.Response(
            200,
            json={
                "status": "failed",
                "errors": [
                    {"error": "Error calling model: 429 Too Many Requests, quota exceeded"}
                ],
            },
        )

    with pytest.raises(LangflowAPIError) as caught:
        await make_client(respond).run_review("proposal text")
    assert caught.value.code == "LANGFLOW_RATE_LIMIT"
    assert "kuota" in caught.value.message.lower()


async def test_auth_rejection_has_actionable_error() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "Invalid API key"})

    with pytest.raises(LangflowAPIError) as caught:
        await make_client(respond).run_review("proposal text")
    assert caught.value.code == "LANGFLOW_AUTH_ERROR"
    assert "LANGFLOW_API_KEY" in caught.value.message


async def test_invalid_flow_id_has_actionable_error() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"detail": "Flow not found"})

    with pytest.raises(LangflowAPIError) as caught:
        await make_client(respond).run_review("proposal text")
    assert caught.value.code == "LANGFLOW_FLOW_NOT_FOUND"
    assert "LANGFLOW_FLOW5_ID" in caught.value.message
