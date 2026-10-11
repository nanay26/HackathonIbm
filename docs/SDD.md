SDD - TELAAH WEB APP (MVP)
Versi 1.0 | Status: Draft | Sumber: PRD_Dewan_Penilai v1.0 (Bagian 7)

========================================
1. TUJUAN & RUANG LINGKUP
========================================
1.1 Tujuan: web app publik agar mahasiswa dapat mengunggah proposal skripsi,
    memperoleh review multi-agent dari Langflow Flow 5 (Full Review
    Orchestrator), melihat Titik Perdebatan, dan mengunduh hasil sebagai Word.
1.2 In scope MVP:
    a. F1 Intake Dokumen
    b. F2 Eksekusi Review & Progress Jujur
    c. F3 Tampilan Hasil Review
    d. F4 Unduh Word
    e. F5 Riwayat Lokal (IndexedDB, hanya di browser pengguna)
    f. Lintas fitur: rate limiting, kuota harian, disclaimer, privasi
1.3 Out of scope MVP: login/akun, riwayat akun di server, kolaborasi dosen,
    multi-bahasa, jenis dokumen selain proposal skripsi (jurnal/esai/tesis
    hanya tampil disabled), pemilihan gaya sitasi, integrasi plagiarisme/
    citation validator, analytics dashboard.

========================================
2. FONDASI ARSITEKTUR
========================================
2.1 Diagram:
    Browser (Next.js)
        |  HTTPS / JSON
        v
    API Layer (FastAPI)  --- validasi, ekstraksi teks, rate limit, job store
        |  MCP streamable HTTP + header x-api-key
        v
    Langflow MCP: assess_proposal_feasibility -> analyze_originality
                  -> propose_proposal_revision -> Gemini

2.2 Prinsip wajib (turunan PRD Bagian 4):
    1. Web app TIDAK lewat IBM Bob. Bob tetap jadi developer console.
    2. LANGFLOW_API_KEY hanya ada di backend, tidak pernah ke browser.
    3. Baris "Rujukan" tidak boleh dibuang atau diubah di lapisan mana pun.
    4. Kegagalan dilaporkan apa adanya: tidak ada hasil karangan, tidak ada
       persentase progress palsu.
    5. Dokumen tidak disimpan permanen; isi dokumen tidak boleh masuk log.
    6. Backend memanggil tiga reviewer melalui MCP secara sequential:
       feasibility -> originality -> revision; concurrency global dibatasi
       (MAX_CONCURRENT_REVIEWS=1).
    7. Disclaimer tampil di UI dan di file export: "Asistensi akademik, tidak
       menggantikan penilaian dosen pembimbing/penguji resmi."

========================================
3. TECH STACK
========================================
3.1 Frontend : Next.js 15 (App Router) + TypeScript, Tailwind CSS,
                shadcn/ui (Accordion, Badge, Alert, Button, Tabs),
                TanStack Query (polling), Zod
3.2 Backend  : Python 3.11, FastAPI, Pydantic v2, httpx (async), pdfplumber,
                python-docx, slowapi (rate limit), uvicorn (1 worker)
3.3 Job store: in-memory dengan TTL (interface JobStore, siap diganti Redis)
3.4 Test     : pytest + pytest-asyncio + respx (backend), Vitest + Testing
                Library (frontend), ruff + mypy, eslint + tsc
3.5 DevOps   : Docker untuk api, docker-compose untuk dev lokal, GitHub
                Actions (lint + test)
3.6 Deploy   : web -> Vercel; api -> Railway atau Render; Langflow -> Railway/
                Render/HF Spaces (Fase 3c di PRD)
3.7 Catatan  : in-memory store mengharuskan 1 instance/1 worker. Naik ke
                Redis jika perlu scale.

