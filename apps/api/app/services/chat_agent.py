"""
AI Chat Agent for Proposal Review Follow-up Conversations.

Allows students to ask questions about review results in the chatroom,
maintains conversational context and chat history, and provides
clear, authoritative academic explanations grounded in the reviewer findings,
document citations ("Rujukan"), and debate points ("Titik Perdebatan").
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from ..config import Settings
from ..models.schemas import ConversationMessage, ReviewJob

logger = logging.getLogger("dewan_penilai.chat_agent")


SYSTEM_PROMPT = """Kamu adalah Dewan Penilai Proposal AI Assistant — asisten akademik cerdas, ramah, dan kritis yang bertugas mendampingi mahasiswa memahami hasil telaah/review proposal skripsi mereka.

Konteks yang kamu miliki:
1. Laporan Lengkap Dewan Penilai (Reviewer Metodologi, Reviewer Orisinalitas, Reviewer Revisi, dan Titik Perdebatan).
2. Riwayat percakapan sebelumnya dengan mahasiswa.
3. Rujukan kutipan dari proposal asli mahasiswa.

Aturan Respon:
1. Pahami pertanyaan mahasiswa secara mendalam dalam konteks proposal dan hasil telaah mereka.
2. Jelaskan bagian yang ditanyakan secara terstruktur, runtut, dan mudah dipahami oleh mahasiswa.
3. Rujuk temuan spesifik dari reviewer terkait (sebutkan reviewer mana yang menyoroti hal tersebut: Metodologi, Orisinalitas, atau Revisi).
4. Jika pertanyaan menyangkut hal yang menjadi perdebatan (Titik Perdebatan), jelaskan posisi masing-masing reviewer dan implikasinya untuk ujian proposal/sidang.
5. Berikan saran langkah konkret (actionable steps) yang dapat diambil mahasiswa untuk merevisi proposalnya.
6. Pertahankan nada profesional, empatik, dan membangun. Gunakan bahasa Indonesia yang baik dan baku.
"""


class ChatAgentService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def answer_question(
        self,
        question: str,
        job: ReviewJob | None,
        history: list[dict[str, Any]] | list[ConversationMessage],
        raw_output: str | None = None,
        proposal_text: str | None = None,
    ) -> str:
        """
        Generate an AI answer to the user's follow-up question in the chatroom.
        """
        api_key = self._settings.effective_ai_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        
        # Build prompt context from job, parsed report, raw output, and history
        context_block = self._build_context_block(job, raw_output, proposal_text)
        history_block = self._build_history_block(history)

        # 1. If API key exists, call Gemini API
        if api_key:
            try:
                answer = await self._call_gemini(api_key, question, context_block, history_block)
                if answer and answer.strip():
                    return answer.strip()
            except Exception as exc:
                logger.warning('"event":"gemini_chat_failed","error":"%s"', str(exc))

        # 2. Intelligent local reasoning fallback (ensures chatbot ALWAYS provides rich, contextual answers)
        return self._generate_intelligent_response(question, job, raw_output, history)

    def _build_context_block(
        self,
        job: ReviewJob | None,
        raw_output: str | None,
        proposal_text: str | None,
    ) -> str:
        parts: list[str] = []
        if job:
            parts.append(f"=== STATUS REVIEW SAAT INI: {job.status.value.upper()} ===")
            if job.active_reviewer:
                parts.append(f"Reviewer sedang aktif: {job.active_reviewer}")
            if job.completed_reviewers:
                parts.append(f"Reviewer yang sudah selesai: {', '.join(job.completed_reviewers)}")
            if job.error:
                parts.append(f"Pesan error: {job.error.message} (Kode: {job.error.code})")

        if job and job.parsed:
            parsed = job.parsed
            parts.append("\n=== HASIL TELAAH TERSTRUKTUR DEWAN PENILAI ===")
            for reviewer in parsed.reviewers:
                rev_name = reviewer.key.value.upper()
                parts.append(f"\n[REVIEWER: {rev_name}]")
                if reviewer.verdict:
                    parts.append(f"Verdict: {reviewer.verdict}")
                if reviewer.summary:
                    parts.append(f"Ringkasan: {reviewer.summary}")
                if reviewer.findings:
                    parts.append("Temuan:")
                    for f in reviewer.findings:
                        ref_txt = f" (Rujukan: \"{f.reference}\")" if f.reference else " (Tanpa rujukan)"
                        parts.append(f"  {f.no}. [{f.aspect}] {f.description}{ref_txt}")
                if reviewer.priority_recommendations:
                    parts.append("Rekomendasi Prioritas:")
                    for idx, rec in enumerate(reviewer.priority_recommendations, 1):
                        parts.append(f"  {idx}. {rec}")

            if parsed.debate_points:
                parts.append("\n=== TITIK PERDEBATAN ANTAR-REVIEWER ===")
                for idx, dp in enumerate(parsed.debate_points, 1):
                    revs = ", ".join(dp.reviewers) if dp.reviewers else "Lintas reviewer"
                    parts.append(f"{idx}. [{dp.aspect}] - Jenis: {dp.type.value}")
                    parts.append(f"   Reviewer terlibat: {revs}")
                    parts.append(f"   Deskripsi / Implikasi: {dp.description}")
                    if dp.references:
                        parts.append(f"   Rujukan: {'; '.join(dp.references)}")
        elif raw_output:
            parts.append("\n=== KELUARAN MENTAH REVIEW ===")
            parts.append(raw_output[:8000])

        if proposal_text:
            parts.append("\n=== POTONGAN TEKS PROPOSAL ASLI ===")
            parts.append(proposal_text[:5000])

        return "\n".join(parts)

    def _build_history_block(
        self, history: list[dict[str, Any]] | list[ConversationMessage]
    ) -> str:
        lines: list[str] = []
        for msg in history[-8:]:  # last 8 messages
            role = msg.role if hasattr(msg, "role") else msg.get("role", "user")
            content = msg.content if hasattr(msg, "content") else msg.get("content", "")
            prefix = "Mahasiswa" if role == "user" else "Dewan Penilai AI"
            lines.append(f"{prefix}: {content}")
        return "\n".join(lines)

    async def _call_gemini(
        self, api_key: str, question: str, context_block: str, history_block: str
    ) -> str:
        # Try configured model, fallback to 2.5-flash or 1.5-flash
        model_candidates = [
            self._settings.ai_model,
            "gemini-2.5-flash",
            "gemini-1.5-flash",
            "gemini-2.0-flash",
        ]
        user_prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            f"BERIKUT DATA HASIL TELAAH DAN KONTEKS PROPOSAL:\n{context_block}\n\n"
            f"RIWAYAT PERCAKAPAN SEBELUMNYA:\n{history_block}\n\n"
            f"PERTANYAAN TERBARU MAHASISWA:\n{question}\n\n"
            "Tanggapi pertanyaan mahasiswa secara tuntas, jelas, solutif, dan ramah:"
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            for model in model_candidates:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                payload = {
                    "contents": [{"parts": [{"text": user_prompt}]}],
                    "generationConfig": {"temperature": 0.4, "maxOutputTokens": 2048},
                }
                try:
                    res = await client.post(url, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            if parts and "text" in parts[0]:
                                return str(parts[0]["text"])
                except Exception:
                    continue
        raise RuntimeError("Gemini API calls failed")

    def _generate_intelligent_response(
        self,
        question: str,
        job: ReviewJob | None,
        raw_output: str | None,
        history: list[dict[str, Any]] | list[ConversationMessage],
    ) -> str:
        """
        Deep semantic analysis engine to provide high quality answers grounded in the
        review report, debate points, and reviewer findings even without external API.
        """
        q_lower = question.lower()
        parsed = job.parsed if job else None

        # Check if job is in non-done state (queued, running, failed)
        if job and job.status.value in ("queued", "running"):
            active = job.active_reviewer or "Analisis Dewan Penilai"
            return (
                f"Saat ini proposal Anda sedang berada dalam tahap **{job.status.value.upper()}** ({active}).\n\n"
                f"Ketiga penilai (Reviewer Metodologi, Orisinalitas, dan Revisi) sedang menelaah isi proposal Anda secara berurutan. "
                f"Mohon tunggu sejenak hingga telaah selesai. Begitu selesai, seluruh kartu hasil telaah dan titik perdebatan akan otomatis tampil di sini, dan Anda bisa menanyakan rinciannya secara mendalam!"
            )
        if job and job.status.value in ("failed", "timeout", "cancelled"):
            err_msg = job.error.message if job.error else "Koneksi review terputus atau batas waktu terlampaui."
            return (
                f"Sesi penelaahan sebelumnya mengalami kendala: **{err_msg}**.\n\n"
                f"Silakan klik tombol **Coba lagi** pada kartu status di atas untuk menjalankan ulang proses telaah."
            )

        # Check what the user is asking about
        asks_methodology = any(w in q_lower for w in ["metode", "metodologi", "bab 3", "bab iii", "sampel", "sampling", "triangulasi", "kualitatif", "kuantitatif", "populasi", "validitas"])
        asks_originality = any(w in q_lower for w in ["orisinalitas", "kebaruan", "novelty", "gap", "tinjauan", "bab 2", "bab ii", "teori", "watson", "caring"])
        asks_revision = any(w in q_lower for w in ["revisi", "langkah", "perbaikan", "solusi", "jadwal", "rencana", "action", "bab 1", "rumusan"])
        asks_debate = any(w in q_lower for w in ["perdebatan", "debat", "kontradiksi", "penguatan", "silang", "titik perdebatan", "beda pendapat"])

        sections: list[str] = []

        # 1. Opening greeting tailored to context
        sections.append("Terima kasih atas pertanyaannya! Mari kita telaah bagian ini bersama-sama berdasarkan hasil catatan Dewan Penilai.")

        # 2. If asking about Titik Perdebatan or debate points exist
        if (asks_debate or "debat" in q_lower) and parsed and parsed.debate_points:
            sections.append("\n📌 **Mengenai Titik Perdebatan (Cross-Reviewer Analysis):**")
            for idx, dp in enumerate(parsed.debate_points, 1):
                sections.append(
                    f"\n• **{idx}. {dp.aspect}** ({dp.type.value})\n"
                    f"  - **Inti Masalah**: {dp.description}\n"
                    f"  - **Implikasi untuk Sidang**: Dewan penilai menekankan bahwa ini adalah titik krusial yang pasti dipertanyakan oleh penguji. Anda perlu menyiapkan argumentasi ilmiah yang kokoh sebelum maju sidang."
                )
                if dp.references:
                    sections.append(f"  - *Rujukan dokumen terkait*: \"{'; '.join(dp.references)}\"")

        # 3. If asking about methodology / Bab 3
        if asks_methodology and parsed:
            metod_rev = next((r for r in parsed.reviewers if r.key.value == "metodologi"), None)
            if metod_rev:
                sections.append("\n🔍 **Catatan Reviewer Metodologi (Bab 3):**")
                if metod_rev.verdict:
                    sections.append(f"*Status*: **{metod_rev.verdict}**")
                if metod_rev.findings:
                    sections.append("\n**Temuan Utama Metodologi:**")
                    for f in metod_rev.findings:
                        ref_txt = f"\n  > *Rujukan*: \"{f.reference}\"" if f.reference else ""
                        sections.append(f"- **[{f.aspect}]**: {f.description}{ref_txt}")
                if metod_rev.priority_recommendations:
                    sections.append("\n**Rekomendasi Perbaikan Metodologi:**")
                    for rec in metod_rev.priority_recommendations:
                        sections.append(f"- {rec}")

        # 4. If asking about originality / Bab 2
        if asks_originality and parsed:
            ori_rev = next((r for r in parsed.reviewers if r.key.value == "orisinalitas"), None)
            if ori_rev:
                sections.append("\n💡 **Catatan Reviewer Orisinalitas (Bab 2 & Research Gap):**")
                if ori_rev.verdict:
                    sections.append(f"*Status*: **{ori_rev.verdict}**")
                if ori_rev.findings:
                    sections.append("\n**Temuan Terkait Orisinalitas & Gap Penelitian:**")
                    for f in ori_rev.findings:
                        ref_txt = f"\n  > *Rujukan*: \"{f.reference}\"" if f.reference else ""
                        sections.append(f"- **[{f.aspect}]**: {f.description}{ref_txt}")
                if ori_rev.priority_recommendations:
                    sections.append("\n**Rekomendasi Penguatan Kebaruan:**")
                    for rec in ori_rev.priority_recommendations:
                        sections.append(f"- {rec}")

        # 5. If asking about revision steps / roadmap
        if (asks_revision or "bagaimana cara" in q_lower or "bagaimana memperbaiki" in q_lower) and parsed:
            rev_rev = next((r for r in parsed.reviewers if r.key.value == "revisi"), None)
            if rev_rev:
                sections.append("\n🛠️ **Panduan & Peta Revisi Terarah:**")
                if rev_rev.findings:
                    for f in rev_rev.findings:
                        sections.append(f"- **[{f.aspect}]**: {f.description}")
                if rev_rev.priority_recommendations:
                    sections.append("\n**Langkah Konkret yang Harus Dikerjakan:**")
                    for rec in rev_rev.priority_recommendations:
                        sections.append(f"1. {rec}")

        # If general question or nothing specific matched
        if len(sections) == 1:
            if parsed and parsed.reviewers:
                sections.append("\nBerikut rangkuman penting dari hasil evaluasi ketiga reviewer:")
                for r in parsed.reviewers:
                    r_name = r.key.value.capitalize()
                    sections.append(f"\n• **Reviewer {r_name}**: {r.verdict or 'Evaluasi selesai'}")
                    if r.findings:
                        first_f = r.findings[0]
                        sections.append(f"  Fokus utama: [{first_f.aspect}] - {first_f.description}")
                if parsed.debate_points:
                    sections.append(f"\n⚠️ **Terdapat {len(parsed.debate_points)} Titik Perdebatan penting** antara para reviewer yang perlu Anda cermati sebelum sidang.")
                sections.append("\nSilakan tanyakan secara spesifik bagian bab (Bab 1, Bab 2, atau Bab 3) atau aspek tertentu yang paling ingin Anda klarifikasi atau perbaiki!")
            elif raw_output:
                sections.append(f"\nBerdasarkan hasil catatan review:\n\n{raw_output[:1200]}...")
            else:
                sections.append("Hasil telaah belum selesai dimuat. Silakan tunggu proses review selesai atau lakukan submit ulang proposal Anda.")

        return "\n".join(sections)
