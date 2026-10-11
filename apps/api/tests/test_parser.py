"""
Tests for app/services/parser.py (Fase 4 DoD).

Covers:
  - Normal fixture (flow5_sample.txt): all three reviewers parsed ok,
    findings with Rujukan, debate points recognised.
  - Reviewer missing from output → status=missing.
  - Partially malformed section → status=failed, others unaffected.
  - Unrecognised format (no headers) → parse_ok=False, empty lists.
  - Finding without Rujukan line → reference=None.
  - Debate point parsing: type, aspect, reviewer lines, implikasi.
"""
from __future__ import annotations

import pathlib

from app.models.schemas import DebateType, ReviewerKey, ReviewerStatus
from app.services.parser import parse_flow5_output

FIXTURE = (
    pathlib.Path(__file__).parent / "fixtures" / "flow5_sample.txt"
).read_text(encoding="utf-8")

ACTUAL_FLOW_FORMAT = """
Halo! Saya Bob, Orchestrator review proposal Anda.

① REVIEWER METODOLOGI
**Verdict: LAYAK**

**RINGKASAN:**
Ringkasan metodologi yang cukup.

**TEMUAN:**
1. [ASPEK: Desain Penelitian] — **KUAT**
* **Penjelasan teknis:** Desain sesuai dengan tujuan penelitian.
* **Rujukan dokumen:** "pendekatan fenomenologis" (Halaman 26)

**REKOMENDASI PRIORITAS:**
1. **Jelaskan prosedur penelitian.**

② REVIEWER ORISINALITAS
**Verdict: Revisi Minor**

**RINGKASAN:**
Klaim kebaruan perlu diperjelas.

**TEMUAN:**
1. [ASPEK: Klaim Kebaruan] — **PERLU DIPERBAIKI**
* **Penjelasan teknis:** Pembanding penelitian belum dijelaskan.
* **Rujukan dokumen:** "belum ada penelitian yang menggabungkan" (BAB 1)

**REKOMENDASI PRIORITAS:**
1. Tambahkan perbandingan dengan penelitian terdahulu.

③ REVIEWER REVISI
**RINGKASAN:**
Perbaikan terarah diperlukan.

**TEMUAN:**
1. [ASPEK: Sistematika]
* **Penjelasan teknis:** Hubungan antar bab perlu diperjelas.
* **Rujukan dokumen:** tidak ada — observasi struktural (BAB 2)

**REKOMENDASI PRIORITAS:**
1. Tambahkan transisi antar bab.

### **TITIK PERDEBATAN (Cross-Check Reviewer)**
1. [ASPEK TERKAIT: Klaim Kebaruan]
* **Jenis:** **PENGUATAN SILANG**
* **Reviewer Metodologi:** Catatan metodologis.
* **Reviewer Orisinalitas:** Catatan orisinalitas.
* **Implikasi:** Perjelas kontribusi penelitian.

### **REKOMENDASI PRIORITAS GABUNGAN**
Teks tambahan di luar bagian reviewer.
"""


# ── Normal fixture ─────────────────────────────────────────────────────────────

def test_fixture_parse_ok_true() -> None:
    result = parse_flow5_output(FIXTURE)
    assert result.parse_ok is True


def test_fixture_has_three_reviewers() -> None:
    result = parse_flow5_output(FIXTURE)
    keys = {r.key for r in result.reviewers}
    assert keys == {ReviewerKey.metodologi, ReviewerKey.orisinalitas, ReviewerKey.revisi}


def test_fixture_all_reviewers_ok() -> None:
    result = parse_flow5_output(FIXTURE)
    for r in result.reviewers:
        assert r.status == ReviewerStatus.ok, f"{r.key} expected ok, got {r.status}"


def test_fixture_metodologi_verdict() -> None:
    result = parse_flow5_output(FIXTURE)
    met = next(r for r in result.reviewers if r.key == ReviewerKey.metodologi)
    assert "REVISI MAYOR" in met.verdict.upper()


def test_fixture_orisinalitas_verdict() -> None:
    result = parse_flow5_output(FIXTURE)
    ori = next(r for r in result.reviewers if r.key == ReviewerKey.orisinalitas)
    assert "REVISI MINOR" in ori.verdict.upper()


def test_fixture_metodologi_has_three_findings() -> None:
    result = parse_flow5_output(FIXTURE)
    met = next(r for r in result.reviewers if r.key == ReviewerKey.metodologi)
    assert len(met.findings) == 3


def test_fixture_findings_have_rujukan() -> None:
    """All findings in the fixture have explicit Rujukan lines."""
    result = parse_flow5_output(FIXTURE)
    for reviewer in result.reviewers:
        for f in reviewer.findings:
            assert f.reference is not None, (
                f"Reviewer {reviewer.key.value} finding #{f.no} has no reference"
            )