========================================
4. STRUKTUR REPO (monorepo)
========================================
telaah-web/
  docs/SDD.md
  .bob/rules/                  (aturan kerja Bob untuk repo ini)
  apps/
    web/                       (Next.js)
      src/app/                 (page upload, page hasil /review/[id])
      src/components/
      src/lib/                 (api client, zod schema)
    api/                       (FastAPI)
      app/main.py
      app/config.py            (pydantic-settings, baca env)
      app/routers/             (documents.py, reviews.py, health.py)
      app/services/            (extractor.py, langflow_client.py,
                                parser.py, docx_builder.py, job_store.py)
      app/models/              (schemas.py)
      app/limits.py            (rate limit + kuota global)
      tests/ + tests/fixtures/ (sample output Flow 5, PDF/DOCX contoh)
  docker-compose.yml
  .env.example
  README.md

========================================
5. FITUR
========================================

--- F1. INTAKE DOKUMEN ---
Deskripsi: pengguna memilih jenis dokumen, lalu mengunggah file (PDF/DOCX)
atau paste teks; sistem mengekstrak teks dan menampilkannya untuk dicek.
Aturan:
  1. Selector jenis dokumen: "Proposal Skripsi" aktif; "Skripsi/Tesis",
     "Jurnal", "Esai" tampil disabled berlabel "Segera hadir".
  2. File: PDF atau DOCX, maks 10 MB. Validasi magic bytes, bukan hanya
     ekstensi.
   3. Panjang teks: min 1.500, maks MAX_INPUT_CHARS (default 500.000) karakter.
  4. Teks hasil ekstraksi tampil di textarea yang bisa diedit sebelum submit.
Acceptance criteria:
  1. Given PDF bertext layer <= 10 MB, when diunggah, then teks tampil di
     preview beserta jumlah karakter.
  2. Given file > 10 MB atau bukan PDF/DOCX, then ditolak dengan pesan
     spesifik dan tidak ada request ke Langflow.
  3. Given PDF hasil scan (tanpa text layer), then error: "PDF tampaknya hasil
     scan dan belum didukung. Gunakan PDF/DOCX berteks atau paste teks."
  4. Given teks > MAX_INPUT_CHARS, then tombol "Mulai Review" disabled dan
     batas ditampilkan.
  5. Given teks < 1.500 karakter, then tombol disabled dengan alasan jelas.
  6. Given DOCX valid, then teks terekstrak dengan urutan paragraf benar.

--- F2. EKSEKUSI REVIEW & PROGRESS JUJUR ---
Deskripsi: backend membuat job asinkron, memanggil tool reviewer MCP satu per
satu, frontend polling status nyata termasuk reviewer yang sedang berjalan.
Aturan:
  1. POST /reviews membuat job lalu langsung return 202 + review_id.
  2. Background task membuka sesi MCP Langflow menggunakan
     LANGFLOW_MCP_URL, kemudian memanggil assess_proposal_feasibility,
     analyze_originality, dan propose_proposal_revision secara berurutan
     dengan header x-api-key; jangan mulai pemanggilan berikut sebelum hasil
     tool sebelumnya diterima.
  3. Timeout = REVIEW_TIMEOUT_SECONDS (default 360), disesuaikan dengan
     waktu eksekusi Flow 5 aktual yang dapat mendekati lima menit.
  4. Status job: queued, running, done, failed, timeout, cancelled.
  5. UI menampilkan status nyata + timer berjalan + estimasi batas enam menit.
     DILARANG menampilkan persentase/progress bar palsu.
  6. Rate limit per IP: 3 review/jam dan 10/hari. Kuota global harian
     GLOBAL_DAILY_REVIEW_CAP (default 100).
  7. Input disimpan sementara di memori untuk review aktif. Jika review gagal
     atau timeout, input dipertahankan maksimal 30 menit agar dapat dicoba lagi
     pada job dan ruang percakapan yang sama; input dihapus setelah sukses/TTL.
