"""Integration tests for POST /api/v1/documents/extract (Fase 2 DoD)."""
from __future__ import annotations

import io
import pathlib

from docx import Document
from fastapi.testclient import TestClient

from app.main import app

_FIXTURES = pathlib.Path(__file__).parent / "fixtures"

client = TestClient(app, raise_server_exceptions=False)


def load_fixture(name: str) -> bytes:
    return (_FIXTURES / name).read_bytes()


def make_docx_bytes(paragraphs: list[str]) -> bytes:
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ── Happy paths ────────────────────────────────────────────────────────────────

def test_extract_pdf_returns_200_with_text() -> None:
    """AC F1-1: PDF with text layer ≤ 10 MB → 200 + text + char_count."""
    data = load_fixture("sample.pdf")
    resp = client.post(
        "/api/v1/documents/extract",
        files={"file": ("sample.pdf", data, "application/pdf")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "text" in body
    assert body["char_count"] == len(body["text"])
    assert body["filename"] == "sample.pdf"
    assert isinstance(body["warnings"], list)


def test_extract_docx_returns_200_with_text() -> None:
    """AC F1-6: DOCX valid → 200 + correct paragraph order."""
    data = load_fixture("sample.docx")
    resp = client.post(
        "/api/v1/documents/extract",
        files={"file": ("sample.docx", data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "BAB 1" in body["text"]
    assert "BAB 2" in body["text"]


# ── Error paths ────────────────────────────────────────────────────────────────

def test_extract_file_too_large_returns_400() -> None:
    """AC F1-2: file > 10 MB → FILE_TOO_LARGE."""
    # 10 MB + 1 byte of fake PDF content
    big_data = b"%PDF" + b"x" * (10 * 1024 * 1024 + 1)
    resp = client.post(
        "/api/v1/documents/extract",
        files={"file": ("big.pdf", big_data, "application/pdf")},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "FILE_TOO_LARGE"


def test_extract_unsupported_type_returns_400() -> None:
    """AC F1-2: non-PDF/DOCX → UNSUPPORTED_TYPE."""
    resp = client.post(
        "/api/v1/documents/extract",
        files={"file": ("image.png", b"\x89PNG\r\n", "image/png")},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "UNSUPPORTED_TYPE"


def test_extract_scan_pdf_returns_400() -> None:
    """AC F1-3: scan PDF (no text) → NO_TEXT_LAYER."""
    scan_pdf = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<<>>>>endobj
4 0 obj<</Length 0>>stream
endstream
endobj
xref
0 5
0000000000 65535 f\x20
0000000009 00000 n\x20
0000000058 00000 n\x20
0000000115 00000 n\x20
0000000243 00000 n\x20
trailer<</Size 5/Root 1 0 R>>
startxref
295
%%EOF"""
    resp = client.post(
        "/api/v1/documents/extract",
        files={"file": ("scan.pdf", scan_pdf, "application/pdf")},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "NO_TEXT_LAYER"


def test_extract_empty_docx_returns_400() -> None:
    """Empty DOCX → EMPTY."""
    data = make_docx_bytes([])
    resp = client.post(
        "/api/v1/documents/extract",
        files={"file": ("empty.docx", data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "EMPTY"


def test_extract_error_format_is_uniform() -> None:
    """Error body must match {error:{code, message}} contract."""
    resp = client.post(
        "/api/v1/documents/extract",
        files={"file": ("x.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert "error" in body
    assert "code" in body["error"]
    assert "message" in body["error"]
