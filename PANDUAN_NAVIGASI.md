# 🏛️ Dewan Penilai Proposal — Panduan Navigasi & Submission Hackathon

Selamat datang di repositori **Dewan Penilai Proposal** (*Telaah*)! Dokumen ini dirancang khusus untuk memandu juri, evaluator, dan penguji hackathon dalam menavigasi, memahami arsitektur, mengimpor alur kerja AI agent, dan menjalankan sistem ini secara lokal maupun terdistribusi.

---

## 🌟 1. Ringkasan Proyek

**Dewan Penilai Proposal** adalah sistem asistensi telaah naskah akademik berbasis **Multi-Agent AI** dan protokol **MCP (Model Context Protocol)** yang diorkestrasi melalui **Langflow** dan **Google Gemini / WatsonX**. 

Alih-alih memberikan penilaian generik tunggal, sistem ini menghadirkan **tiga figur reviewer spesialis** yang mengevaluasi proposal dari sudut pandang kritis berbeda, mendeteksi **Titik Perdebatan (Cross-Evaluation Conflicts/Consensus)**, serta menyediakan **Chatroom Follow-up Interaktif** yang persisten.

### ✨ Fitur Unggulan
1. **Multi-Reviewer Sequential Orchestration**:
   - 🔬 **Reviewer Metodologi**: Menguji kelayakan desain, sampling, instrumen, dan analisis data (Fokus Bab 3).
   - 💡 **Reviewer Orisinalitas**: Memeriksa *novelty claim*, *research gap*, dan posisi riset terhadap *state of the art* (Fokus Bab 2).
   - 📝 **Reviewer Revisi**: Menyusun peta aksi revisi konkret (*what, where, expected outcome*) dan rencana kerja bertahap.
2. **Kartu Titik Perdebatan (Debate Card)**:
   - Visualisasi dinamis & futuristik untuk kontradiksi, penguatan silang, maupun isu unik antar-reviewer.
3. **Interactive & Persistent Chatroom**:
   - Seluruh riwayat obrolan dan hasil telaah tersimpan permanen di database SQLite lokal (`data/telaah.db`).
   - Mahasiswa dapat mengajukan pertanyaan klarifikasi (*follow-up*) langsung kepada Asisten AI yang memahami seluruh konteks telaah proposal.
4. **Ekspor Laporan Word (.docx)**:
   - Menghasilkan dokumen laporan resmi dewan penilai yang terstruktur rapi untuk dibawa ke pembimbing/sidang.

---

## 📁 2. Struktur Direktori Proyek

```text
dewan-penilai-proposal/
├── flows/                                # 📦 Hasil Export Flow Langflow (Siap Impor)
│   ├── analyze_originality.json          # Agent Reviewer Orisinalitas (Bab 2)
│   ├── assess_proposal_feasibility.json  # Agent Reviewer Metodologi (Bab 3)
│   ├── propose_proposal_revision.json    # Agent Reviewer Arah Revisi & Work Plan
│   └── full_review_orchestrator.json     # Orchestrator Multi-Agent (MCP Sequential)
├── apps/
│   ├── api/                              # 🐍 Backend Service (FastAPI + SQLite)
│   │   ├── app/
│   │   │   ├── api/v1/                   # Router endpoints (reviews, chat, export, upload)
│   │   │   ├── models/schemas.py         # Skema Pydantic & validasi data
│   │   │   ├── services/
│   │   │   │   ├── database.py           # SQLite Database Manager & message store
│   │   │   │   ├── job_store.py          # Persistent review job repository
│   │   │   │   ├── langflow_client.py    # Integrasi HTTP / MCP Langflow
│   │   │   │   ├── review_runner.py      # Background worker sequential review
│   │   │   │   └── docx_builder.py       # Generator berkas Word laporan telaah
│   │   │   └── main.py                   # Entrypoint aplikasi FastAPI
│   │   └── requirements.txt              # Dependensi Python
│   └── web/                              # ⚛️ Frontend UI (Next.js 15 + Tailwind CSS)
│       ├── src/
│       │   ├── app/                      # Next.js App Router (Halaman Utama & Review Thread)
│       │   ├── components/
│       │   │   ├── DebateCard.tsx        # Komponen kartu perdebatan interaktif & visual
│       │   │   ├── ReviewResults.tsx     # Tampilan hasil telaah terstruktur
│       │   │   ├── ReviewerCard.tsx      # Tab detail per-reviewer dengan bukti kutipan
│       │   │   └── composer/             # Komponen upload naskah & chat bar
│       │   └── lib/                      # Client API & state manajemen
│       └── package.json                  # Dependensi Node.js / React
├── docs/                                 # 📚 Dokumen Spesifikasi Desain (SDD.md, ASSUMPTIONS.md)
├── .bob/                                 # 🤖 Konfigurasi Orchestrator & Rules
├── docker-compose.yml                    # Konfigurasi deploy kontainer
├── .env.example                          # Template konfigurasi environment
├── PANDUAN_NAVIGASI.md                   # 📄 Panduan ini
└── README.md                             # Dokumentasi umum proyek
```

---

## 🔄 3. Mengimpor Flow Langflow (`flows/`)

