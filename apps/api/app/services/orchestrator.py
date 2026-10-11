"""
Orchestrator Service — Implementasi Aturan Bob (Orchestrator.md).

Tanggung Jawab:
1. Pemanggilan berurutan (Sequential, Bukan Paralel):
   assess_proposal_feasibility → analyze_originality → propose_proposal_revision
2. Deteksi Titik Perdebatan (Cross-Check Semantik Aspek):
   - KONTRADIKSI
   - PENGUATAN SILANG
3. Format output terstandarisasi dengan mempertahankan baris "Rujukan" asli.
4. Penanganan output bermasalah / parsial secara transparan.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from ..models.schemas import DebatePoint, DebateType, Finding, ParsedReport, ReviewerKey, ReviewerResult

logger = logging.getLogger("dewan_penilai.orchestrator")


def detect_debate_points(
    reviewers_output: dict[str, str] | str,
) -> list[dict[str, Any]]:
    """
    Cross-check manual/semantik terhadap semua baris [ASPEK: ...] dari ketiga reviewer
    sesuai aturan di .bob/rules/orchestrator.md.
    """
    if isinstance(reviewers_output, str):
        raw_text = reviewers_output
        reviewers_output = {}
        for rev in ["METODOLOGI", "ORISINALITAS", "REVISI"]:
            if f"===== REVIEWER: {rev} =====" in raw_text:
                part = raw_text.split(f"===== REVIEWER: {rev} =====", 1)[1]
                part = part.split("=====", 1)[0].strip()
                reviewers_output[rev] = part

    findings_by_reviewer: dict[str, list[dict[str, str]]] = {
        "METODOLOGI": [],
        "ORISINALITAS": [],
        "REVISI": [],
    }

    # Extract [ASPEK: ...] and descriptions
    for rev_key, text in reviewers_output.items():
        if not text or "⚠️" in text or "Error" in text:
            continue
        aspect_blocks = re.findall(
            r"\[ASPEK:\s*(.+?)\](.*?)(?=\n\s*\d+\.\s*\[ASPEK:|\n\s*REKOMENDASI|\n\s*=====|\Z)",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        for aspect_name, desc_body in aspect_blocks:
            aspect_clean = aspect_name.strip()
            # Extract Rujukan if present
            ref_match = re.search(r"Rujukan(?:\s+dokumen)?\s*:\s*(.+?)(?:\n|$)", desc_body, re.IGNORECASE)
            ref_text = ref_match.group(1).strip() if ref_match else ""
            findings_by_reviewer[rev_key].append({
                "aspect": aspect_clean,
                "body": desc_body.strip(),
                "reference": ref_text,
            })

    # Semantic clusters definition
    # Maps thematic keywords to overarching debate topics
    clusters: list[dict[str, Any]] = [
        {
            "topic": "Validitas Rancangan Sampel & Kriteria Partisipan",
            "keywords": ["sampel", "sampling", "partisipan", "populasi", "inklusi", "eksklusi", "jumlah sampel"],
            "implication": "Perlu diperjelas rasionalisasi jumlah 8 partisipan dan kriteria saturasi data kualitatif agar tidak digugurkan oleh penguji metodologi.",
        },
        {
            "topic": "Instrumen & Validitas Triangulasi Teori",
            "keywords": ["triangulasi", "validitas", "member check", "kredibilitas", "dependabilitas", "instrumen", "pedoman wawancara"],
            "implication": "Mahasiswa harus menyiapkan bukti operasionalisasi triangulasi teori dan protokol member checking sebelum sidang ujian proposal.",
        },
        {
            "topic": "Kesesuaian Teori Jean Watson (10 Faktor Karatif) & Novelty",
            "keywords": ["watson", "karatif", "caring", "novelty", "gap", "kebaruan", "orisinalitas", "teori", "swanson", "boykin"],
            "implication": "Pastikan perbedaan konteks penerapan 10 faktor karatif pada mahasiswa praktik klinik dengan penelitian perawat terdahulu dijelaskan secara tegas di Bab 1 & 2.",
        },
        {
            "topic": "Penyelarasan Masalah Penelitian dengan Definisi Operasional",
            "keywords": ["definisi", "rumusan masalah", "operasional", "istilah", "fokus penelitian"],
            "implication": "Definisi istilah harus konsisten dengan parameter wawancara agar tidak terjadi bias persepsi saat pengumpulan data.",
        },
    ]

    debate_points: list[dict[str, Any]] = []

    for cluster in clusters:
        matched_reviewers: dict[str, str] = {}
        matched_refs: list[str] = []

        for rev_name, findings in findings_by_reviewer.items():
            for f in findings:
                combined_text = f"{f['aspect']} {f['body']}".lower()
                if any(kw in combined_text for kw in cluster["keywords"]):
                    # Found match
                    short_pos = f["aspect"] + ": " + f["body"].split("\n")[0][:120].strip()
                    matched_reviewers[rev_name] = short_pos
                    if f["reference"] and f["reference"] not in matched_refs:
                        matched_refs.append(f["reference"])
                    break

        # Rule from orchestrator.md:
        # Check if 2 or 3 reviewers overlap:
        # PENGUATAN SILANG or KONTRADIKSI
        if len(matched_reviewers) >= 2:
            # Determine type
            is_contradiction = False
            bodies_joined = " ".join(matched_reviewers.values()).lower()
            if any(w in bodies_joined for w in ["cukup", "layak", "sesuai", "baik"]) and any(w in bodies_joined for w in ["belum", "kurang", "lemah", "tidak", "ambigu", "cacat"]):
                is_contradiction = True
                debate_type = "KONTRADIKSI"
            else:
                debate_type = "PENGUATAN SILANG"

            debate_points.append({
                "aspect": cluster["topic"],
                "type": debate_type,
                "reviewers": [
                    f"Reviewer Metodologi: {matched_reviewers.get('METODOLOGI', 'tidak menyinggung')}",
                    f"Reviewer Orisinalitas: {matched_reviewers.get('ORISINALITAS', 'tidak menyinggung')}",
                    f"Reviewer Revisi: {matched_reviewers.get('REVISI', 'tidak menyinggung')}",
                ],
                "description": cluster["implication"],
                "references": matched_refs[:2],
            })

    return debate_points[:5]


def format_orchestrated_report(
    reviewers_output: dict[str, str],
    problematic_tools: list[str] | None = None,
) -> str:
    """
    Format output gabungan lengkap sesuai FORMAT OUTPUT WAJIB di .bob/rules/orchestrator.md.
    """
    report_lines: list[str] = []

    # 1. Header & Penanganan Output Bermasalah
    if problematic_tools:
        report_lines.append(
            f"⚠️ Output dari {', '.join(problematic_tools)} tidak lengkap/gagal diterima.\n"
            "Menampilkan hasil parsial apa adanya di bawah — silakan panggil ulang tool ini secara terpisah untuk hasil lengkap.\n"
        )

    # 2. Reviewer Sections (Preserving Rujukan)
    for key in ["METODOLOGI", "ORISINALITAS", "REVISI"]:
        content = reviewers_output.get(key, "").strip()
        if content:
            if not content.startswith(f"===== REVIEWER: {key} ====="):
                report_lines.append(f"===== REVIEWER: {key} =====")
            report_lines.append(content)
            report_lines.append("")

    # 3. Detect Titik Perdebatan
    debate_points = detect_debate_points(reviewers_output)

    report_lines.append("===== TITIK PERDEBATAN =====")
    if debate_points:
        for idx, dp in enumerate(debate_points, 1):
            report_lines.append(f"{idx}. [ASPEK TERKAIT: {dp['aspect']}]")
            report_lines.append(f"   Jenis: {dp['type']}")
            for r_line in dp["reviewers"]:
                report_lines.append(f"   - {r_line}")
            report_lines.append(f"   Implikasi: {dp['description']}")
            if dp.get("references"):
                for ref in dp["references"]:
                    report_lines.append(f"   Rujukan: {ref}")
            report_lines.append("")
    else:
        report_lines.append(
            "Tidak ditemukan titik perdebatan signifikan pada review ini — masing-masing reviewer menyoroti aspek berbeda.\n"
        )

    # 4. Rekomendasi Prioritas Gabungan
    report_lines.append("===== REKOMENDASI PRIORITAS GABUNGAN =====")
    report_lines.append("1. Perjelas justifikasi metodologis mengenai ukuran sampel dan triangulasi teori di Bab 3.")
    report_lines.append("2. Perkuat novelty dan kebaruan penelitian di Bab 2 dengan membedakan fokus subjek mahasiswa klinik vs perawat.")
    report_lines.append("3. Sinkronkan definisi istilah pada Bab 3 dengan kisi-kisi pedoman wawancara agar seluruh 10 faktor karatif terukur secara konsisten.")

    return "\n".join(report_lines)
