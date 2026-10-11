# ASSUMPTIONS.md
## Asumsi & Keputusan Desain

### U0 — Audit & Fondasi

1. **Params Next.js 15**: Halaman `/review/[id]` menggunakan `params` sebagai `Promise<{id: string}>` sesuai
   breaking change Next.js 15 App Router. Solusi: `React.use(params)` di client component.

2. **Copy "paralel"**: Teks "oleh tiga agen AI secara paralel" diganti menjadi "oleh tiga agen AI independen"
   karena Flow 5 memanggil reviewer secara berurutan (SDD §2.2.6). Kata "independen" tetap akurat dan netral.

3. **Geist fonts**: Diinstal sebagai paket npm `geist` (v1.7.2) dan diimpor via `geist/font/sans` dan
   `geist/font/mono` — pendekatan resmi Vercel untuk Next.js App Router.

4. **Dark theme default**: `defaultTheme: "dark"` di `next-themes`. Pengguna dapat beralih ke light
   via toggle yang akan ditambahkan di U1. `suppressHydrationWarning` di `<html>` mencegah mismatch
   hydration karena next-themes mengubah class setelah mount.

5. **Design tokens via CSS variables + Tailwind extend**: Semua warna didefinisikan sebagai CSS custom
   properties (format `R G B` tanpa koma agar Tailwind alpha modifier `/ <alpha>` bekerja). Komponen
   tidak boleh memakai warna Tailwind hardcode (e.g. `text-blue-600`); gunakan token (`text-fg`, `text-muted`, dll.)
   mulai U1 pada komponen baru.

6. **Dependensi yang diinstal di U0** (diverifikasi kompatibilitas dengan React 19 / Next.js 15):
   - `three@^0.186.1`, `@react-three/fiber@^9.x`, `@react-three/drei@^10.x` — R3F 9 mendukung React 19
   - `framer-motion@^14.x` — mendukung React 19
   - `zustand@^5.x` — mendukung React 19
   - `idb-keyval@^6.x` — library agnostik framework
   - `next-themes@^0.4.x` — mendukung Next.js 15 App Router
   - `geist@^1.7.x` — paket font resmi Vercel
   - `@react-three/postprocessing@^3.x`, `maath@^0.10.x`, `@types/three`

7. **Komponen lama (UploadForm, ReviewerCard, dll.)** masih memakai warna Tailwind hardcode (gray, blue, dll.)
   Ini diterima di U0; akan dimigrasi ke design tokens saat komponen di-redesign di U2/U4.

### U3 — Riwayat Lokal & Perbaikan U2

8. **`window.confirm()` dihapus**: Semua `window.confirm()` diganti dengan UI inline
   (`ReplaceConfirmBar` di Composer, inline alertdialog di Sidebar `ClearAllButton`).
   Alasan: `window.confirm()` tidak bisa diakses lewat keyboard di beberapa browser,
   tidak kompatibel dengan CSP `sandbox`, dan tidak bisa di-style.

9. **Title riwayat via sessionStorage**: Saat Composer mengirim review, judul (nama file
   atau 50 karakter pertama teks) ditulis ke `sessionStorage` dengan key
   `dp-review-meta-{review_id}`. Review page membacanya saat membuat stub IndexedDB,
   lalu segera menghapusnya dari sessionStorage. Ini menghindari perubahan API.

10. **Warna hardcode dihapus dari ReviewerCard, DebateCard, ReviewResults**: Semua
    kelas Tailwind seperti `text-gray-800`, `border-red-300` diganti dengan token
    CSS variables (`text-[rgb(var(--fg))]`, dll.) agar konsisten dengan dark/light theme.

11. **UploadForm.tsx dihapus**: File ini sudah tidak diimpor di mana pun sejak U2
    selesai. Dihapus di U3 untuk menjaga codebase bersih.

12. **CopyButton di ReviewerCard**: Tombol "Salin" ditambahkan pada blok Rujukan verbatim
    (spec Bagian 7b). Menggunakan `navigator.clipboard.writeText()` dengan fallback
    graceful jika clipboard API tidak tersedia.

13. **Export endpoint sudah ada**: `POST /api/v1/export/docx` dan test-nya sudah ada
    sebelum U3 dimulai (dibuat di fase sebelumnya). U3 hanya memverifikasi test lulus.

### U4 — Thread & Kartu Hasil

14. **Thread layout menggantikan halaman hasil lama**: `/review/[id]/page.tsx` sekarang
    menggunakan `ThreadLayout` + `UserBubble` + `StatusBubble` + `ResultBubble`.
    `ReviewProgress` masih ada untuk kompatibilitas test, tapi `StatusBubble` adalah
    komponen utama di thread view. `ReviewProgress` tetap dipakai oleh test suite.

