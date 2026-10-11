"""
Parser for Flow 5 (Full Review Orchestrator) raw text output.

Spec (SDD §11.1, CATATAN PENTING):
  Structure per reviewer section:
    ===== REVIEWER: <KEY> =====
    VERDICT: <text>
    RINGKASAN:
    <multiline>
    TEMUAN:
    N. [ASPEK: <aspect>]
       <description multiline>
       Rujukan: <text>   ← may be absent (→ reference=None, tagged "Tanpa rujukan")
    REKOMENDASI PRIORITAS:
    N. <text>
    ===== TITIK PERDEBATAN =====
    N. [ASPEK TERKAIT: <aspect>]
       Jenis: KONTRADIKSI | PENGUATAN SILANG | ISU UNIK
       - Reviewer ...: <text>
       Implikasi: <text>

Parser is TOLERANT:
  - If the whole format is unrecognised → parse_ok=False, reviewers=[], debate_points=[].
  - If a reviewer section is partially malformed → ReviewerResult(status=failed/missing).
  - Rujukan lines are NEVER dropped/modified.
"""
from __future__ import annotations

import logging
import re
from typing import Final

from ..models.schemas import (
    DebatePoint,
    DebateType,
    Finding,
    ParsedReport,
    ReviewerKey,
    ReviewerResult,
    ReviewerStatus,
)

logger = logging.getLogger("dewan_penilai.parser")

# ── Constants ──────────────────────────────────────────────────────────────────

REVIEWER_HEADER_RE: Final = re.compile(
    r"^\s*(?:={5}\s*REVIEWER:\s*|[①②③]\s*REVIEWER\s+)"
    r"(METODOLOGI|ORISINALITAS|REVISI)\s*(?:={5})?\s*$",
    re.IGNORECASE | re.MULTILINE,
)

DEBATE_HEADER_RE: Final = re.compile(
    r"^\s*(?:={5}\s*)?(?:#{1,6}\s*)?\*{0,2}\s*"
    r"TITIK PERDEBATAN\b[^\r\n]*$",
    re.IGNORECASE | re.MULTILINE,
)

VERDICT_RE: Final = re.compile(
    r"^\s*\*{0,2}\s*VERDICT:\s*(.*?)\s*\*{0,2}\s*$",
    re.IGNORECASE | re.MULTILINE,
)
SUMMARY_START_RE: Final = re.compile(
    r"^\s*\*{0,2}\s*RINGKASAN\s*:\s*\*{0,2}\s*$",
    re.IGNORECASE | re.MULTILINE,
)
FINDINGS_START_RE: Final = re.compile(
    r"^\s*\*{0,2}\s*TEMUAN\s*:\s*\*{0,2}\s*$",
    re.IGNORECASE | re.MULTILINE,
)
RECS_START_RE: Final = re.compile(
    r"^\s*\*{0,2}\s*REKOMENDASI PRIORITAS\s*:\s*\*{0,2}\s*$",
    re.IGNORECASE | re.MULTILINE,
)

FINDING_ITEM_RE: Final = re.compile(
    r"^\s*(\d+)\.\s*\[ASPEK:\s*(.+?)\]\s*"
    r"(?:[—–-]\s*\*\*(.*?)\*\*)?\s*\n"
    r"(.*?)(?=^\s*\d+\.\s*\[ASPEK:|\Z)",
    re.MULTILINE | re.DOTALL,
)

REFERENCE_LINE_RE: Final = re.compile(
    r"^\s*(?:[-*]\s*)?\*{0,2}\s*Rujukan(?:\s+dokumen)?\s*"
    r"\*{0,2}\s*:\s*\*{0,2}\s*(.*?)\s*\*{0,2}\s*$",
    re.IGNORECASE,
)

REC_ITEM_RE: Final = re.compile(r"^\s*\d+\.\s*(.+?)\s*$", re.MULTILINE)

DEBATE_ITEM_RE: Final = re.compile(
    r"^\s*(\d+)\.\s*\[ASPEK TERKAIT:\s*(.+?)\]\s*\n"
    r"(.*?)(?=^\s*\d+\.\s*\[ASPEK TERKAIT:|\Z)",
    re.MULTILINE | re.DOTALL,
)

DEBATE_TYPE_RE: Final = re.compile(
    r"^\s*(?:[-*]\s*)?\*{0,2}Jenis\s*:\s*"
    r"\*{0,2}\s*\*{0,2}\s*"
    r"(KONTRADIKSI|PENGUATAN[_ ]SILANG|ISU[_ ]UNIK)\s*\*{0,2}\s*$",
    re.IGNORECASE | re.MULTILINE,
)

