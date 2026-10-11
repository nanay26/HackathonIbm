"""Pydantic v2 schemas for Telaah API (SDD §7)."""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

# ── Enums ──────────────────────────────────────────────────────────────────────

class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    awaiting_approval = "awaiting_approval"
    done = "done"
    failed = "failed"
    timeout = "timeout"
    cancelled = "cancelled"


class ReviewerKey(str, Enum):
    metodologi = "metodologi"
    orisinalitas = "orisinalitas"
    revisi = "revisi"


class ReviewerStatus(str, Enum):
    ok = "ok"
    failed = "failed"
    missing = "missing"


class DebateType(str, Enum):
    kontradiksi = "KONTRADIKSI"
    penguatan_silang = "PENGUATAN_SILANG"
    isu_unik = "ISU_UNIK"


class DocType(str, Enum):
    proposal_skripsi = "proposal_skripsi"


# ── Sub-models ─────────────────────────────────────────────────────────────────

class Finding(BaseModel):
    """Single numbered finding inside a reviewer section (SDD §7.4)."""
    no: int
    aspect: str
    description: str
    reference: str | None = None  # None → displayed as "Tanpa rujukan"


class ReviewerResult(BaseModel):
    """Result for one of the three reviewer agents (SDD §7.3)."""
    key: ReviewerKey
    status: ReviewerStatus
    verdict: str = ""
    summary: str = ""
    findings: list[Finding] = Field(default_factory=list)
    priority_recommendations: list[str] = Field(default_factory=list)


class DebatePoint(BaseModel):
    """Cross-reviewer debate point (SDD §7.5)."""
    type: DebateType
    aspect: str
    description: str
    reviewers: list[str] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)


class ParsedReport(BaseModel):
    """Structured result parsed from raw Flow 5 output (SDD §7.2)."""
    parse_ok: bool
    reviewers: list[ReviewerResult] = Field(default_factory=list)
    debate_points: list[DebatePoint] = Field(default_factory=list)


# ── Job model ──────────────────────────────────────────────────────────────────

class ReviewJob(BaseModel):
    """In-memory job record (SDD §7.1)."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    doc_type: DocType = DocType.proposal_skripsi
    status: JobStatus = JobStatus.queued
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    input_chars: int = 0
    conversation_id: str | None = None
    active_reviewer: str | None = None
    completed_reviewers: list[str] = Field(default_factory=list)
    langflow_job_id: str | None = None
    approval: ApprovalRequest | None = None
    # input_text is NOT stored in this model after the job terminates (SDD §2.2.5)
    raw_output: str | None = None
    parsed: ParsedReport | None = None
    error: JobError | None = None


class JobError(BaseModel):
    """Structured error attached to a failed/timed-out job."""
    code: str
    message: str


class ApprovalOption(BaseModel):
    action_id: str
    label: str


class ApprovalRequest(BaseModel):
    request_id: str
    prompt: str
    options: list[ApprovalOption] = Field(default_factory=list)


# Resolve forward reference
ReviewJob.model_rebuild()


# ── API request / response bodies ─────────────────────────────────────────────

class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=10_000)


class ChatMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=10_000)


class CreateReviewRequest(BaseModel):
    doc_type: DocType
    text: str
    conversation_id: str | None = None
    history: list[ConversationMessage] = Field(default_factory=list, max_length=12)


class RetryReviewRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500_000)


class ReviewApprovalRequest(BaseModel):
    action_id: str = Field(min_length=1, max_length=100)


class CreateReviewResponse(BaseModel):
    review_id: str


class ReviewStatusResponse(BaseModel):
    status: JobStatus
    elapsed_seconds: float
    retry_available: bool = False
    active_reviewer: str | None = None
    completed_reviewers: list[str] = Field(default_factory=list)
    approval: ApprovalRequest | None = None
    result: ParsedReport | None = None
    raw_output: str | None = None
    error: JobError | None = None


class ExtractResponse(BaseModel):
    text: str
    char_count: int
    filename: str
    warnings: list[str] = Field(default_factory=list)


class ApiErrorDetail(BaseModel):
    code: str
    message: str


class ApiErrorResponse(BaseModel):
    error: ApiErrorDetail
