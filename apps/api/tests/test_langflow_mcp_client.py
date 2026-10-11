from __future__ import annotations

import json

import httpx
import pytest

from app.config import Settings
from app.services.langflow_client import LangflowAPIError, LangflowMCPClient

MCP_URL = "http://langflow-test.example/api/v1/mcp/project/test/streamable"
EXPECTED_TOOLS = [
    "assess_proposal_feasibility",
    "analyze_originality",
    "propose_proposal_revision",
]


def make_client(handler) -> LangflowMCPClient:
    settings = Settings(
        langflow_api_key="test-key",
        langflow_mcp_url=MCP_URL,
        review_timeout_seconds=1,
    )
    http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return LangflowMCPClient(settings, http_client=http_client)


def sse_response(
    message: dict[str, object],
    session_id: str | None = None,
) -> httpx.Response:
    encoded = json.dumps(message)
    headers = {"content-type": "text/event-stream"}
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    return httpx.Response(
        200,
        headers=headers,
        text=f"event: message\ndata: {encoded}\n\n",
    )


async def test_mcp_review_tools_are_called_sequentially() -> None:
    requests: list[httpx.Request] = []
    progress: list[tuple[str, str]] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        body = json.loads(request.content)
        method = body["method"]
        if method == "initialize":
            return sse_response(
                {
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "result": {"protocolVersion": "2025-03-26"},
                },
                session_id="session-1",
            )
        if method == "notifications/initialized":
            return httpx.Response(202)
        if method == "tools/list":
            return sse_response(
                {
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "result": {"tools": [{"name": name} for name in EXPECTED_TOOLS]},
                }
            )
        if method == "tools/call":
            tool_name = body["params"]["name"]
            return sse_response(
                {
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "result": {
                        "content": [{"type": "text", "text": f"Output for {tool_name}"}],
                    },
                }
            )
        raise AssertionError(f"Unexpected MCP method: {method}")

    client = make_client(respond)
    try:
        output = await client.run_review(
            "Proposal text",
            idempotency_key="review-1",
            progress_callback=lambda state, reviewer: _record_progress(progress, state, reviewer),
        )
    finally:
        assert client._http_client is not None
        await client._http_client.aclose()

    assert [json.loads(req.content).get("params", {}).get("name") for req in requests
            if json.loads(req.content)["method"] == "tools/call"] == EXPECTED_TOOLS
    assert output.index("METODOLOGI") < output.index("ORISINALITAS") < output.index("REVISI")
    assert "Output for analyze_originality" in output
    assert progress == [
        ("started", "METODOLOGI"),
        ("completed", "METODOLOGI"),
        ("started", "ORISINALITAS"),
        ("completed", "ORISINALITAS"),
        ("started", "REVISI"),
        ("completed", "REVISI"),
    ]
    assert all(req.headers["x-api-key"] == "test-key" for req in requests)
    assert all(
        req.headers.get("Mcp-Session-Id") == "session-1"
        for req in requests[1:]
    )


async def test_mcp_failure_preserves_completed_reviewer_output() -> None:
    call_index = 0

    def respond(request: httpx.Request) -> httpx.Response:
        nonlocal call_index
        body = json.loads(request.content)
        method = body["method"]
        if method == "initialize":
            return sse_response(
                {"jsonrpc": "2.0", "id": body["id"], "result": {}},
                session_id="session-2",
            )
        if method == "notifications/initialized":
            return httpx.Response(202)
        if method == "tools/list":
            return sse_response(
                {
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "result": {"tools": [{"name": name} for name in EXPECTED_TOOLS]},
                }
            )
        if method == "tools/call":
            call_index += 1
            if call_index == 2:
                return sse_response(
                    {
                        "jsonrpc": "2.0",
                        "id": body["id"],
                        "result": {"isError": True, "content": []},
                    }
                )
            return sse_response(
                {
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "result": {
                        "content": [{"type": "text", "text": "First reviewer completed"}],
                    },
                }
            )
        raise AssertionError(f"Unexpected MCP method: {method}")

    client = make_client(respond)
    try:
        with pytest.raises(LangflowAPIError) as caught:
            await client.run_review("Proposal text", idempotency_key="review-2")
    finally:
        assert client._http_client is not None
        await client._http_client.aclose()

    assert caught.value.partial_output.startswith("===== REVIEWER: METODOLOGI =====")
    assert "First reviewer completed" in caught.value.partial_output
    assert call_index == 2


async def test_mcp_review_fails_before_running_when_reviewer_tool_missing() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if body["method"] == "initialize":
            return sse_response(
                {"jsonrpc": "2.0", "id": body["id"], "result": {}},
                session_id="session-3",
            )
        if body["method"] == "notifications/initialized":
            return httpx.Response(202)
        return sse_response(
            {
                "jsonrpc": "2.0",
                "id": body["id"],
                "result": {"tools": [{"name": EXPECTED_TOOLS[0]}]},
            }
        )

    client = make_client(respond)
    try:
        with pytest.raises(LangflowAPIError) as caught:
            await client.run_review("Proposal text", idempotency_key="review-3")
    finally:
        assert client._http_client is not None
        await client._http_client.aclose()
    assert caught.value.code == "LANGFLOW_MCP_TOOLS_MISSING"


async def test_mcp_quota_error_is_classified_and_exposes_completed_output() -> None:
    call_index = 0

    def respond(request: httpx.Request) -> httpx.Response:
        nonlocal call_index
        body = json.loads(request.content)
        method = body["method"]
        if method == "initialize":
            return sse_response(
                {"jsonrpc": "2.0", "id": body["id"], "result": {}},
                session_id="session-4",
            )
        if method == "notifications/initialized":
            return httpx.Response(202)
        if method == "tools/list":
            return sse_response(
                {
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "result": {"tools": [{"name": name} for name in EXPECTED_TOOLS]},
                }
            )
        if method == "tools/call":
            call_index += 1
            if call_index == 1:
                return sse_response(
                    {
                        "jsonrpc": "2.0",
                        "id": body["id"],
                        "result": {
                            "content": [{"type": "text", "text": "Reviewer methodology completed."}],
                        },
                    }
                )
            return sse_response(
                {
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "result": {
                        "isError": True,
                        "content": [
                            {
                                "type": "text",
                                "text": "Error Executing analyze_originality: HTTP 429 quota exceeded. Please retry in 13h42m.",
                            }
                        ],
                    },
                }
            )
        raise AssertionError(f"Unexpected MCP method: {method}")

    client = make_client(respond)
    try:
        with pytest.raises(LangflowAPIError) as caught:
            await client.run_review("Proposal text", idempotency_key="review-4")
    finally:
        assert client._http_client is not None
        await client._http_client.aclose()

    assert caught.value.code == "LANGFLOW_RATE_LIMIT"
    assert "13h42m" in caught.value.message
    assert "Reviewer methodology completed" in caught.value.partial_output
    assert "ORISINALITAS" in caught.value.partial_output
    assert call_index == 2


async def _record_progress(
    progress: list[tuple[str, str]],
    state: str,
    reviewer: str,
) -> None:
    progress.append((state, reviewer))