def test_fixture_rujukan_verbatim() -> None:
    """Rujukan content must be kept verbatim (not stripped/modified)."""
    result = parse_flow5_output(FIXTURE)
    met = next(r for r in result.reviewers if r.key == ReviewerKey.metodologi)
    first = met.findings[0]
    assert first.reference is not None
    # The fixture says: "validasi dilakukan menggunakan 10-fold cross-validation pada"
    assert "10-fold cross-validation" in first.reference


def test_fixture_findings_have_aspect() -> None:
    result = parse_flow5_output(FIXTURE)
    for reviewer in result.reviewers:
        for f in reviewer.findings:
            assert f.aspect, f"Finding #{f.no} has empty aspect"


def test_fixture_metodologi_has_recommendations() -> None:
    result = parse_flow5_output(FIXTURE)
    met = next(r for r in result.reviewers if r.key == ReviewerKey.metodologi)
    assert len(met.priority_recommendations) >= 1


def test_fixture_has_debate_points() -> None:
    result = parse_flow5_output(FIXTURE)
    assert len(result.debate_points) >= 1


def test_fixture_debate_point_type() -> None:
    result = parse_flow5_output(FIXTURE)
    types = {dp.type for dp in result.debate_points}
    assert DebateType.penguatan_silang in types


def test_fixture_debate_point_has_aspect() -> None:
    result = parse_flow5_output(FIXTURE)
    for dp in result.debate_points:
        assert dp.aspect


def test_fixture_debate_point_has_reviewer_lines() -> None:
    result = parse_flow5_output(FIXTURE)
    for dp in result.debate_points:
        assert len(dp.reviewers) >= 1


def test_actual_langflow_format_parses_as_structured_review() -> None:
    result = parse_flow5_output(ACTUAL_FLOW_FORMAT)

    assert result.parse_ok is True
    reviewers = {reviewer.key: reviewer for reviewer in result.reviewers}
    assert set(reviewers) == {
        ReviewerKey.metodologi,
        ReviewerKey.orisinalitas,
        ReviewerKey.revisi,
    }
    assert reviewers[ReviewerKey.metodologi].verdict == "LAYAK"
    assert reviewers[ReviewerKey.metodologi].summary == "Ringkasan metodologi yang cukup."

    finding = reviewers[ReviewerKey.metodologi].findings[0]
    assert finding.aspect == "Desain Penelitian"
    assert finding.description.startswith("Penilaian: KUAT")
    assert "**" not in finding.description
    assert finding.reference == '"pendekatan fenomenologis" (Halaman 26)'
    assert reviewers[ReviewerKey.metodologi].priority_recommendations == [
        "Jelaskan prosedur penelitian."
    ]

    assert len(result.debate_points) == 1
    debate = result.debate_points[0]
    assert debate.type == DebateType.penguatan_silang
    assert debate.description == "Perjelas kontribusi penelitian."
    assert len(debate.reviewers) == 2


# ── Missing reviewer ───────────────────────────────────────────────────────────

MISSING_REVISI = """
===== REVIEWER: METODOLOGI =====

VERDICT: LAYAK

RINGKASAN:
Metodologi cukup baik.

TEMUAN:
1. [ASPEK: Desain]
   Desain penelitian memadai.
   Rujukan: "desain eksperimen dijelaskan di BAB 3" (BAB 3, hlm. 20)

REKOMENDASI PRIORITAS:
1. Perbaiki detail prosedur.

===== REVIEWER: ORISINALITAS =====

VERDICT: REVISI MINOR

RINGKASAN:
Gap penelitian teridentifikasi.

TEMUAN:
1. [ASPEK: Kebaruan]
   Kontribusi cukup baru.
   Rujukan: "kontribusi utama" (BAB 1, hlm. 2)

REKOMENDASI PRIORITAS:
1. Perluas tinjauan literatur.
"""


def test_missing_reviewer_gets_status_missing() -> None:
    result = parse_flow5_output(MISSING_REVISI)
    revisi = next(r for r in result.reviewers if r.key == ReviewerKey.revisi)
    assert revisi.status == ReviewerStatus.missing


def test_missing_reviewer_present_ones_are_ok() -> None:
    result = parse_flow5_output(MISSING_REVISI)
    met = next(r for r in result.reviewers if r.key == ReviewerKey.metodologi)
    ori = next(r for r in result.reviewers if r.key == ReviewerKey.orisinalitas)
    assert met.status == ReviewerStatus.ok
    assert ori.status == ReviewerStatus.ok


# ── Finding without Rujukan ────────────────────────────────────────────────────

