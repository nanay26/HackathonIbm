"""Unit tests for InMemoryJobStore + TTL (Fase 1 DoD)."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.models.schemas import JobStatus, ReviewJob
from app.services.job_store import InMemoryJobStore


@pytest.fixture
def store() -> InMemoryJobStore:
    return InMemoryJobStore(ttl_seconds=10)


@pytest.fixture
def sample_job() -> ReviewJob:
    return ReviewJob(input_chars=5000)


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def test_create_and_get(store: InMemoryJobStore, sample_job: ReviewJob) -> None:
    await store.create(sample_job)
    retrieved = await store.get(sample_job.id)
    assert retrieved is not None
    assert retrieved.id == sample_job.id


async def test_get_missing_returns_none(store: InMemoryJobStore) -> None:
    result = await store.get("nonexistent-id")
    assert result is None


async def test_update_job_status(store: InMemoryJobStore, sample_job: ReviewJob) -> None:
    await store.create(sample_job)
    sample_job.status = JobStatus.running
    await store.update(sample_job)
    updated = await store.get(sample_job.id)
    assert updated is not None
    assert updated.status == JobStatus.running


async def test_delete_job(store: InMemoryJobStore, sample_job: ReviewJob) -> None:
    await store.create(sample_job)
    await store.delete(sample_job.id)
    assert await store.get(sample_job.id) is None


async def test_delete_nonexistent_is_noop(store: InMemoryJobStore) -> None:
    # Should not raise
    await store.delete("no-such-id")


# ── Concurrency counter ────────────────────────────────────────────────────────

async def test_count_running_zero_initially(store: InMemoryJobStore) -> None:
    assert await store.count_running() == 0


async def test_count_running_increments(store: InMemoryJobStore) -> None:
    job1 = ReviewJob(input_chars=100)
    job2 = ReviewJob(input_chars=200)
    job1.status = JobStatus.running
    job2.status = JobStatus.running
    await store.create(job1)
    await store.create(job2)
    assert await store.count_running() == 2


async def test_count_running_excludes_done(store: InMemoryJobStore) -> None:
    job = ReviewJob(input_chars=100)
    job.status = JobStatus.done
    await store.create(job)
    assert await store.count_running() == 0


# ── Daily quota counter ────────────────────────────────────────────────────────

async def test_daily_count_starts_zero(store: InMemoryJobStore) -> None:
    assert await store.daily_count() == 0


async def test_daily_count_increments(store: InMemoryJobStore) -> None:
    await store.increment_daily_count()
    await store.increment_daily_count()
    assert await store.daily_count() == 2


# ── TTL eviction ───────────────────────────────────────────────────────────────

async def test_evict_expired_removes_old_job(store: InMemoryJobStore) -> None:
    job = ReviewJob(input_chars=100)
    # Back-date creation time so it's past TTL
    job.created_at = datetime.now(UTC) - timedelta(seconds=20)
    await store.create(job)
    # Manually trigger eviction
    store._evict_expired()
    assert await store.get(job.id) is None


async def test_evict_does_not_remove_fresh_job(store: InMemoryJobStore) -> None:
    job = ReviewJob(input_chars=100)
    await store.create(job)
    store._evict_expired()
    assert await store.get(job.id) is not None