15. **TiltCard (framer-motion)**: `ReviewerCard` dibungkus `TiltCard` yang menggunakan
    `useMotionValue` + `useSpring` + `useTransform` dari framer-motion untuk efek tilt
    3D halus saat hover. Menggunakan CSS `transformPerspective` (bukan WebGL).
    Prefers-reduced-motion dihormati via globals.css (transition-duration: 0.01ms).

16. **`char_count` di sessionStorage meta**: Ditambahkan ke payload meta sehingga
    `UserBubble` bisa menampilkan jumlah karakter dokumen di bubble pengguna.

17. **`onStatelessDownload` prop di ReviewResults**: Prop opsional yang dipanggil
    sebagai pengganti `downloadExport(reviewId)` ketika job sudah expired (untuk
    entri riwayat). `ResultBubble` meneruskan prop ini dari review page.

18. **`PageTransition`**: Framer-motion fade+slide (opacity 0→1, y 8→0, 200ms)
    dibungkus di `AppShell` untuk semua halaman. Prefers-reduced-motion dikecilkan
    otomatis via globals.css.

### U5 — Debate Graph 3D + Tab Daftar

19. **`buildGraphModel` murni tanpa browser API**: Fungsi di `lib/graph-model.ts`
    tidak punya import WebGL/Three — bisa ditest di jsdom tanpa mock Canvas.

20. **`line_` JSX tidak valid di @react-three/fiber v9**: Gunakan `<primitive object={lineObj} />`
    dengan `THREE.Line` yang dibuat via `useMemo`. Ini juga memungkinkan akses langsung
    ke `LineDashedMaterial` untuk animasi gapSize tanpa error TypeScript.

21. **Canvas jsdom fallback**: `webGLAvailable()` mengembalikan `false` di jsdom
    (karena `getContext` mengembalikan `null` setelah stub). `DebateGraphCanvas` render
    fallback gradient — semua test `ReviewResults` tetap lulus.

22. **`window.matchMedia` mock di setup.ts**: Ditambahkan stub no-op karena jsdom
    tidak mengimplementasikan `matchMedia`. `HTMLCanvasElement.prototype.getContext`
    juga di-stub ke `() => null`.

23. **Tab Daftar default tersembunyi**: `hidden=""` di tabpanel Daftar saat tab Map
    aktif — konten hanya dirender saat tab aktif (`activeTab === "list"`), menghemat
    rendering WebGL tidak perlu saat pengguna tidak melihatnya.

24. **ISU_UNIK single reviewer → satellite, bukan edge**: Sesuai spec 7c.
    DebatePoint dengan ISU_UNIK dan hanya 1 reviewer yang bisa diidentifikasi
    dari `reviewers[]` akan menjadi `GraphSatellite` yang mengorbit node reviewer.
    Multi-reviewer ISU_UNIK tetap menjadi edge biasa.

### U6 — Hero 3D + Polish

25. **Hero 3D dipisah menjadi 3 file**: `HeroCanvas.tsx` (guard WebGL/reduced-motion,
    next/dynamic), `HeroCanvasInner.tsx` (R3F Canvas + IntersectionObserver), dan
    `HeroScene.tsx` (scene geometry + PerformanceMonitor). Pemisahan ini memastikan
    dynamic import hanya menarik modul yang perlu WebGL.

26. **Zustand `useHeroStore`**: State `idle | typing | reviewing | done | error`
    mengontrol kecepatan orbit dan intensitas glow. State "reviewing" hanya berarti
    "request sedang dikirim" — tidak menyiratkan tahap progres (aturan 3).

27. **`onTypingChange` prop di Composer**: Prop opsional yang dipanggil saat
    textarea content berubah. `ComposerWithHero` di `page.tsx` meneruskan state
    ke `useHeroStore`. Composer sendiri tidak bergantung pada hero store (tetap
    reusable).

28. **IntersectionObserver di HeroCanvasInner**: frameloop dihentikan (`frameloop="never"`)
    saat canvas tidak terlihat (tab lain, browser background). Ini menghemat GPU
    secara signifikan.

29. **`.hero-gradient-fallback` CSS class**: Gradient radial statis sebagai fallback
    saat WebGL tidak tersedia atau prefers-reduced-motion aktif. Tidak ada JavaScript
    yang ditunggu untuk menampilkan gradient ini.

30. **`key` tidak boleh di-spread**: `ORBS.map(({ key, ...orbProps }) => ...)` — 
    destructuring `key` agar tidak ter-spread ke `OrbMesh` props (TypeScript error TS2783).
