"""
Persistent JobStore backed by SQLite (with fallback in-memory cache).

Retains review jobs and chat history across server restarts so users can
revisit results and chat transcripts permanently.
"""
from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import UTC

from ..models.schemas import ReviewJob
from .database import DatabaseManager

logger = logging.getLogger("dewan_penilai.job_store")


# ── Abstract interface ─────────────────────────────────────────────────────────

class JobStore(ABC):
    """Interface for review job persistence."""

    @abstractmethod
    async def create(self, job: ReviewJob) -> None: ...

    @abstractmethod
    async def get(self, job_id: str) -> ReviewJob | None: ...

    @abstractmethod
    async def update(self, job: ReviewJob) -> None: ...

    @abstractmethod
    async def delete(self, job_id: str) -> None: ...

    @abstractmethod
    async def count_running(self) -> int: ...

    @abstractmethod
    async def daily_count(self) -> int: ...

    @abstractmethod
    async def increment_daily_count(self) -> None: ...

    def get_db(self) -> DatabaseManager | None:
        """Returns the underlying DatabaseManager if backed by SQLite."""
        return None


# ── SQLite-backed persistent implementation ───────────────────────────────────

class SQLiteJobStore(JobStore):
    """
    Persistent JobStore backed by SQLite.
    Stores jobs, parsed results, and daily quota permanently on disk.
    """

    def __init__(self, db: DatabaseManager | None = None) -> None:
        self._db = db or DatabaseManager()
        self._cache: dict[str, ReviewJob] = {}

    def get_db(self) -> DatabaseManager:
        return self._db

    def start_sweep(self) -> None:
        """Lifecycle hook - no sweep needed for permanent storage."""
        pass

    def stop_sweep(self) -> None:
        """Lifecycle hook."""
        pass

    async def create(self, job: ReviewJob) -> None:
        self._cache[job.id] = job
        self._db.save_job(job)
        logger.info('"event":"job_created_persistent","id":"%s"', job.id)

    async def get(self, job_id: str) -> ReviewJob | None:
        if job_id in self._cache:
            return self._cache[job_id]
        job = self._db.get_job(job_id)
        if job:
            self._cache[job_id] = job
        return job

    async def update(self, job: ReviewJob) -> None:
        self._cache[job.id] = job
        self._db.save_job(job)

    async def delete(self, job_id: str) -> None:
        self._cache.pop(job_id, None)
        self._db.delete_job(job_id)

    async def count_running(self) -> int:
        return self._db.count_running_jobs()

    async def daily_count(self) -> int:
        return self._db.get_daily_count()

    async def increment_daily_count(self) -> None:
        self._db.increment_daily_count()


# ── In-memory implementation (kept for isolated unit tests if needed) ─────────

class InMemoryJobStore(JobStore):
    def __init__(self, ttl_seconds: int = 1800) -> None:
        self._jobs: dict[str, ReviewJob] = {}
        self._ttl = ttl_seconds
        self._daily_count: int = 0
        self._sweep_task: asyncio.Task[None] | None = None

    def start_sweep(self) -> None:
        pass

    def stop_sweep(self) -> None:
        pass

    async def create(self, job: ReviewJob) -> None:
        self._jobs[job.id] = job

    async def get(self, job_id: str) -> ReviewJob | None:
        return self._jobs.get(job_id)

    async def update(self, job: ReviewJob) -> None:
        self._jobs[job.id] = job

    async def delete(self, job_id: str) -> None:
        self._jobs.pop(job_id, None)

    def _evict_expired(self) -> None:
        """Evicts expired jobs for test compatibility."""
        from datetime import datetime
        now = datetime.now(UTC)
        to_delete = []
        for jid, j in self._jobs.items():
            created = j.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            if (now - created).total_seconds() > self._ttl:
                to_delete.append(jid)
        for jid in to_delete:
            del self._jobs[jid]

    async def count_running(self) -> int:
        from ..models.schemas import JobStatus
        return sum(1 for j in self._jobs.values() if j.status == JobStatus.running)

    async def daily_count(self) -> int:
        return self._daily_count

    async def increment_daily_count(self) -> None:
        self._daily_count += 1


# ── Singleton holder ──────────────────────────────────────────────────────────

_store_holder: list[SQLiteJobStore] = []


def get_job_store() -> SQLiteJobStore:
    if not _store_holder:
        _store_holder.append(SQLiteJobStore())
    return _store_holder[0]
