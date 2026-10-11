"""
Rate limiting and global daily quota (SDD §F2, §8.1).

Per-IP limits  : RATE_LIMIT_HOURLY / RATE_LIMIT_DAILY  (via slowapi)
Global quota   : GLOBAL_DAILY_REVIEW_CAP  (in-memory counter in JobStore)
"""
from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from .config import get_settings


def _key_func(request: Request) -> str:
    """Use remote IP as the rate-limit key."""
    return get_remote_address(request)


def _build_limit_string() -> str:
    """Construct slowapi limit string from env config."""
    s = get_settings()
    return f"{s.rate_limit_hourly}/hour;{s.rate_limit_daily}/day"


limiter = Limiter(key_func=_key_func, default_limits=[_build_limit_string()])
