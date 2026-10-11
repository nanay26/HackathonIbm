/**
 * ResultBubble — membungkus ReviewResults dalam thread layout Telaah.
 *
 * Spec Bagian 5c:
 *  - Setelah done: hasil tampil sebagai pesan kaya
 *  - Error/timeout tampil jujur, tanpa konten pengganti
 *  - parse_ok=false: fallback teks mentah (perilaku F3 yang ada)
 */
"use client";

import { ReviewResults } from "@/components/ReviewResults";
import type { ParsedReport } from "@/lib/schemas";
import { cn } from "@/lib/utils";

interface Props {
  result: ParsedReport | null;
  rawOutput?: string | null;
  reviewId?: string;
  /** Untuk unduh via stateless endpoint (riwayat lama) */
  onStatelessDownload?: () => void;
  className?: string;
}

export function ResultBubble({
  result,
  rawOutput,
  reviewId,
  onStatelessDownload,
  className,
}: Props) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      {/* Avatar */}
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center
                   rounded-md bg-[rgb(var(--accent-mid))] text-white font-display text-base
                   shadow-sm"
      >
        t
      </span>

      {/* Konten hasil — full width */}
      <div className="min-w-0 flex-1">
        {result ? (
          <ReviewResults
            result={result}
            rawOutput={rawOutput}
            reviewId={reviewId}
            onStatelessDownload={onStatelessDownload}
          />
        ) : rawOutput ? (
          /* parse_ok=false dengan rawOutput langsung (tanpa ParsedReport wrapper) */
          <div className="space-y-3">
            <div
              role="alert"
              className="rounded-lg border border-[rgb(var(--warning))]/40
                         bg-[rgb(var(--warning))]/10 px-4 py-3 text-sm
                         text-[rgb(var(--warning))]"
            >
              <strong>Perhatian:</strong> Hasil terstruktur tidak tersedia.
              Menampilkan teks mentah.
            </div>
            <pre
              className="whitespace-pre-wrap rounded-lg border border-[rgb(var(--border))]
                         bg-[rgb(var(--surface-2))] p-4 text-xs font-mono leading-relaxed
                         overflow-x-auto max-h-[600px] focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]"
              tabIndex={0}
              aria-label="Teks mentah hasil review"
            >
              {rawOutput}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-[rgb(var(--fg-muted))]">
            (Tidak ada konten tersedia.)
          </p>
        )}
      </div>
    </div>
  );
}