IMPLICATION_RE: Final = re.compile(
    r"^\s*(?:[-*]\s*)?\*{0,2}Implikasi\s*:\s*\*{0,2}\s*"
    r"(.+?)(?=\Z|\n\n)",
    re.IGNORECASE | re.MULTILINE | re.DOTALL,
)

_KEY_MAP: Final = {
    "METODOLOGI": ReviewerKey.metodologi,
    "ORISINALITAS": ReviewerKey.orisinalitas,
    "REVISI": ReviewerKey.revisi,
}

_DEBATE_TYPE_MAP: Final = {
    "KONTRADIKSI": DebateType.kontradiksi,
    "PENGUATAN SILANG": DebateType.penguatan_silang,
    "PENGUATAN_SILANG": DebateType.penguatan_silang,
    "ISU UNIK": DebateType.isu_unik,
    "ISU_UNIK": DebateType.isu_unik,
}


# ── Public entry point ─────────────────────────────────────────────────────────

def parse_flow5_output(raw: str) -> ParsedReport:
    """
    Parse the raw text output from Flow 5 into a structured ParsedReport.

    Always returns a ParsedReport; sets parse_ok=False if structure is not
    recognisable so callers can fall back to raw text display.
    """
    if not raw or not raw.strip():
        logger.warning("parser: empty raw output")
        return ParsedReport(parse_ok=False)

    # Check minimum structure: at least one reviewer header must be present
    if not REVIEWER_HEADER_RE.search(raw):
        logger.warning("parser: no reviewer headers found — unrecognised format")
        return ParsedReport(parse_ok=False)

    reviewers = _parse_reviewer_sections(raw)
    debate_points = _parse_debate_section(raw)

    # parse_ok=True if we found at least one reviewer with status=ok
    any_ok = any(r.status == ReviewerStatus.ok for r in reviewers)

    return ParsedReport(
        parse_ok=any_ok,
        reviewers=reviewers,
        debate_points=debate_points,
    )


# ── Reviewer parsing ───────────────────────────────────────────────────────────

def _parse_reviewer_sections(raw: str) -> list[ReviewerResult]:
    """Split by reviewer headers and parse each section."""
    results: list[ReviewerResult] = []

    positions = [(m.group(1).upper(), m.end()) for m in REVIEWER_HEADER_RE.finditer(raw)]
    debate_match = DEBATE_HEADER_RE.search(raw)
    debate_start = debate_match.start() if debate_match else len(raw)

    for key_str, section_start in positions:
        next_match = REVIEWER_HEADER_RE.search(raw, section_start)
        section_end = min(
            next_match.start() if next_match else len(raw),
            debate_start,
        )

        section_text = raw[section_start:section_end]
        reviewer_key = _KEY_MAP.get(key_str)

        if reviewer_key is None:
            logger.warning("parser: unknown reviewer key '%s'", key_str)
            continue

        results.append(_parse_one_reviewer(reviewer_key, section_text))

    # Ensure all three reviewers are represented (missing ones get status=missing)
    present_keys = {r.key for r in results}
    for key in ReviewerKey:
        if key not in present_keys:
            logger.info("parser: reviewer '%s' missing from output", key.value)
            results.append(ReviewerResult(key=key, status=ReviewerStatus.missing))

    return results


def _parse_one_reviewer(key: ReviewerKey, section: str) -> ReviewerResult:
    """Parse a single reviewer section text into ReviewerResult."""
    try:
        verdict = _extract_verdict(section)
        summary = _extract_summary(section)
        findings = _extract_findings(section)
        recs = _extract_recommendations(section)

        if not verdict and not findings:
            return ReviewerResult(key=key, status=ReviewerStatus.failed)

        return ReviewerResult(
            key=key,
            status=ReviewerStatus.ok,
            verdict=verdict,
            summary=summary,
            findings=findings,
            priority_recommendations=recs,
        )
    except Exception:  # noqa: BLE001
        logger.exception("parser: failed to parse reviewer section for '%s'", key.value)
        return ReviewerResult(key=key, status=ReviewerStatus.failed)


def _extract_verdict(section: str) -> str:
    m = VERDICT_RE.search(section)
    return _clean_markdown(m.group(1)) if m else ""


def _extract_summary(section: str) -> str:
    """Extract text between RINGKASAN: and next section header."""
    start_m = SUMMARY_START_RE.search(section)
    if not start_m:
        return ""
    start = start_m.end()
    # End at TEMUAN: or REKOMENDASI PRIORITAS: or end of section
    end_m = FINDINGS_START_RE.search(section, start)
    end = end_m.start() if end_m else len(section)
    return _clean_markdown(section[start:end])


