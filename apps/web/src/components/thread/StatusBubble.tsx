/**
 * StatusBubble — pesan Telaah selama review berjalan atau gagal.
 *
 * Spec Bagian 5b:
 *  - Status nyata (queued / running / failed / timeout / cancelled)
 *  - Timer berjalan (live tick)
 *  - Teks statis "Biasanya 1–3 menit"
 *  - Tombol Batalkan
 *  - DILARANG progress bar persentase palsu
 *
 * Design: paper card dengan mark Telaah di kiri, bubble konten di kanan.
 */
"use client";

import { useEffect, useRef, useState, createElement } from "react";
import { XCircle, Clock, Loader2, CheckCircle2, Ban, RotateCcw, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/lib/schemas";
import { TERMINAL_STATUSES } from "@/lib/schemas";

interface Props {
  status: JobStatus;
  elapsedSeconds: number;
  error?: { code: string; message: string } | null;
  onCancel: () => void;
  isCancelling: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
  retryError?: string | null;
  retryAvailable?: boolean;
  activeReviewer?: string | null;
  completedReviewers?: string[];
  approval?: {
    prompt: string;
    options: { action_id: string; label: string }[];
  } | null;
  onApproval?: (actionId: string) => void;
  isSubmittingApproval?: boolean;
}

const STATUS_META: Record<
  JobStatus,
  { label: string; Icon: React.ElementType; iconClass: string }
> = {
  queued: {
    label: "Menunggu giliran…",
    Icon: Clock,
    iconClass: "text-[rgb(var(--warning))]",
  },
  running: {
    label: "Sedang menganalisis…",
    Icon: Loader2,
    iconClass: "text-[rgb(var(--accent-mid))] animate-spin",
  },
  awaiting_approval: {
    label: "Menunggu persetujuan Anda",
    Icon: ShieldQuestion,
    iconClass: "text-[rgb(var(--warning))]",
  },
  done: {
    label: "Selesai",
    Icon: CheckCircle2,
    iconClass: "text-[rgb(var(--success))]",
  },
  failed: {
    label: "Gagal",
    Icon: XCircle,
    iconClass: "text-[rgb(var(--error))]",
  },
  timeout: {
    label: "Waktu habis",
    Icon: XCircle,
    iconClass: "text-[rgb(var(--error))]",
  },
  cancelled: {
    label: "Dibatalkan",
    Icon: Ban,
    iconClass: "text-[rgb(var(--fg-muted))]",
  },
};

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  if (m === 0) return `${s}d`;
  return `${m}m ${s}d`;
}

