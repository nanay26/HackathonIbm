"""
Langflow v2 workflow client.

The v1 run API cannot execute flows containing Human-in-the-Loop nodes. This
client uses v2 background jobs and exposes suspended approval requests to the
review API so a user can approve or reject them from the same chat room.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import Awaitable, Callable
from typing import TypedDict
from urllib.parse import quote
from uuid import uuid4

import httpx

from ..config import Settings

logger = logging.getLogger("dewan_penilai.langflow_client")


class ApprovalOption(TypedDict):
    action_id: str
    label: str


class LangflowError(Exception):
    """Base error for Langflow call failures."""

    code = "LANGFLOW_ERROR"
    message = "Langflow returned an unexpected error."

    def __init__(self, message: str | None = None) -> None:
        self.partial_output = ""
        if message:
            self.message = message
        super().__init__(self.message)


class LangflowUnavailableError(LangflowError):
    """Langflow host or configured flow cannot be reached."""

    code = "LANGFLOW_UNAVAILABLE"
    message = "Langflow tidak dapat dihubungi. Periksa koneksi dan alamat server."


class LangflowTimeoutError(LangflowError):
    """Review did not complete within the configured timeout."""

    code = "LANGFLOW_TIMEOUT"
    message = "Review melebihi batas waktu yang ditetapkan. Coba lagi."


class LangflowApprovalRequired(LangflowError):
    """The workflow is suspended until the user decides on a tool request."""

    code = "LANGFLOW_APPROVAL_REQUIRED"

    def __init__(
        self,
        workflow_job_id: str,
        request_id: str,
        prompt: str,
        options: list[ApprovalOption],
    ) -> None:
        self.workflow_job_id = workflow_job_id
        self.request_id = request_id
        self.prompt = prompt
        self.options = options
        super().__init__(prompt)


class LangflowAPIError(LangflowError):
    """Langflow accepted the connection but rejected or failed the operation."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


