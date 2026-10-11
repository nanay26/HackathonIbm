"""Unit tests for services/extractor.py — AC F1 (Fase 2 DoD)."""
from __future__ import annotations

import io
import pathlib

import pytest
from docx import Document

from app.services.extractor import (
    ExtractionError,
    ExtractionResult,
    detect_file_type,
    extract,
    extract_docx,
    extract_pdf,
)

_FIXTURES = pathlib.Path(__file__).parent / "fixtures"


# ── Helpers ────────────────────────────────────────────────────────────────────

def load_fixture(name: str) -> bytes:
    return (_FIXTURES / name).read_bytes()


def make_docx_bytes(paragraphs: list[str]) -> bytes:
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def make_scan_pdf_bytes() -> bytes:
    """PDF with no text layer (image-only placeholder)."""
    # A valid PDF with an empty content stream — no text operators
    return b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << >> >>
endobj
4 0 obj
<< /Length 0 >>
stream
endstream
endobj
xref
0 5
0000000000 65535 f\x20
0000000009 00000 n\x20
0000000058 00000 n\x20
0000000115 00000 n\x20
0000000243 00000 n\x20
trailer
<< /Size 5 /Root 1 0 R >>
startxref
295
%%EOF"""


# ── detect_file_type ───────────────────────────────────────────────────────────

def test_detect_pdf_magic() -> None:
    assert detect_file_type(b"%PDF-1.4 rest", "doc.pdf") == "pdf"


def test_detect_docx_magic() -> None:
    data = make_docx_bytes(["hello"])
    assert detect_file_type(data, "doc.docx") == "docx"


def test_detect_unsupported_raises() -> None:
    with pytest.raises(ExtractionError) as exc_info:
        detect_file_type(b"\x89PNG\r\n", "image.png")
    assert exc_info.value.code == "UNSUPPORTED_TYPE"


# ── extract_pdf ────────────────────────────────────────────────────────────────

def test_extract_pdf_fixture() -> None:
    """AC F1-1: PDF with text layer → text extracted + char_count."""
    data = load_fixture("sample.pdf")
    result = extract_pdf(data, "sample.pdf")
    assert isinstance(result, ExtractionResult)
    assert "BAB 1" in result.text
    assert result.char_count == len(result.text)
    assert result.filename == "sample.pdf"


def test_extract_pdf_scan_raises_no_text_layer() -> None:
    """AC F1-3: PDF scan (no text layer) → NO_TEXT_LAYER error."""
    data = make_scan_pdf_bytes()
    with pytest.raises(ExtractionError) as exc_info:
        extract_pdf(data, "scan.pdf")
    assert exc_info.value.code == "NO_TEXT_LAYER"


def test_extract_pdf_invalid_bytes_raises() -> None:
    """Non-PDF bytes labelled PDF → UNSUPPORTED_TYPE."""
    with pytest.raises(ExtractionError) as exc_info:
        extract_pdf(b"%PDF-not-a-real-pdf", "fake.pdf")
    assert exc_info.value.code == "UNSUPPORTED_TYPE"


# ── extract_docx ───────────────────────────────────────────────────────────────

def test_extract_docx_fixture() -> None:
    """AC F1-6: DOCX valid → text extracted with correct paragraph order."""
    data = load_fixture("sample.docx")
    result = extract_docx(data, "sample.docx")
    assert "BAB 1" in result.text
    assert "BAB 2" in result.text
    # Paragraph order: BAB 1 must come before BAB 2
    assert result.text.index("BAB 1") < result.text.index("BAB 2")
    assert result.char_count == len(result.text)


def test_extract_docx_preserves_paragraph_order() -> None:
    paras = ["Paragraf A", "Paragraf B", "Paragraf C"]
    data = make_docx_bytes(paras)
    result = extract_docx(data, "test.docx")
    idx_a = result.text.index("Paragraf A")
    idx_b = result.text.index("Paragraf B")
    idx_c = result.text.index("Paragraf C")
    assert idx_a < idx_b < idx_c


def test_extract_docx_empty_raises() -> None:
    data = make_docx_bytes([])  # empty document
    with pytest.raises(ExtractionError) as exc_info:
        extract_docx(data, "empty.docx")
    assert exc_info.value.code == "EMPTY"


def test_extract_docx_invalid_bytes_raises() -> None:
    with pytest.raises(ExtractionError) as exc_info:
        extract_docx(b"not a docx", "fake.docx")
    assert exc_info.value.code == "UNSUPPORTED_TYPE"


# ── extract (main entry point) ─────────────────────────────────────────────────

def test_extract_routes_pdf() -> None:
    data = load_fixture("sample.pdf")
    result = extract(data, "sample.pdf")
    assert result.char_count > 0


def test_extract_routes_docx() -> None:
    data = load_fixture("sample.docx")
    result = extract(data, "sample.docx")
    assert result.char_count > 0


def test_extract_unsupported_type_raises() -> None:
    with pytest.raises(ExtractionError) as exc_info:
        extract(b"GIF89a...", "image.gif")
    assert exc_info.value.code == "UNSUPPORTED_TYPE"