Acceptance criteria:
  1. Given input valid, when POST /reviews, then 202 + review_id dalam < 1 dtk.
  2. Given job berjalan, then GET /reviews/{id} mengembalikan status +
     elapsed_seconds; frontend polling tiap 3 detik dan berhenti di status
     terminal.
  3. Given limit terlampaui, then 429 + header Retry-After; UI menampilkan
     kapan bisa mencoba lagi.
  4. Given kuota global habis, then 503 kode DAILY_QUOTA_EXCEEDED.
  5. Given Langflow tidak membalas dalam batas timeout, then status timeout
     dan UI berkata jujur bahwa review tidak selesai. Tidak ada hasil buatan.
  6. Given Langflow tidak terjangkau/5xx, then status failed dengan kode
     LANGFLOW_UNAVAILABLE. Retry otomatis maksimal 1x hanya untuk error
     koneksi, tidak untuk timeout.
  7. Given pengguna menekan "Batalkan", then job cancelled dan request httpx
     dibatalkan.
  8. Given running job >= MAX_CONCURRENT_REVIEWS, then job baru berstatus queued
     dan diproses berurutan.
  9. Given job berhasil atau TTL input gagal/timeout berakhir, then teks
     dokumen dihapus dari memori.
  10. Given job gagal atau timeout dan input belum kedaluwarsa, then tombol
      "Coba lagi di ruang ini" mengulang job dengan ID yang sama.

--- F3. TAMPILAN HASIL REVIEW ---
Deskripsi: hasil Flow 5 diparse menjadi struktur dan ditampilkan terbaca;
Titik Perdebatan disorot.
Aturan:
  1. Layout atas ke bawah: banner disclaimer; kartu Titik Perdebatan
     (jumlah per kategori); kartu 3 reviewer (Metodologi, Orisinalitas,
     Revisi) berisi VERDICT, RINGKASAN, TEMUAN (accordion), Rekomendasi
     Prioritas.
  2. Tiap temuan: nomor, tag [ASPEK], deskripsi, blok kutipan "Rujukan".
  3. Titik Perdebatan: badge KONTRADIKSI / PENGUATAN SILANG / ISU UNIK,
     dibedakan dengan label teks + ikon (tidak hanya warna).
  4. Parser toleran: jika format tidak dikenali, tampilkan teks mentah
     terformat + banner "Format hasil tidak dikenali sepenuhnya".
  5. Render semua teks sebagai text (tanpa dangerouslySetInnerHTML).
Acceptance criteria:
  1. Given temuan memiliki Rujukan, then kutipan tampil verbatim dan tidak
     dipotong.
  2. Given temuan tanpa Rujukan, then tampil tag "Tanpa rujukan" (jangan
     disembunyikan).
  3. Given satu reviewer gagal/tidak ada di output, then kartunya
     berstatus "Gagal/Tidak tersedia" + banner peringatan; tidak diisi
     konten pengganti.
  4. Given parser gagal, then fallback teks mentah tampil dan tombol export
     tetap berfungsi.
  5. Given layar 360 px, then layout tetap terbaca tanpa scroll horizontal
     dan accordion bisa dioperasikan dengan keyboard.
  6. Disclaimer selalu terlihat tanpa interaksi.

--- F4. UNDUH WORD ---
Deskripsi: backend membangun .docx dari hasil terparse (bukan bergantung
pada file Flow 4) sehingga konsisten lintas platform.
Aturan:
  1. Styling mengikuti Flow 4: Times New Roman 12, justify, tabel bordered,
     penomoran bagian otomatis, tanpa warna dan tanpa emoji.
  2. Disclaimer di awal dan akhir dokumen.
  3. Jika parse_ok = false, dokumen berisi teks mentah dengan styling sama.
  4. File dibuat on-the-fly, tidak disimpan.
   5. Nama file: Telaah-Review-YYYYMMDD-HHmm.docx
Acceptance criteria:
  1. Given job done, when GET /reviews/{id}/export.docx, then file .docx valid
     yang terbuka di Word/LibreOffice.
  2. Jumlah baris Rujukan di dokumen = jumlah Rujukan di hasil.
  3. Given job belum done -> 409; job kedaluwarsa -> 410.
  4. Dokumen tidak mengandung emoji dan tidak ada teks berwarna.

