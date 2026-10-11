# 🏛️ Dewan Penilai Proposal (Telaah)
### AI-Powered Multi-Agent Academic Proposal Reviewer & Debate Synthesizer

> **Submission Hackathon IBM**: [https://github.com/nanay26/HackathonIbm](https://github.com/nanay26/HackathonIbm)  
> *Panduan Lengkap Navigasi Proyek & Impor Flow:* Baca [**PANDUAN_NAVIGASI.md**](./PANDUAN_NAVIGASI.md)

---

## 📖 Tentang Proyek

**Dewan Penilai Proposal** adalah platform peninjau proposal skripsi dan tugas akhir berbasis kecerdasan buatan (*Multi-Agent System*) yang mensimulasikan dewan dosen penguji sebelum mahasiswa maju ke meja sidang proposal resmi.

Alih-alih memberikan feedback satu arah yang umum, sistem ini mengorkestrasikan **tiga AI Reviewer spesialis** melalui protokol **MCP (Model Context Protocol)** di **Langflow**, menyandingkan argumen mereka dalam **Kartu Titik Perdebatan (Debate Card)** yang interaktif, dan menyediakan ruang diskusi lanjutan (*Follow-up Chat*) yang tersimpan permanen di database lokal.

---

## 👥 Tiga Figur Reviewer Spesialis

```
                  ┌───────────────────────────────┐
                  │      DRAF PROPOSAL SKRIPSI    │
                  │       (BAB 1, BAB 2, BAB 3)   │
                  └───────────────┬───────────────┘
                                  │ (Eksekusi Sekuensial via MCP)
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ 🔬 Reviewer      │    │ 💡 Reviewer      │    │ 📝 Reviewer      │
│    Metodologi    │    │    Orisinalitas  │    │    Revisi        │
│ (Fokus Bab 3)    │    │ (Fokus Bab 2)    │    │ (Peta Aksi Nyata)│
└─────────┬────────┘    └─────────┬────────┘    └─────────┬────────┘
          │                       │                       │
          └───────────────────────┼───────────────────────┘
                                  ▼
                    ┌───────────────────────────┐
                    │  TITIK PERDEBATAN DEWAN   │
                    │  (Sintesis Silang & Gap)  │
                    └─────────────┬─────────────┘
                                  ▼
                    ┌───────────────────────────┐
                    │ CHATROOM FOLLOW-UP & DOCX │
                    │ (Diskusi Interaktif + Word│
                    └───────────────────────────┘
```

1. **🔬 Reviewer Metodologi** (`flows/assess_proposal_feasibility.json`):
   - Menganalisis kelayakan desain riset, instrumen, teknik sampling, dan analisis data (Fokus Bab 3).
2. **💡 Reviewer Orisinalitas** (`flows/analyze_originality.json`):
   - Membedah posisi riset terhadap *state of the art*, ketajaman *novelty claim*, dan kejelasan *research gap* (Fokus Bab 2).
3. **📝 Reviewer Revisi** (`flows/propose_proposal_revision.json`):
   - Merumuskan peta perbaikan terukur (*actionable steps*) dan rencana kerja bertahap mahasiswa tingkat akhir.
4. **⚖️ Full Review Orchestrator** (`flows/full_review_orchestrator.json`):
   - Mengorkestrasi ke-3 reviewer secara berurutan (*sequential*), merangkum kontradiksi atau konsensus menjadi **Titik Perdebatan**.

---

## 📂 Paket Alur Kerja Langflow (`flows/`)

Semua berkas flow Langflow yang telah diekspor tersedia siap pakai di folder [`flows/`](./flows/):
- [`flows/assess_proposal_feasibility.json`](./flows/assess_proposal_feasibility.json)
- [`flows/analyze_originality.json`](./flows/analyze_originality.json)
- [`flows/propose_proposal_revision.json`](./flows/propose_proposal_revision.json)
- [`flows/full_review_orchestrator.json`](./flows/full_review_orchestrator.json)

Petunjuk lengkap langkah demi langkah impor flow dapat dibaca di [**PANDUAN_NAVIGASI.md**](./PANDUAN_NAVIGASI.md#3-mengimpor-flow-langflow-flows).

---

## ⚡ Memulai Cepat (Quick Start)

### 1. Salin Konfigurasi Environment
```bash
cp .env.example .env
```
Sesuaikan nilai `LANGFLOW_BASE_URL`, `LANGFLOW_API_KEY`, dan `LANGFLOW_FLOW5_ID` pada berkas `.env`.

### 2. Jalankan Backend (FastAPI)
```bash
cd apps/api
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Backend aktif di `http://localhost:8000` (Swagger docs di `/docs`).

### 3. Jalankan Frontend (Next.js)
```bash
cd apps/web
npm install
npm run dev
```
Buka peramban di `http://localhost:3000`.

---

## 🧪 Menjalankan Pengujian

```bash
# Uji Backend (131+ test cases passed)
cd apps/api
pytest --tb=short -q

# Uji Tipe Frontend
cd apps/web
npm run typecheck
```

---

## 📄 Lisensi & Hak Cipta

Dibuat untuk submisi Hackathon IBM 2026.  
Lisensi: MIT License.
