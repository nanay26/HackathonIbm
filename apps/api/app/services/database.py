"""
Persistent SQLite Database for Review Jobs and Chat History.

Ensures that all review jobs, results, and chatroom messages are stored permanently
on disk without depending on Langflow server uptime or ephemeral in-memory state.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..models.schemas import (
    ApprovalOption,
    ApprovalRequest,
    JobError,
    JobStatus,
    ParsedReport,
    ReviewJob,
)

logger = logging.getLogger("dewan_penilai.database")

# Default database directory under apps/api/data
DB_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DB_PATH = DB_DIR / "telaah.db"


def get_db_path() -> Path:
    env_path = os.getenv("SQLITE_DB_PATH")
    if env_path:
        return Path(env_path)
    DB_DIR.mkdir(parents=True, exist_ok=True)
    return DB_PATH


def init_db(db_path: Path | None = None) -> None:
    """Initialize database tables for reviews and chat messages."""
    path = db_path or get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS reviews (
                id TEXT PRIMARY KEY,
                doc_type TEXT NOT NULL,
                status TEXT NOT NULL,
                input_chars INTEGER NOT NULL DEFAULT 0,
                conversation_id TEXT,
                title TEXT,
                active_reviewer TEXT,
                completed_reviewers TEXT,
                raw_output TEXT,
                parsed_json TEXT,
                error_code TEXT,
                error_message TEXT,
                approval_json TEXT,
                langflow_job_id TEXT,
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                review_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_quota (
                day TEXT PRIMARY KEY,
                count INTEGER NOT NULL DEFAULT 0
            );
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_conv ON chat_messages(conversation_id, created_at);"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_review ON chat_messages(review_id, created_at);"
        )
        conn.commit()
        logger.info('"event":"db_initialized","path":"%s"', str(path))
    finally:
        conn.close()


class DatabaseManager:
    """Synchronous SQLite helper with thread-safe connection usage."""

    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or get_db_path()
        init_db(self.db_path)

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        return conn

    # ── Review Jobs CRUD ──────────────────────────────────────────────────────

    def save_job(self, job: ReviewJob) -> None:
        conn = self._get_connection()
        try:
            cur = conn.cursor()
            parsed_json = job.parsed.model_dump_json() if job.parsed else None
            completed_json = json.dumps(job.completed_reviewers)
            approval_json = job.approval.model_dump_json() if job.approval else None
            error_code = job.error.code if job.error else None
            error_message = job.error.message if job.error else None

            created_at_str = job.created_at.isoformat()
            started_at_str = job.started_at.isoformat() if job.started_at else None
            finished_at_str = job.finished_at.isoformat() if job.finished_at else None

            cur.execute(
                """
                INSERT INTO reviews (
                    id, doc_type, status, input_chars, conversation_id, title,
                    active_reviewer, completed_reviewers, raw_output, parsed_json,
                    error_code, error_message, approval_json, langflow_job_id,
                    created_at, started_at, finished_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status=excluded.status,
                    active_reviewer=excluded.active_reviewer,
                    completed_reviewers=excluded.completed_reviewers,
                    raw_output=excluded.raw_output,
                    parsed_json=excluded.parsed_json,
                    error_code=excluded.error_code,
                    error_message=excluded.error_message,
                    approval_json=excluded.approval_json,
                    langflow_job_id=excluded.langflow_job_id,
                    started_at=excluded.started_at,
                    finished_at=excluded.finished_at;
                """,
                (
                    job.id,
                    job.doc_type.value,
                    job.status.value,
                    job.input_chars,
                    job.conversation_id or job.id,
                    getattr(job, "title", None) or "Review",
                    job.active_reviewer,
                    completed_json,
                    job.raw_output,
                    parsed_json,
                    error_code,
                    error_message,
                    approval_json,
                    job.langflow_job_id,
                    created_at_str,
                    started_at_str,
                    finished_at_str,
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def get_job(self, job_id: str) -> ReviewJob | None:
        conn = self._get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM reviews WHERE id = ?;", (job_id,))
            row = cur.fetchone()
            if not row:
                return None
            return self._row_to_job(row)
        finally:
            conn.close()

    def list_jobs(self, limit: int = 50) -> list[ReviewJob]:
        conn = self._get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT * FROM reviews ORDER BY created_at DESC LIMIT ?;", (limit,)
            )
            rows = cur.fetchall()
            return [self._row_to_job(r) for r in rows]
        finally:
            conn.close()

    def delete_job(self, job_id: str) -> None:
        conn = self._get_connection()
        try:
            cur = conn.cursor()
            cur.execute("DELETE FROM reviews WHERE id = ?;", (job_id,))
            cur.execute("DELETE FROM chat_messages WHERE review_id = ?;", (job_id,))
            conn.commit()
        finally:
            conn.close()

    def clean_stale_jobs(self) -> int:
        """Mark any lingering running/queued jobs from dead server processes as failed."""
        conn = self._get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE reviews
                SET status = 'failed',
                    error_code = 'SERVER_RESTARTED',
                    error_message = 'Sesi terputus karena server dimulai ulang. Silakan klik coba lagi.'
                WHERE status IN ('running', 'queued');
                """
            )
            count = cur.rowcount
            conn.commit()
            return count
        finally:
            conn.close()

    def count_running_jobs(self) -> int:
        conn = self._get_connection()
        try:
            cur = conn.cursor()
            # Auto-expire zombie jobs running for more than 8 minutes to prevent queue deadlock
            cur.execute(
                """
                UPDATE reviews
                SET status = 'failed',
                    error_code = 'TIMEOUT',
                    error_message = 'Batas waktu telaah terlampaui atau proses server terhenti.'
                WHERE status = 'running'
                  AND (started_at IS NULL OR datetime(started_at) < datetime('now', '-8 minutes'));
                """
            )
            conn.commit()
            cur.execute("SELECT COUNT(*) FROM reviews WHERE status = 'running';")
            row = cur.fetchone()
            return int(row[0]) if row else 0
        finally:
            conn.close()

    def get_daily_count(self) -> int:
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        conn = self._get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT count FROM daily_quota WHERE day = ?;", (today,))
            row = cur.fetchone()
            return int(row[0]) if row else 0
        finally:
            conn.close()

    def increment_daily_count(self) -> None:
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        conn = self._get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO daily_quota (day, count) VALUES (?, 1)
                ON CONFLICT(day) DO UPDATE SET count = count + 1;
                """,
                (today,),
            )
            conn.commit()
        finally:
            conn.close()

    # ── Chat Messages ─────────────────────────────────────────────────────────

    def add_chat_message(
        self,
        review_id: str,
        conversation_id: str,
        role: str,
        content: str,
        msg_id: str | None = None,
    ) -> dict[str, Any]:
        message_id = msg_id or str(uuid.uuid4())
        created_at = datetime.now(UTC).isoformat()
        conn = self._get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO chat_messages (id, review_id, conversation_id, role, content, created_at)
                VALUES (?, ?, ?, ?, ?, ?);
                """,
                (message_id, review_id, conversation_id, role, content, created_at),
            )
            conn.commit()
            return {
                "id": message_id,
                "job_id": message_id,
                "review_id": review_id,
                "conversation_id": conversation_id,
                "role": role,
                "content": content,
                "created_at": created_at,
            }
        finally:
            conn.close()

    def save_chat_message(
        self,
        review_id: str,
        role: str,
        content: str,
        conversation_id: str | None = None,
        msg_id: str | None = None,
    ) -> dict[str, Any]:
        """Convenience alias for add_chat_message."""
        return self.add_chat_message(
            review_id=review_id,
            conversation_id=conversation_id or review_id,
            role=role,
            content=content,
            msg_id=msg_id,
        )

    def get_chat_messages(
        self, conversation_id: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        conn = self._get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, review_id, conversation_id, role, content, created_at
                FROM chat_messages
                WHERE conversation_id = ? OR review_id = ?
                ORDER BY created_at ASC
                LIMIT ?;
                """,
                (conversation_id, conversation_id, limit),
            )
            rows = cur.fetchall()
            return [
                {
                    "id": r["id"],
                    "job_id": r["id"],
                    "review_id": r["review_id"],
                    "conversation_id": r["conversation_id"],
                    "role": r["role"],
                    "content": r["content"],
                    "created_at": r["created_at"],
                }
                for r in rows
            ]
        finally:
            conn.close()

    # ── Deserialization Helper ────────────────────────────────────────────────

    def _row_to_job(self, row: sqlite3.Row) -> ReviewJob:
        completed = []
        if row["completed_reviewers"]:
            try:
                completed = json.loads(row["completed_reviewers"])
            except Exception:
                completed = []

        parsed = None
        if row["parsed_json"]:
            try:
                parsed = ParsedReport.model_validate_json(row["parsed_json"])
            except Exception:
                parsed = None

        error = None
        if row["error_code"] and row["error_message"]:
            error = JobError(code=row["error_code"], message=row["error_message"])

        approval = None
        if row["approval_json"]:
            try:
                approval = ApprovalRequest.model_validate_json(row["approval_json"])
            except Exception:
                approval = None

        created_at = datetime.fromisoformat(row["created_at"])
        started_at = (
            datetime.fromisoformat(row["started_at"]) if row["started_at"] else None
        )
        finished_at = (
            datetime.fromisoformat(row["finished_at"]) if row["finished_at"] else None
        )

        job = ReviewJob(
            id=row["id"],
            doc_type=row["doc_type"],
            status=JobStatus(row["status"]),
            input_chars=row["input_chars"],
            conversation_id=row["conversation_id"],
            active_reviewer=row["active_reviewer"],
            completed_reviewers=completed,
            langflow_job_id=row["langflow_job_id"],
            approval=approval,
            raw_output=row["raw_output"],
            parsed=parsed,
            error=error,
            created_at=created_at,
            started_at=started_at,
            finished_at=finished_at,
        )
        return job