export function StatusBubble({
  status,
  elapsedSeconds,
  error,
  onCancel,
  isCancelling,
  onRetry,
  isRetrying = false,
  retryError,
  retryAvailable = false,
  activeReviewer = null,
  completedReviewers = [],
  approval,
  onApproval,
  isSubmittingApproval = false,
}: Props) {
  const [displayElapsed, setDisplayElapsed] = useState(elapsedSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTerminal = TERMINAL_STATUSES.includes(status);
  const meta = STATUS_META[status];

  // Sync from server value
  useEffect(() => {
    setDisplayElapsed(elapsedSeconds);
  }, [elapsedSeconds]);

  // Live tick while running
  useEffect(() => {
    if (isTerminal) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setDisplayElapsed((p) => p + 1);
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isTerminal]);

  return (
    <div className="flex items-start gap-3" aria-live="polite" role="status">
      {/* Avatar */}
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center
                   rounded-md bg-[rgb(var(--accent-mid))] text-white font-display text-base
                   shadow-sm"
      >
        t
      </span>

      {/* Card */}
      <div
        className={cn(
          "flex-1 max-w-[85%] sm:max-w-[70%]",
          "rounded-lg rounded-tl-sm",
          "border border-[rgb(var(--border))]",
          "paper-surface px-4 py-3",
          "flex flex-col gap-2.5",
        )}
      >
        {/* Status row */}
        <div className="flex items-center gap-2">
          {createElement(meta.Icon as React.ElementType<{ size?: number; className?: string; "aria-hidden"?: boolean }>, {
            size: 16,
            "aria-hidden": true,
            className: cn("shrink-0", meta.iconClass),
          })}
          <span className="text-sm font-medium text-[rgb(var(--fg))]">
            {meta.label}
          </span>
        </div>

        {(status === "queued" || status === "running") && (
          <ol
            aria-label="Tahapan reviewer"
            className="grid grid-cols-1 gap-1.5 border-t border-[rgb(var(--border))] pt-2 sm:grid-cols-3"
          >
            {[
              ["METODOLOGI", "Metodologi"],
              ["ORISINALITAS", "Orisinalitas"],
              ["REVISI", "Revisi"],
            ].map(([key, label], index) => {
              const completed = completedReviewers.includes(key);
              const active = activeReviewer === key;
              const waiting = !completed && !active;
              return (
                <li
                  key={key}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors",
                    completed && "border-[rgb(var(--success))]/35 bg-[rgb(var(--success))]/8 text-[rgb(var(--success))]",
                    active && "border-[rgb(var(--accent-mid))]/50 bg-[rgb(var(--accent-mid))]/10 text-[rgb(var(--accent-mid))] shadow-[0_0_18px_rgba(var(--accent-mid),0.12)]",
                    waiting && "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-[rgb(var(--fg-muted))]",
                  )}
                >
                  <span className="font-mono text-[10px] opacity-75">0{index + 1}</span>
                  <span className="min-w-0 truncate font-medium">{label}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wider">
                    {completed ? "Selesai" : active ? "Berjalan" : "Antrean"}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {/* Hint + timer */}
        {!isTerminal && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-[rgb(var(--fg-muted))]">
              Biasanya 1–3 menit
            </span>
            <span
              className="font-mono text-xs text-[rgb(var(--fg-muted))]"
              aria-label={`Waktu berjalan: ${formatElapsed(displayElapsed)}`}
            >
              {formatElapsed(displayElapsed)}
            </span>
          </div>
        )}

        {status === "awaiting_approval" && approval && (
          <div className="space-y-2 rounded-lg border border-[rgb(var(--warning))]/40
                          bg-[rgb(var(--warning))]/8 px-3 py-2.5">
            <p className="text-xs text-[rgb(var(--fg))]">{approval.prompt}</p>
            <div className="flex flex-wrap gap-2">
              {approval.options.map((option) => (
                <button
                  key={option.action_id}
                  type="button"
                  onClick={() => onApproval?.(option.action_id)}
                  disabled={isSubmittingApproval}
                  className="rounded-lg border border-[rgb(var(--border))]
                             bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium
                             text-[rgb(var(--fg))] hover:bg-[rgb(var(--surface-2))]
                             disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmittingApproval ? "Mengirim…" : option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Timer at terminal */}
        {isTerminal && (
          <span
            className="font-mono text-xs text-[rgb(var(--fg-muted))]"
            aria-label={`Total waktu: ${formatElapsed(displayElapsed)}`}
          >
            {formatElapsed(displayElapsed)}
          </span>
        )}

        {/* Error detail — honest, no fabricated content */}
        {(status === "failed" || status === "timeout") && error && (
          <div
            role="alert"
            className="rounded-lg border border-[rgb(var(--error))]/30
                       bg-[rgb(var(--error))]/8 px-3 py-2 text-xs
                       text-[rgb(var(--error))]"
          >
            <span className="font-semibold">{error.code}</span>: {error.message}
          </div>
        )}

        {(status === "failed" || status === "timeout") && (
          <>
            {retryAvailable && onRetry ? (
              <div className="flex flex-col items-start gap-1">
                <button
                  type="button"
                  onClick={() => onRetry()}
                  disabled={isRetrying}
                  aria-label="Coba lagi di ruang ini"
                  className="self-start inline-flex items-center gap-2 rounded-lg border
                             border-[rgb(var(--accent-mid))]/40 bg-[rgb(var(--accent-mid))]/10
                             px-3 py-1.5 text-xs font-medium text-[rgb(var(--accent-mid))]
                             hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Coba lagi di ruang ini
                </button>
                {isRetrying && (
                  <span className="text-[11px] text-[rgb(var(--fg-muted))]">
                    Mencoba lagi…
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-[rgb(var(--fg-muted))]">
                Teks dokumen untuk mencoba lagi sudah tidak tersedia. Mulai review baru
                untuk mengirim dokumen kembali.
              </p>
            )}
            {retryError && (
              <p
                role="alert"
                className="rounded-lg border border-[rgb(var(--error))]/30
                           bg-[rgb(var(--error))]/8 px-3 py-2 text-xs
                           text-[rgb(var(--error))]"
              >
                {retryError}
              </p>
            )}
          </>
        )}

        {/* Cancel button */}
        {!isTerminal && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isCancelling}
            aria-label="Batalkan review ini"
            className="self-start rounded-lg border border-[rgb(var(--border))]
                       bg-[rgb(var(--surface-2))] px-3 py-1 text-xs font-medium
                       text-[rgb(var(--fg-muted))] hover:text-[rgb(var(--error))]
                       hover:border-[rgb(var(--error))]/40
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]"
          >
            {isCancelling ? "Membatalkan…" : "Batalkan"}
          </button>
        )}
      </div>
    </div>
  );
}
