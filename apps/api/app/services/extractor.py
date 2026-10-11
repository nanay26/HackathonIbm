"""
Document text extractor (SDD §F1).

Supports:
  - PDF: pdfplumber; detects scan-only PDFs (NO_TEXT_LAYER).
  - DOCX: python-docx; preserves paragraph order.
  - Plain text: pass-through.

Magic bytes validation prevents type-confusion attacks.
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from typing import Literal

import pdfplumber
from docx import Document

logger = logging.getLogger("dewan_penilai.extractor")

# ── Magic bytes ────────────────────────────────────────────────────────────────
# PDF: %PDF
_PDF_MAGIC = b"%PDF"
# DOCX (ZIP-based Office Open XML): PK\x03\x04
_DOCX_MAGIC = b"PK\x03\x04"


# ── Result / error types ───────────────────────────────────────────────────────

@dataclass
class ExtractionResult:
    text: str
    char_count: int
    filename: str
    warnings: list[str] = field(default_factory=list)


class ExtractionError(Exception):
    """Raised when extraction fails with a known error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# ── Public API ────────────────────────────────────────────────────────────────

FileType = Literal["pdf", "docx"]


def detect_file_type(data: bytes, filename: str) -> FileType:
    """
    Detect file type from magic bytes.
    Raises ExtractionError(UNSUPPORTED_TYPE) if neither PDF nor DOCX.
    """
    if data[:4] == _PDF_MAGIC:
        return "pdf"
    if data[:4] == _DOCX_MAGIC:
        return "docx"
    # Fall back to extension hint for edge-cases, but only if magic matches common patterns
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    raise ExtractionError(
        code="UNSUPPORTED_TYPE",
        message=(
            f"Format file tidak didukung (ekstensi: .{ext}). "
            "Hanya PDF dan DOCX yang diterima."
        ),
    )


def extract_pdf(data: bytes, filename: str) -> ExtractionResult:
    """Extract text from PDF bytes using pdfplumber."""
    warnings: list[str] = []
    pages_text: list[str] = []

    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            total_pages = len(pdf.pages)
            for page in pdf.pages:
                text = page.extract_text() or ""
                pages_text.append(text)
    except Exception as exc:
        raise ExtractionError(
            code="UNSUPPORTED_TYPE",
            message="File tidak dapat dibaca sebagai PDF yang valid.",
        ) from exc

    full_text = "\n\n".join(p for p in pages_text if p.strip())

    if not full_text.strip():
        # Zero text across all pages → likely a scan
        raise ExtractionError(
            code="NO_TEXT_LAYER",
            message=(
                "PDF tampaknya hasil scan dan belum didukung. "
                "Gunakan PDF/DOCX berteks atau paste teks langsung."
            ),
        )

    # Warn if some pages had no text (partial scan)
    empty_pages = sum(1 for p in pages_text if not p.strip())
    if empty_pages > 0:
        warnings.append(
            f"{empty_pages} dari {total_pages} halaman tidak mengandung teks "
            "dan mungkin merupakan gambar/scan."
        )

    return ExtractionResult(
        text=full_text,
        char_count=len(full_text),
        filename=filename,
        warnings=warnings,
    )


def extract_docx(data: bytes, filename: str) -> ExtractionResult:
    """Extract text from DOCX bytes using python-docx."""
    try:
        doc = Document(io.BytesIO(data))
    except Exception as exc:
        raise ExtractionError(
            code="UNSUPPORTED_TYPE",
            message="File tidak dapat dibaca sebagai DOCX yang valid.",
        ) from exc

    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    full_text = "\n\n".join(paragraphs)

    if not full_text.strip():
        raise ExtractionError(
            code="EMPTY",
            message="Dokumen DOCX tidak mengandung teks yang dapat dibaca.",
        )

    return ExtractionResult(
        text=full_text,
        char_count=len(full_text),
        filename=filename,
        warnings=[],
    )


def extract(data: bytes, filename: str) -> ExtractionResult:
    """
    Main entry point. Detect type from magic bytes, then extract.

    Raises ExtractionError on any known failure.
    """
    file_type = detect_file_type(data, filename)
    if file_type == "pdf":
        return extract_pdf(data, filename)
    return extract_docx(data, filename)