Di folder [`flows/`](file:///d:/dewan-penilai-proposal/flows/), tersedia 4 file JSON flow yang dapat langsung diimpor ke **Langflow UI**:

| Nama File Flow | Target Komponen | Fungsi Utama |
|---|---|---|
| [`assess_proposal_feasibility.json`](file:///d:/dewan-penilai-proposal/flows/assess_proposal_feasibility.json) | **Reviewer Metodologi** | Menganalisis kelayakan metode riset Bab 3 |
| [`analyze_originality.json`](file:///d:/dewan-penilai-proposal/flows/analyze_originality.json) | **Reviewer Orisinalitas** | Menganalisis *research gap* & kebaruan Bab 2 |
| [`propose_proposal_revision.json`](file:///d:/dewan-penilai-proposal/flows/propose_proposal_revision.json) | **Reviewer Revisi** | Merumuskan peta perbaikan terukur & tahapan kerja |
| [`full_review_orchestrator.json`](file:///d:/dewan-penilai-proposal/flows/full_review_orchestrator.json) | **Full Review Orchestrator** | Mengorkestrasi ke-3 tool secara sekuensial melalui MCP |

### Cara Impor ke Langflow:
1. Buka dashboard **Langflow** Anda (mis. `http://localhost:7860`).
2. Klik tombol **My Projects / Flows** ➔ Klik **Upload / Import**.
3. Pilih salah satu atau keempat berkas dari folder `flows/` di repositori ini.
4. Masukkan **API Key Google Gemini** Anda (atau provider pilihan) pada komponen Agent di kanvas Langflow.
5. Klik **Save** dan catat **Flow ID / Endpoint Name** untuk dihubungkan ke backend (`.env`).

---

## 🚀 4. Cara Menjalankan Proyek Secara Lokal

### Prasyarat Sistem
- **Python**: Versi 3.11+
- **Node.js**: Versi 20+ (dengan npm atau pnpm)

---

### Langkah 1: Pengaturan Environment

Salin file `.env.example` ke `.env` di root repository:
```bash
cp .env.example .env
```
Isi konfigurasi utama:
```env
LANGFLOW_BASE_URL=http://localhost:7860
LANGFLOW_API_KEY=your-langflow-api-key
LANGFLOW_FLOW5_ID=5296f62e-990c-48c8-a9bc-8b2f27b45d1e
LANGFLOW_MOCK=false
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```
> *Tips:* Jika ingin menguji UI secara instan tanpa server Langflow aktif, Anda dapat mengatur `LANGFLOW_MOCK=true`.

---

### Langkah 2: Jalankan Backend (FastAPI)

```bash
# Masuk ke direktori backend
cd apps/api

# Buat virtual environment (opsional jika sudah ada)
python -m venv .venv
# Aktifkan di Windows:
.venv\Scripts\activate
# Atau di Linux/macOS:
source .venv/bin/activate

# Install dependensi
pip install -r requirements.txt

# Jalankan server API
uvicorn app.main:app --reload --port 8000
```
✅ Backend aktif di `http://localhost:8000`  
Dokumentasi Swagger API interaktif dapat dibuka di `http://localhost:8000/docs`.

---

### Langkah 3: Jalankan Frontend (Next.js)

Buka terminal baru:
```bash
# Masuk ke direktori frontend
cd apps/web

# Install dependensi
npm install

# Jalankan server development
npm run dev
```
✅ Web app aktif di `http://localhost:3000`.

---

## 🎯 5. Alur Kerja Pengujian Aplikasi (Demo Guide)

1. **Buka Aplikasi**: Akses `http://localhost:3000` di peramban Anda.
2. **Unggah Dokumen Proposal**:
   - Tarik & lepas naskah proposal (.pdf, .docx, atau .txt), atau tempel langsung draf proposal per-bab (Bab 1, 2, dan 3).
3. **Mulai Telaah**:
   - Klik tombol **"Mulai Telaah Dewan Penilai"**.
   - Sistem akan mengarahkan Anda ke ruang obrolan (*Review Thread*) `/review/[id]`.
4. **Pantau Status Progres**:
   - UI akan menampilkan indikator tahapan telaah secara berurutan (*Reviewer Metodologi* ➔ *Reviewer Orisinalitas* ➔ *Reviewer Revisi* ➔ *Sintesis Titik Perdebatan*).
5. **Eksplorasi Hasil Telaah**:
   - Buka **Kartu Titik Perdebatan** untuk melihat di mana letak silang pendapat para reviewer.
   - Periksa temuan spesifik berbobot ilmiah beserta rujukan langsung ke naskah Anda.
6. **Tanya Jawab Lanjutan (Follow-up Chat)**:
   - Gunakan bilah input di bagian bawah chatroom untuk menanyakan klarifikasi, misalnya:
     > *"Bagaimana cara memperjelas research gap di Bab 2 sesuai saran reviewer orisinalitas?"*
7. **Unduh Berkas Word**:
   - Klik tombol **"Unduh Laporan (.docx)"** untuk menyimpan hasil review lengkap.

---

## 🏆 Catatan Pengembang & Kredit

- **Repositori GitHub**: [https://github.com/nanay26/HackathonIbm](https://github.com/nanay26/HackathonIbm)
- **Kompetisi**: Hackathon IBM / AI Innovation Submission
- **Lisensi**: MIT License
