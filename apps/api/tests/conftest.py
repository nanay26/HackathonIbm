"""
Shared pytest fixtures and configuration.

Resets the slowapi in-memory storage before each test to avoid
rate-limit bleed-over between tests using the same TestClient.
"""
from __future__ import annotations

import pytest

from app.limits import limiter


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> None:
    """Clear slowapi storage before each test."""
    storage = getattr(limiter, "_storage", None)
    if storage is not None and hasattr(storage, "reset"):
        storage.reset()  # type: ignore[attr-defined]