def _extract_findings(section: str) -> list[Finding]:
    """Extract numbered TEMUAN items with ASPEK and optional Rujukan."""
    findings_m = FINDINGS_START_RE.search(section)
    if not findings_m:
        return []

    # Cut between TEMUAN: and REKOMENDASI PRIORITAS:
    recs_m = RECS_START_RE.search(section, findings_m.end())
    findings_block = section[findings_m.end(): recs_m.start() if recs_m else len(section)]

    results: list[Finding] = []
    for m in FINDING_ITEM_RE.finditer(findings_block):
        no = int(m.group(1))
        aspect = m.group(2).strip()
        rating = (m.group(3) or "").strip()
        body = m.group(4).strip()
        reference = _extract_reference(body)
        description = _clean_markdown(_strip_reference_line(body))
        if rating:
            description = f"Penilaian: {rating}\n{description}".strip()

        results.append(Finding(
            no=no,
            aspect=aspect,
            description=description,
            reference=reference if reference else None,
        ))

    return results


def _extract_reference(body: str) -> str | None:
    """
    Find "Rujukan:" line in a finding body and return verbatim content.
    Returns None if absent — caller shows "Tanpa rujukan" tag.
    """
    lines = body.splitlines()
    ref_lines: list[str] = []
    in_ref = False
    for line in lines:
        reference_match = REFERENCE_LINE_RE.match(line)
        if reference_match:
            ref_lines.append(reference_match.group(1).strip())
            in_ref = True
        elif in_ref:
            stripped = line.strip()
            if stripped:
                ref_lines.append(stripped)
    return " ".join(ref_lines).strip() if ref_lines else None


def _strip_reference_line(body: str) -> str:
    """Remove the Rujukan: line(s) from finding body to get pure description."""
    lines = body.splitlines()
    desc_lines: list[str] = []
    skip_rest = False
    for line in lines:
        if REFERENCE_LINE_RE.match(line):
            skip_rest = True
            continue
        if not skip_rest:
            desc_lines.append(line)
    return "\n".join(desc_lines).strip()


def _extract_recommendations(section: str) -> list[str]:
    """Extract numbered REKOMENDASI PRIORITAS items."""
    recs_m = RECS_START_RE.search(section)
    if not recs_m:
        return []
    recs_block = section[recs_m.end():]
    return [_clean_markdown(m.group(1)) for m in REC_ITEM_RE.finditer(recs_block)]


# ── Debate point parsing ───────────────────────────────────────────────────────

def _parse_debate_section(raw: str) -> list[DebatePoint]:
    """Parse the TITIK PERDEBATAN section."""
    debate_m = DEBATE_HEADER_RE.search(raw)
    if not debate_m:
        return []

    debate_text = raw[debate_m.end():]
    results: list[DebatePoint] = []

    for m in DEBATE_ITEM_RE.finditer(debate_text):
        aspect = m.group(2).strip()
        body = m.group(3)

        # Type
        type_m = DEBATE_TYPE_RE.search(body)
        if not type_m:
            logger.warning("parser: debate item missing Jenis, skipping")
            continue

        raw_type = type_m.group(1).upper().replace(" ", "_")
        debate_type = _DEBATE_TYPE_MAP.get(type_m.group(1).upper())
        if debate_type is None:
            debate_type = _DEBATE_TYPE_MAP.get(raw_type)
        if debate_type is None:
            logger.warning("parser: unknown debate type '%s'", type_m.group(1))
            continue

        # Implication as description
        imp_m = IMPLICATION_RE.search(body)
        description = _clean_markdown(imp_m.group(1)) if imp_m else _clean_markdown(body)

        # Reviewer lines
        reviewer_lines = []
        for line in body.splitlines():
            reviewer_match = re.match(
                r"^\s*[-*]\s*\*{0,2}\s*(Reviewer\b.*?)\s*\*{0,2}\s*$",
                line,
                re.IGNORECASE,
            )
            if reviewer_match:
                reviewer_lines.append(_clean_markdown(reviewer_match.group(1)))

        results.append(DebatePoint(
            type=debate_type,
            aspect=aspect,
            description=description,
            reviewers=reviewer_lines,
            references=[],
        ))

    return results


def _clean_markdown(value: str) -> str:
    """Remove presentation-only bold and list markers from parsed UI text."""
    value = re.sub(r"\*\*([^*\n]+)\*\*", r"\1", value)
    value = re.sub(r"^\s*[*-]\s+", "", value, flags=re.MULTILINE)
    return value.strip()