--- F5. RIWAYAT LOKAL ---
Deskripsi: riwayat review disimpan hanya di IndexedDB browser pengguna.
Server tidak menyimpan riwayat persisten. Privasi-by-default.
Aturan:
  1. Simpan di IndexedDB: {id, title, doc_type, created_at, status,
     result (ParsedReport), raw_output, error}. Teks dokumen mentah TIDAK
     disimpan.
  1a. Input review ditahan sementara di memori backend selama job aktif dan,
      jika gagal/timeout, maksimal 30 menit untuk mendukung retry.
  2. Simpan hasil saat job mencapai status terminal.
  3. Entri lama (server TTL habis): tampilkan dari data lokal; gunakan
     POST /api/v1/export/docx (stateless) untuk unduhan.
  4. Entri running saat reload: lanjutkan polling; jika 404/410, tandai
     "Kedaluwarsa".
  5. Fitur: cari, ganti nama, hapus per item, hapus semua (dengan konfirmasi
     inline, tanpa window.confirm()), toggle "Simpan riwayat".
  6. Disclaimer privasi di sidebar: "Riwayat hanya di perangkat ini."
  7. Indikator status per item dengan ikon + teks (bukan hanya warna).
Acceptance criteria:
  1. Given refresh halaman, then riwayat tetap ada di sidebar.
  2. Given entri done dengan server TTL habis, when buka entri, then
     hasil tampil dari lokal dan tombol "Unduh Word" tersedia.
  3. Given "Hapus semua riwayat", then konfirmasi inline muncul sebelum
     data dihapus.
  4. Teks dokumen mentah tidak tersimpan di IndexedDB.

========================================
6. API CONTRACT (prefix /api/v1)
========================================
6.1 GET  /health
      -> 200 {status:"ok", langflow:"reachable|unreachable|mock"}
6.2 POST /documents/extract   (multipart: file)
      -> 200 {text, char_count, filename, warnings:[]}
      -> 400 {code:"FILE_TOO_LARGE|UNSUPPORTED_TYPE|NO_TEXT_LAYER|EMPTY"}
6.3 POST /reviews   {doc_type:"proposal_skripsi", text}
      -> 202 {review_id}
      -> 400 INVALID_LENGTH | 429 RATE_LIMITED | 503 DAILY_QUOTA_EXCEEDED
6.4 GET  /reviews/{id}
      -> 200 {status, elapsed_seconds, result?:ParsedReport,
              raw_output?:string, error?:{code,message},
              retry_available:boolean}
      -> 404 NOT_FOUND | 410 EXPIRED
6.4a POST /reviews/{id}/retry
      -> 202 {review_id} (ID dan ruang percakapan tetap sama)
      -> 409 NOT_RETRYABLE | 410 EXPIRED | 503 DAILY_QUOTA_EXCEEDED
6.5 DELETE /reviews/{id}   -> 204 (batalkan + hapus)
6.6 GET  /reviews/{id}/export.docx -> file | 409 NOT_READY | 410 EXPIRED
6.7 POST /export/docx  {parsed?: ParsedReport, raw_output?: str, doc_type}
      -> file .docx (stateless, tidak menyimpan apa pun)
      -> 400 EMPTY_BODY (jika keduanya absen)
      Gunakan untuk riwayat lokal yang sudah melewati TTL server.
Format error seragam: {error:{code, message}}.

========================================
7. DATA MODEL
========================================
7.1 ReviewJob: id(uuid4), doc_type, status, created_at, started_at,
    finished_at, input_chars, raw_output|null, parsed|null, error|null
    (teks input hanya hidup di memori selama job aktif)
7.2 ParsedReport: parse_ok(bool), reviewers[ReviewerResult],
    debate_points[DebatePoint]
7.3 ReviewerResult: key(metodologi|orisinalitas|revisi),
    status(ok|failed|missing), verdict, summary, findings[Finding],
    priority_recommendations[str]