NO_RUJUKAN = """
===== REVIEWER: METODOLOGI =====

VERDICT: REVISI MINOR

RINGKASAN:
Ringkasan singkat.

TEMUAN:
1. [ASPEK: Tanpa Rujukan Test]
   Temuan ini tidak memiliki baris Rujukan sama sekali.

REKOMENDASI PRIORITAS:
1. Tambahkan rujukan.

===== REVIEWER: ORISINALITAS =====

VERDICT: LAYAK

RINGKASAN:
Oke.

TEMUAN:
1. [ASPEK: Cakupan]
   Cukup baik.
   Rujukan: tidak ada — observasi dari daftar referensi

REKOMENDASI PRIORITAS:
1. Oke saja.

===== REVIEWER: REVISI =====

VERDICT: REVISI MINOR

RINGKASAN:
Minor saja.

TEMUAN:
1. [ASPEK: Minor]
   Perbaiki beberapa hal kecil.
   Rujukan: "beberapa hal kecil" (BAB 3)

REKOMENDASI PRIORITAS:
1. Perbaiki.
"""


def test_finding_without_rujukan_has_reference_none() -> None:
    result = parse_flow5_output(NO_RUJUKAN)
    met = next(r for r in result.reviewers if r.key == ReviewerKey.metodologi)
    assert len(met.findings) == 1
    assert met.findings[0].reference is None


# ── Unrecognised format ────────────────────────────────────────────────────────

def test_unrecognised_format_parse_ok_false() -> None:
    result = parse_flow5_output("Ini bukan output Flow 5 sama sekali.")
    assert result.parse_ok is False
    assert result.reviewers == []
    assert result.debate_points == []


def test_empty_string_parse_ok_false() -> None:
    result = parse_flow5_output("")
    assert result.parse_ok is False


def test_whitespace_only_parse_ok_false() -> None:
    result = parse_flow5_output("   \n\n   ")
    assert result.parse_ok is False


# ── parse_ok=False even if partial (no verdict + no findings) ─────────────────

PARTIAL_NO_VERDICT = """
===== REVIEWER: METODOLOGI =====

Hanya teks acak tanpa struktur yang benar.

===== REVIEWER: ORISINALITAS =====

Juga teks acak.

===== REVIEWER: REVISI =====

Teks acak lainnya.
"""


def test_partial_sections_all_failed_gives_parse_ok_false() -> None:
    result = parse_flow5_output(PARTIAL_NO_VERDICT)
    # All reviewers have no verdict+findings → failed/missing
    assert result.parse_ok is False
    for r in result.reviewers:
        assert r.status in {ReviewerStatus.failed, ReviewerStatus.missing}


# ── Debate point types ─────────────────────────────────────────────────────────

DEBATE_ALL_TYPES = """
===== REVIEWER: METODOLOGI =====

VERDICT: REVISI MAYOR

RINGKASAN:
Ringkasan.

TEMUAN:
1. [ASPEK: A]
   Deskripsi A.
   Rujukan: "ref A"

REKOMENDASI PRIORITAS:
1. Perbaiki A.

===== REVIEWER: ORISINALITAS =====

VERDICT: REVISI MINOR

RINGKASAN:
Ringkasan.

TEMUAN:
1. [ASPEK: B]
   Deskripsi B.
   Rujukan: "ref B"

REKOMENDASI PRIORITAS:
1. Perbaiki B.

===== REVIEWER: REVISI =====

VERDICT: REVISI MAYOR

RINGKASAN:
Ringkasan.

TEMUAN:
1. [ASPEK: C]
   Deskripsi C.
   Rujukan: "ref C"

REKOMENDASI PRIORITAS:
1. Perbaiki C.

===== TITIK PERDEBATAN =====

1. [ASPEK TERKAIT: Kontradiksi Contoh]
   Jenis: KONTRADIKSI
   - Reviewer Metodologi: menemukan masalah X.
   - Reviewer Orisinalitas: tidak menyinggung.
   - Reviewer Revisi: menilai X sebagai kekuatan.
   Implikasi: Perlu klarifikasi dari mahasiswa.

2. [ASPEK TERKAIT: Penguatan Silang Contoh]
   Jenis: PENGUATAN SILANG
   - Reviewer Metodologi: menyoroti isu Y.
   - Reviewer Revisi: mengkonfirmasi isu Y kritis.
   Implikasi: Prioritas tinggi.

3. [ASPEK TERKAIT: Isu Unik Contoh]
   Jenis: ISU UNIK
   - Reviewer Orisinalitas: hanya reviewer ini yang menyinggung Z.
   Implikasi: Pertimbangkan sebagai catatan tambahan.
"""


def test_debate_kontradiksi_parsed() -> None:
    result = parse_flow5_output(DEBATE_ALL_TYPES)
    types = {dp.type for dp in result.debate_points}
    assert DebateType.kontradiksi in types


def test_debate_penguatan_silang_parsed() -> None:
    result = parse_flow5_output(DEBATE_ALL_TYPES)
    types = {dp.type for dp in result.debate_points}
    assert DebateType.penguatan_silang in types


def test_debate_isu_unik_parsed() -> None:
    result = parse_flow5_output(DEBATE_ALL_TYPES)
    types = {dp.type for dp in result.debate_points}
    assert DebateType.isu_unik in types


def test_debate_count() -> None:
    result = parse_flow5_output(DEBATE_ALL_TYPES)
    assert len(result.debate_points) == 3
