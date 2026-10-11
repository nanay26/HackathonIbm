"""Tests for GET /api/v1/health — Fase 0 DoD §3."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app import routers
from app.config import Settings
from app.main import app
from app.services.langflow_client import (
    LangflowAPIError,
    LangflowMCPClient,
    LangflowUnavailableError,
)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(
        routers.health,
        "get_settings",
        lambda: Settings(langflow_mock=True),
    )
    return TestClient(app, raise_server_exceptions=False)


def test_health_returns_200(client: TestClient) -> None:
    assert client.get("/api/v1/health").status_code == 200


def test_health_body_has_required_fields(client: TestClient) -> None:
    data = client.get("/api/v1/health").json()
    assert "langflow" in data


def test_health_status_ok(client: TestClient) -> None:
    assert client.get("/api/v1/health").json()["status"] == "ok"


def test_health_langflow_field_valid_values(client: TestClient) -> None:
    assert client.get("/api/v1/health").json()["langflow"] in {
        "reachable",
        "unreachable",
        "mock",
    }


async def test_health_reports_mcp_reachable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        routers.health,
        "get_settings",
        lambda: Settings(langflow_mcp_url="http://langflow-test.example/mcp"),
    )
    probe = AsyncMock()
    monkeypatch.setattr(LangflowMCPClient, "probe", probe)

    response = await routers.health.health()

    data = json.loads(response.body)
    assert data["langflow"] == "reachable"
    assert data["langflow_http_status"] == 200
    assert data["langflow_error"] is None
    probe.assert_awaited_once()


async def test_health_reports_mcp_unreachable_on_connection_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        routers.health,
        "get_settings",
        lambda: Settings(langflow_mcp_url="http://langflow-test.example/mcp"),
    )
    probe = AsyncMock(side_effect=LangflowUnavailableError())
    monkeypatch.setattr(LangflowMCPClient, "probe", probe)

    response = await routers.health.health()

    data = json.loads(response.body)
    assert response.status_code == 200
    assert data["langflow"] == "unreachable"
    assert "koneksi" in data["langflow_error"].lower()


async def test_health_explains_invalid_mcp_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        routers.health,
        "get_settings",
        lambda: Settings(langflow_mcp_url="http://langflow-test.example/mcp"),
    )
    probe = AsyncMock(
        side_effect=LangflowAPIError(
            "LANGFLOW_AUTH_ERROR",
            "Langflow MCP menolak API key. Periksa LANGFLOW_API_KEY.",
        )
    )
    monkeypatch.setattr(LangflowMCPClient, "probe", probe)

    response = await routers.health.health()

    data = json.loads(response.body)
    assert data["langflow"] == "unreachable"
    assert data["langflow_http_status"] is None
    assert "LANGFLOW_API_KEY" in data["langflow_error"]