7.4 Finding: no(int), aspect(str), description(str), reference(str|null)
7.5 DebatePoint: type(KONTRADIKSI|PENGUATAN_SILANG|ISU_UNIK), aspect,
    description, reviewers[str], references[str]
7.6 TTL job: JOB_TTL_SECONDS (default 1800), lalu dihapus otomatis.

========================================
8. NON-FUNCTIONAL
========================================
8.1 Keamanan: CORS hanya ALLOWED_ORIGINS; security headers; validasi magic
    bytes; batas ukuran upload di level stream; secret hanya lewat env.
8.2 Privasi: tidak ada isi dokumen/hasil di log (log hanya id, status,
    durasi, jumlah karakter). Tidak ada penyimpanan permanen.
8.3 Prompt injection: teks dokumen selalu diperlakukan sebagai data; backend
    tidak menafsirkan isinya sebagai instruksi.
8.4 Performa: respons non-review < 500 ms; ekstraksi PDF 10 MB < 10 dtk.
8.5 Observability: log terstruktur JSON + request_id; /health.
8.6 Aksesibilitas: kontras WCAG AA, label form, fokus keyboard.
8.7 Bahasa UI: Indonesia.

========================================
9. ENVIRONMENT VARIABLES (.env.example)
========================================
LANGFLOW_BASE_URL, LANGFLOW_API_KEY, LANGFLOW_FLOW5_ID, LANGFLOW_MOCK=false,
REVIEW_TIMEOUT_SECONDS=360, MAX_INPUT_CHARS=500000, MAX_UPLOAD_MB=10,
LANGFLOW_MCP_URL, MAX_CONCURRENT_REVIEWS=1, RATE_LIMIT_HOURLY=3, RATE_LIMIT_DAILY=10,
GLOBAL_DAILY_REVIEW_CAP=100, JOB_TTL_SECONDS=1800, ALLOWED_ORIGINS,
NEXT_PUBLIC_API_BASE_URL

========================================
10. RENCANA IMPLEMENTASI & DEFINITION OF DONE
========================================
Fase 0 - Scaffold: monorepo, config, lint, CI, docker-compose, .env.example.
  DoD: 1) web & api jalan lokal  2) CI hijau  3) /health 200
Fase 1 - Backend inti: config, JobStore+TTL, rate limit, langflow_client
  (real + MOCK dari fixture), error format seragam.
  DoD: 1) mock mode memberi penanda simulasi (tanpa mengaku menganalisis dokumen)
       2) unit test client (respx)
Fase 2 - F1 Intake: extractor PDF/DOCX + endpoint + UI upload/paste.
  DoD: seluruh AC F1 lulus (test + manual)
Fase 3 - F2 Eksekusi: POST/GET/DELETE reviews, background runner, polling UI.
  DoD: seluruh AC F2 lulus, termasuk timeout dan cancel
Fase 4 - F3 Hasil: parser + UI hasil + fallback mentah.
  DoD: seluruh AC F3 lulus; parser lulus test fixture normal, reviewer gagal,
       dan format rusak
Fase 5 - F4 Export: docx_builder + endpoint + tombol unduh.
  DoD: seluruh AC F4 lulus; dibuka di Word/LibreOffice
Fase 6 - Hardening & deploy: e2e alur utama, README, Dockerfile api, panduan
  deploy Vercel + Railway/Render, uji dengan Langflow cloud sungguhan.
  DoD: alur upload -> hasil -> unduh berjalan di environment cloud

========================================
11. RISIKO & OPEN QUESTIONS
========================================
11.1 Flow 5 dapat mengembalikan heading reviewer bernomor dan markdown.
     Parser menerima format tersebut serta format kanonis fixture; validasi
     dilakukan dengan output nyata tanpa menyimpan isi dokumen pengguna.
11.2 Host Langflow cloud belum dipilih (Railway/Render/HF Spaces).
11.3 Biaya Gemini: bergantung pada rate limit dan kuota global.
11.4 Dokumen sangat panjang di cloud berisiko timeout: batas MAX_INPUT_CHARS
     perlu dituning setelah uji nyata.