class LangflowClient:
    """Async client for the configured Langflow workflow."""

    def __init__(
        self,
        settings: Settings,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._mock = settings.langflow_mock
        self._http_client = http_client

    async def run_review(
        self,
        input_text: str,
        *,
        workflow_job_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> str:
        """Start or continue a v2 workflow and return its final text output."""
        if self._mock:
            logger.info('"event":"langflow_mock_used"')
            return (
                "SIMULASI: LANGFLOW_MOCK aktif. Dokumen tidak dianalisis dan "
                "hasil review nyata tidak tersedia. Atur LANGFLOW_MOCK=false "
                "dan hubungkan Langflow untuk menjalankan review sebenarnya."
            )

        if workflow_job_id is None:
            workflow_job_id = await self._start_workflow(input_text, idempotency_key)

        return await self._wait_for_workflow(workflow_job_id)

    async def resume_review(
        self,
        workflow_job_id: str,
        request_id: str,
        action_id: str,
    ) -> None:
        """Resume a suspended workflow with the user's explicit decision."""
        url = (
            f"{self._settings.langflow_base_url.rstrip('/')}"
            f"/api/v2/workflows/{quote(workflow_job_id, safe='')}/resume"
        )
        await self._request_json(
            "POST",
            url,
            {
                "request_id": request_id,
                "decision": {"action_id": action_id},
            },
        )

    async def _start_workflow(
        self,
        input_text: str,
        idempotency_key: str | None,
    ) -> str:
        url = f"{self._settings.langflow_base_url.rstrip('/')}/api/v2/workflows"
        payload: dict[str, object] = {
            "flow_id": self._settings.langflow_flow5_id,
            "input_value": input_text,
            "mode": "background",
        }
        if idempotency_key:
            payload["idempotency_key"] = idempotency_key

        data = await self._request_json("POST", url, payload)
        if not isinstance(data, dict):
            raise LangflowAPIError(
                "LANGFLOW_INVALID_RESPONSE",
                "Langflow mengembalikan format respons workflow yang tidak didukung.",
            )
        job_id = data.get("job_id")
        if not isinstance(job_id, str) or not job_id:
            raise LangflowAPIError(
                "LANGFLOW_INVALID_RESPONSE",
                "Langflow tidak mengembalikan ID untuk proses review.",
            )
        return job_id

    async def _wait_for_workflow(self, workflow_job_id: str) -> str:
        base_url = self._settings.langflow_base_url.rstrip("/")
        status_url = f"{base_url}/api/v2/workflows?job_id={quote(workflow_job_id, safe='')}"
        deadline = time.monotonic() + self._settings.review_timeout_seconds

        while time.monotonic() < deadline:
            try:
                data = await self._request_json("GET", status_url)
                if not isinstance(data, dict):
                    raise LangflowAPIError(
                        "LANGFLOW_INVALID_RESPONSE",
                        "Langflow mengembalikan format status workflow yang tidak didukung.",
                    )
            except LangflowAPIError as exc:
                if exc.code != "LANGFLOW_SERVER_ERROR":
                    raise
                detail = await self._workflow_event_error(
                    workflow_job_id,
                    base_url,
                )
                if self._is_rate_limited(detail):
                    raise LangflowAPIError(
                        "LANGFLOW_RATE_LIMIT",
                        "Kuota model Langflow terlampaui. Periksa kuota dan billing provider model.",
                    ) from exc
                raise LangflowAPIError(
                    "LANGFLOW_SERVER_ERROR",
                    "Langflow gagal mengambil status workflow. Periksa log Langflow.",
                ) from exc
            status = data.get("status")

            if status == "suspended":
                raise await self._approval_required(workflow_job_id)
            if status == "completed":
                return self._extract_v2_text(data)
            if status in {"failed", "timed_out", "cancelled"}:
                detail = self._workflow_error(data)
                if self._is_rate_limited(detail):
                    raise LangflowAPIError(
                        "LANGFLOW_RATE_LIMIT",
                        "Kuota model Langflow terlampaui. Periksa kuota dan billing provider model.",
                    )
                raise LangflowAPIError(
                    "LANGFLOW_WORKFLOW_FAILED",
                    f"Workflow Langflow gagal: {detail}" if detail else
                    "Workflow Langflow gagal sebelum menghasilkan review.",
                )
            if status not in {"queued", "in_progress", "resuming"}:
                raise LangflowAPIError(
                    "LANGFLOW_INVALID_RESPONSE",
                    "Langflow mengembalikan status workflow yang tidak dikenal.",
                )

            await asyncio.sleep(1)

        raise LangflowTimeoutError()

    async def _workflow_event_error(self, workflow_job_id: str, base_url: str) -> str:
        """Use replayable workflow events when the status endpoint itself fails."""
        url = (
            f"{base_url}/api/v2/workflows/"
            f"{quote(workflow_job_id, safe='')}/events"
        )
        headers = {"x-api-key": self._settings.langflow_api_key}
        try:
            if self._http_client is not None:
                response = await self._http_client.get(url, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.get(url, headers=headers)
        except httpx.HTTPError:
            return ""
        if not response.is_success:
            return ""

        for line in response.text.splitlines():
            if not line.startswith("data: "):
                continue
            try:
                event = json.loads(line[6:])
            except ValueError:
                continue
            if not isinstance(event, dict) or event.get("event") != "error":
                continue
            event_data = event.get("data")
            if isinstance(event_data, dict):
                detail = event_data.get("text") or event_data.get("message")
                if isinstance(detail, str):
                    return detail[:1000]
        return ""

    async def _approval_required(self, workflow_job_id: str) -> LangflowApprovalRequired:
        url = (
            f"{self._settings.langflow_base_url.rstrip('/')}"
            f"/api/v2/workflows/pending?flow_id="
            f"{quote(self._settings.langflow_flow5_id, safe='')}"
        )
        data = await self._request_json("GET", url)
        pending: list[object]
        if isinstance(data, list):
            pending = data
        else:
            pending_value = data.get("pending")
            pending = pending_value if isinstance(pending_value, list) else []

        for item in pending:
            if not isinstance(item, dict) or item.get("job_id") != workflow_job_id:
                continue
            request_id = item.get("request_id")
            if not isinstance(request_id, str) or not request_id:
                break
            prompt = item.get("prompt")
            prompt_text = prompt if isinstance(prompt, str) else "Langflow meminta persetujuan tool."
            prompt_text = re.split(r"\n\s*Args\s*:", prompt_text, maxsplit=1)[0].strip()
            options = item.get("options")
            safe_options: list[ApprovalOption] = []
            if isinstance(options, list):
                for option in options:
                    if (
                        isinstance(option, dict)
                        and isinstance(option.get("action_id"), str)
                        and isinstance(option.get("label"), str)
                    ):
                        safe_options.append(
                            {
                                "action_id": option["action_id"],
                                "label": option["label"],
                            }
                        )
            if not safe_options:
                safe_options = [
                    {"action_id": "approve", "label": "Setujui"},
                    {"action_id": "reject", "label": "Tolak"},
                ]
            return LangflowApprovalRequired(
                workflow_job_id,
                request_id,
                prompt_text or "Langflow meminta persetujuan tool.",
                safe_options,
            )

        raise LangflowAPIError(
            "LANGFLOW_APPROVAL_UNAVAILABLE",
            "Workflow menunggu persetujuan, tetapi detail permintaan tidak ditemukan.",
        )

    async def _request_json(
        self,
        method: str,
        url: str,
        payload: dict[str, object] | None = None,
    ) -> dict[str, object] | list[object]:
        headers = {"x-api-key": self._settings.langflow_api_key}
        try:
            if self._http_client is not None:
                response = await self._http_client.request(
                    method, url, json=payload, headers=headers
                )
            else:
                timeout = httpx.Timeout(self._settings.review_timeout_seconds)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.request(
                        method, url, json=payload, headers=headers
                    )
        except httpx.TimeoutException as exc:
            raise LangflowTimeoutError() from exc
        except httpx.RequestError as exc:
            logger.error(
                '"event":"langflow_request_failed","error_type":"%s"',
                type(exc).__name__,
            )
            raise LangflowUnavailableError() from exc

        if not response.is_success:
            detail = self._response_detail(response)
            if response.status_code == 429 or self._is_rate_limited(detail):
                raise LangflowAPIError(
                    "LANGFLOW_RATE_LIMIT",
                    "Kuota model Langflow terlampaui. Periksa kuota dan billing provider model.",
                )
            if response.status_code in {401, 403}:
                raise LangflowAPIError(
                    "LANGFLOW_AUTH_ERROR",
                    "Langflow menolak API key. Periksa LANGFLOW_API_KEY.",
                )
            if response.status_code == 404:
                raise LangflowAPIError(
                    "LANGFLOW_FLOW_NOT_FOUND",
                    "Flow Langflow tidak ditemukan. Periksa LANGFLOW_FLOW5_ID.",
                )
            if response.status_code >= 500:
                raise LangflowAPIError(
                    "LANGFLOW_SERVER_ERROR",
                    f"Server Langflow mengalami kesalahan (HTTP {response.status_code}).",
                )
            raise LangflowAPIError(
                "LANGFLOW_REQUEST_REJECTED",
                f"Langflow menolak request (HTTP {response.status_code}): {detail}",
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise LangflowAPIError(
                "LANGFLOW_INVALID_RESPONSE",
                "Langflow mengembalikan respons yang bukan JSON valid.",
            ) from exc
        if not isinstance(data, dict | list):
            raise LangflowAPIError(
                "LANGFLOW_INVALID_RESPONSE",
                "Langflow mengembalikan format respons yang tidak didukung.",
            )
        return data

    @staticmethod
    def _response_detail(response: httpx.Response) -> str:
        try:
            data = response.json()
        except ValueError:
            return response.text[:500] or "tidak ada detail dari server"
        if isinstance(data, dict):
            detail = data.get("detail") or data.get("message") or data.get("error")
            if isinstance(detail, str):
                return detail[:500]
        return "tidak ada detail dari server"

    @staticmethod
    def _workflow_error(data: dict[str, object]) -> str:
        errors = data.get("errors")
        if isinstance(errors, list):
            messages = [
                str(item.get("error"))
                for item in errors
                if isinstance(item, dict) and item.get("error")
            ]
            if messages:
                return "; ".join(messages)[:500]
        return ""

    @staticmethod
    def _is_rate_limited(detail: str) -> bool:
        lowered = detail.lower()
        return "429" in lowered or "quota exceeded" in lowered or "too many requests" in lowered

    @staticmethod
    def _extract_v2_text(data: dict[str, object]) -> str:
        output = data.get("output")
        if isinstance(output, dict):
            text = output.get("text")
            if isinstance(text, str) and text.strip():
                return text

        outputs = data.get("outputs")
        if isinstance(outputs, dict):
            for item in outputs.values():
                if not isinstance(item, dict):
                    continue
                content = item.get("content")
                if isinstance(content, str) and content.strip():
                    return content
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict):
                            text = block.get("text")
                            if isinstance(text, str) and text.strip():
                                return text

        raise LangflowAPIError(
            "LANGFLOW_EMPTY_OUTPUT",
            "Workflow Langflow selesai, tetapi tidak mengembalikan teks hasil review.",
        )


class LangflowMCPClient:
    """MCP client that runs the configured reviewer tools strictly in sequence."""

    _reviewers = (
        ("assess_proposal_feasibility", "METODOLOGI"),
        ("analyze_originality", "ORISINALITAS"),
        ("propose_proposal_revision", "REVISI"),
    )
    _protocol_version = "2025-03-26"

    def __init__(
        self,
        settings: Settings,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._http_client = http_client

    async def run_review(
        self,
        input_text: str,
        *,
        workflow_job_id: str | None = None,
        idempotency_key: str | None = None,
        progress_callback: Callable[[str, str], Awaitable[None]] | None = None,
    ) -> str:
        del workflow_job_id
        if self._settings.langflow_mock:
            return (
                "SIMULASI: LANGFLOW_MOCK aktif. Dokumen tidak dianalisis dan "
                "hasil review nyata tidak tersedia."
            )
        if not self._settings.langflow_mcp_url:
            raise LangflowAPIError(
                "LANGFLOW_MCP_NOT_CONFIGURED",
                "Alamat MCP Langflow belum dikonfigurasi. Atur LANGFLOW_MCP_URL.",
            )

        try:
            async with asyncio.timeout(self._settings.review_timeout_seconds):
                if self._http_client is not None:
                    return await self._run_sequential(
                        self._http_client,
                        input_text,
                        idempotency_key or str(uuid4()),
                        progress_callback,
                    )

                timeout = httpx.Timeout(self._settings.review_timeout_seconds)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    return await self._run_sequential(
                        client,
                        input_text,
                        idempotency_key or str(uuid4()),
                        progress_callback,
                    )
        except TimeoutError as exc:
            raise LangflowTimeoutError() from exc

    async def probe(self) -> None:
        """Verify MCP connectivity and that the expected reviewer tools exist."""
        if not self._settings.langflow_mcp_url:
            raise LangflowAPIError(
                "LANGFLOW_MCP_NOT_CONFIGURED",
                "Alamat MCP Langflow belum dikonfigurasi. Atur LANGFLOW_MCP_URL.",
            )

        if self._http_client is not None:
            await self._initialize_and_list_tools(self._http_client)
            return

        async with httpx.AsyncClient(timeout=5.0) as client:
            await self._initialize_and_list_tools(client)

    async def _run_sequential(
        self,
        client: httpx.AsyncClient,
        input_text: str,
        conversation_id: str,
        progress_callback: Callable[[str, str], Awaitable[None]] | None,
    ) -> str:
        session_id = await self._initialize_and_list_tools(client)

        outputs: list[str] = []
        try:
            for request_id, (tool_name, reviewer) in enumerate(self._reviewers, start=3):
                if progress_callback:
                    await progress_callback("started", reviewer)
                result, session_id = await self._rpc(
                    client,
                    session_id,
                    "tools/call",
                    {
                        "name": tool_name,
                        "arguments": {
                            "input_value": input_text,
                            "session_id": conversation_id,
                        },
                    },
                    request_id=request_id,
                )
                outputs.append(
                    f"===== REVIEWER: {reviewer} =====\n{self._tool_text(result)}"
                )
                if progress_callback:
                    await progress_callback("completed", reviewer)
        except (LangflowError, TimeoutError) as exc:
            if isinstance(exc, TimeoutError):
                error: LangflowError = LangflowTimeoutError()
            else:
                error = exc
            if isinstance(exc, LangflowError):
                attempted = self._reviewers[len(outputs)][1]
                outputs.append(f"===== REVIEWER: {attempted} =====\nError: {exc.message}")

            error.partial_output = "\n\n".join(outputs)
            if error is not exc:
                raise error from exc
            raise

        from .orchestrator import format_orchestrated_report

        reviewer_map = {}
        for out in outputs:
            for rev in ["METODOLOGI", "ORISINALITAS", "REVISI"]:
                if f"===== REVIEWER: {rev} =====" in out:
                    content = out.split(f"===== REVIEWER: {rev} =====", 1)[1].strip()
                    reviewer_map[rev] = content

        return format_orchestrated_report(reviewer_map)

    async def _initialize_and_list_tools(
        self,
        client: httpx.AsyncClient,
    ) -> str | None:
        _, session_id = await self._rpc(
            client,
            None,
            "initialize",
            {
                "protocolVersion": self._protocol_version,
                "capabilities": {},
                "clientInfo": {"name": "dewan-penilai-proposal", "version": "1.0"},
            },
            request_id=1,
        )
        await self._notify_initialized(client, session_id)
        tools_response, session_id = await self._rpc(
            client,
            session_id,
            "tools/list",
            {},
            request_id=2,
        )
        tools = tools_response.get("tools")
        if not isinstance(tools, list):
            raise LangflowAPIError(
                "LANGFLOW_MCP_INVALID_RESPONSE",
                "MCP Langflow tidak mengembalikan daftar tool yang valid.",
            )
        available = {
            tool.get("name")
            for tool in tools
            if isinstance(tool, dict) and isinstance(tool.get("name"), str)
        }
        missing = [name for name, _ in self._reviewers if name not in available]
        if missing:
            raise LangflowAPIError(
                "LANGFLOW_MCP_TOOLS_MISSING",
                f"Tool reviewer tidak tersedia di MCP Langflow: {', '.join(missing)}.",
            )
        return session_id

    async def _notify_initialized(
        self,
        client: httpx.AsyncClient,
        session_id: str | None,
    ) -> None:
        headers = self._headers(session_id)
        try:
            response = await client.post(
                self._settings.langflow_mcp_url,
                headers=headers,
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            )
        except httpx.TimeoutException as exc:
            raise LangflowTimeoutError() from exc
        except httpx.RequestError as exc:
            raise LangflowUnavailableError() from exc
        if not response.is_success and response.status_code != 202:
            self._raise_http_error(response)

    async def _rpc(
        self,
        client: httpx.AsyncClient,
        session_id: str | None,
        method: str,
        params: dict[str, object],
        *,
        request_id: int = 3,
    ) -> tuple[dict[str, object], str | None]:
        try:
            response = await client.post(
                self._settings.langflow_mcp_url,
                headers=self._headers(session_id),
                json={
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "method": method,
                    "params": params,
                },
            )
        except httpx.TimeoutException as exc:
            raise LangflowTimeoutError() from exc
        except httpx.RequestError as exc:
            logger.error(
                '"event":"langflow_mcp_request_failed","error_type":"%s"',
                type(exc).__name__,
            )
            raise LangflowUnavailableError() from exc

        if not response.is_success:
            self._raise_http_error(response)

        updated_session_id = response.headers.get("mcp-session-id", session_id)
        messages = self._response_messages(response)
        rpc_response = next(
            (
                message
                for message in messages
                if message.get("id") == request_id
            ),
            None,
        )
        if rpc_response is None:
            raise LangflowAPIError(
                "LANGFLOW_MCP_INVALID_RESPONSE",
                f"MCP Langflow tidak mengembalikan hasil untuk {method}.",
            )
        error = rpc_response.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            raise LangflowAPIError(
                "LANGFLOW_MCP_TOOL_FAILED",
                str(message) if isinstance(message, str) else "MCP Langflow menolak permintaan.",
            )
        result = rpc_response.get("result")
        if not isinstance(result, dict):
            raise LangflowAPIError(
                "LANGFLOW_MCP_INVALID_RESPONSE",
                "MCP Langflow mengembalikan hasil dengan format yang tidak valid.",
            )
        return result, updated_session_id

    def _headers(self, session_id: str | None) -> dict[str, str]:
        headers = {
            "x-api-key": self._settings.langflow_api_key,
            "Accept": "application/json, text/event-stream",
        }
        if session_id:
            headers["Mcp-Session-Id"] = session_id
        return headers

    @staticmethod
    def _response_messages(response: httpx.Response) -> list[dict[str, object]]:
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            payload = response.json()
            return [payload] if isinstance(payload, dict) else []

        messages: list[dict[str, object]] = []
        for line in response.text.splitlines():
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data:
                continue
            try:
                payload = json.loads(data)
            except ValueError:
                continue
            if isinstance(payload, dict):
                messages.append(payload)
        return messages

    @staticmethod
    def _tool_text(result: dict[str, object]) -> str:
        content = result.get("content")
        text_parts = (
            [
                item["text"]
                for item in content
                if isinstance(item, dict)
                and item.get("type") == "text"
                and isinstance(item.get("text"), str)
            ]
            if isinstance(content, list)
            else []
        )
        detail = "\n".join(text_parts)
        looks_like_error = bool(
            re.match(r"^\s*(?:error\b|failed\b)", detail, re.IGNORECASE)
        )
        if result.get("isError") is True or looks_like_error:
            if LangflowClient._is_rate_limited(detail):
                retry_match = re.search(r"retry in ([^.]+)", detail, re.IGNORECASE)
                retry_hint = f" Langflow menyarankan mencoba lagi dalam {retry_match.group(1)}." if retry_match else ""
                raise LangflowAPIError(
                    "LANGFLOW_RATE_LIMIT",
                    "Kuota model Langflow terlampaui. Periksa kuota/billing Gemini."
                    + retry_hint,
                )
            raise LangflowAPIError(
                "LANGFLOW_MCP_TOOL_FAILED",
                detail[:1000] if detail else "Tool reviewer mengembalikan error.",
            )

        if text_parts:
            return "\n".join(text_parts)

        structured = result.get("structuredContent")
        if isinstance(structured, dict):
            return json.dumps(structured, ensure_ascii=False)
        raise LangflowAPIError(
            "LANGFLOW_MCP_EMPTY_OUTPUT",
            "Tool reviewer selesai tanpa mengembalikan isi review.",
        )

    @staticmethod
    def _raise_http_error(response: httpx.Response) -> None:
        status_code = response.status_code
        if status_code in {401, 403}:
            raise LangflowAPIError(
                "LANGFLOW_AUTH_ERROR",
                "Langflow MCP menolak API key. Periksa LANGFLOW_API_KEY.",
            )
        if status_code == 404:
            raise LangflowAPIError(
                "LANGFLOW_MCP_NOT_FOUND",
                "Endpoint MCP Langflow tidak ditemukan. Periksa LANGFLOW_MCP_URL.",
            )
        if status_code == 429:
            raise LangflowAPIError(
                "LANGFLOW_RATE_LIMIT",
                "Kuota MCP Langflow terlampaui. Periksa log dan kuota provider.",
            )
        raise LangflowAPIError(
            "LANGFLOW_MCP_HTTP_ERROR",
            f"MCP Langflow mengembalikan HTTP {status_code}.",
        )
