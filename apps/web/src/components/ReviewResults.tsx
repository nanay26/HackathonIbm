/**
 * ReviewResults — full structured results display (SDD §F3, §F4).
 *
 * Layout order (SDD §F3-1):
 *   1. Kartu Titik Perdebatan (count per kategori)
 *   2. 3 kartu reviewer
 *   3. Tombol Unduh Word (SDD §F4)
 *
 * Fallback (SDD §F3-5): parse_ok=false → raw text + banner.
 * No dangerouslySetInnerHTML.
 */
"use client";

import { useState } from "react";
import type { ParsedReport } from "@/lib/schemas";
import { downloadExport } from "@/lib/api";
import { ReviewerCard } from "./ReviewerCard";
import { DebateSection } from "./debate/DebateSection";

interface Props {
  result: ParsedReport;
  rawOutput?: string | null;
  reviewId?: string;
  /** Called instead of downloadExport when job has expired (from history) */
  onStatelessDownload?: () => void;
}

// Debate display moved to DebateSection component

export function ReviewResults({ result, rawOutput, reviewId, onStatelessDownload }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    // If caller provides a stateless download handler (expired entries), use that
    if (onStatelessDownload) {
      onStatelessDownload();
      return;
    }
    if (!reviewId) return;
    setIsDownloading(true);
    setDownloadError(null);
    const blob = await downloadExport(reviewId);
    setIsDownloading(false);
    if (!blob) {
      setDownloadError("Gagal mengunduh dokumen. Coba lagi.");
      return;
    }
    // Trigger browser download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date();
    const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 12);
    a.href = url;
    a.download = `Telaah-Review-${ts}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  // ── Fallback: format tidak dikenali (SDD §F3-5) ─────────────────────────────
  if (!result.parse_ok) {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="rounded-[22px] border border-[rgb(var(--warning))]/40 bg-[radial-gradient(circle_at_top_left,rgba(var(--warning),0.12),transparent_35%),rgba(var(--warning),0.08)] px-4 py-3 text-sm text-[rgb(var(--warning))] shadow-[0_12px_28px_rgba(var(--shadow-rgb),0.06)]"
        >
          <strong>Perhatian:</strong> Format output tidak dapat diparsing secara terstruktur.
          Menampilkan teks mentah hasil review. Unduhan Word tetap tersedia.
        </div>

        <pre className="max-h-[600px] overflow-x-auto whitespace-pre-wrap rounded-[22px] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4 text-xs leading-relaxed text-[rgb(var(--fg))] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-mid))]"
          tabIndex={0}
          aria-label="Teks mentah hasil review"
        >
          {rawOutput ?? "(Tidak ada teks mentah tersedia.)"}
        </pre>

        <DownloadButton
          reviewId={reviewId}
          hasStatelessDownload={!!onStatelessDownload}
          isDownloading={isDownloading}
          downloadError={downloadError}
          onDownload={handleDownload}
        />
      </div>
    );
  }

  // ── Hitung per kategori dipindah ke DebateSection ────────────────────────────

  // ── Deteksi apakah ada reviewer gagal/missing ────────────────────────────────
  const hasFailedReviewer = result.reviewers.some(
    (r) => r.status === "failed" || r.status === "missing"
  );

  return (
    <div className="space-y-6">
      {hasFailedReviewer && (
        <div
          role="alert"
          className="rounded-[22px] border border-[rgb(var(--error))]/40 bg-[radial-gradient(circle_at_top_left,rgba(var(--error),0.14),transparent_35%),rgba(var(--error),0.08)] px-4 py-3 text-sm text-[rgb(var(--error))] shadow-[0_12px_28px_rgba(var(--shadow-rgb),0.06)]"
        >
          <strong>Perhatian:</strong> Satu atau lebih reviewer tidak dapat diproses.
          Kartu yang ditandai di bawah menampilkan status gagal/tidak tersedia.
        </div>
      )}

      <DebateSection parsed={result} />

      <section aria-label="Hasil ketiga reviewer" className="rounded-[24px] border border-[rgb(var(--border))] bg-[radial-gradient(circle_at_top_left,rgba(var(--accent-from),0.07),transparent_30%),rgba(var(--surface))] p-4 shadow-[0_18px_40px_rgba(var(--shadow-rgb),0.05)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[rgb(var(--fg))]">Hasil Review</h2>
          <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--fg-muted))]">
            3 reviewer
          </span>
        </div>
        <div className="space-y-4">
          {result.reviewers.map((reviewer) => (
            <ReviewerCard key={reviewer.key} reviewer={reviewer} />
          ))}
        </div>
      </section>

      <DownloadButton
        reviewId={reviewId}
        hasStatelessDownload={!!onStatelessDownload}
        isDownloading={isDownloading}
        downloadError={downloadError}
        onDownload={handleDownload}
      />
    </div>
  );
}

// ── DownloadButton sub-component ─────────────────────────────────────────────

interface DownloadButtonProps {
  reviewId?: string;
  hasStatelessDownload?: boolean;
  isDownloading: boolean;
  downloadError: string | null;
  onDownload: () => void;
}

function DownloadButton({
  reviewId,
  hasStatelessDownload,
  isDownloading,
  downloadError,
  onDownload,
}: DownloadButtonProps) {
  // Show button if we have a live job reviewId OR a stateless download handler
  if (!reviewId && !hasStatelessDownload) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onDownload}
        disabled={isDownloading}
        aria-label="Unduh hasil review dalam format Word"
        className="inline-flex w-fit items-center gap-2 rounded-[16px] border border-[rgb(var(--accent-mid))] bg-gradient-to-r from-[rgb(var(--accent-mid))]/15 via-[rgb(var(--accent-from))]/10 to-[rgb(var(--accent-to))]/10 px-4 py-2.5 text-sm font-medium text-[rgb(var(--accent-mid))] shadow-[0_12px_26px_rgba(var(--shadow-rgb),0.08)] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-mid))]"
      >
        {isDownloading ? "Mengunduh…" : "Unduh Word (.docx)"}
      </button>
      {downloadError && (
        <p role="alert" className="text-xs text-[rgb(var(--error))]">
          {downloadError}
        </p>
      )}
    </div>
  );
}
