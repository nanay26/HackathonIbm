/**
 * ReviewProgress — displays job status with live elapsed timer.
 *
 * Rules (SDD §F2):
 *  - Shows real status only (no fake percentage bar).
 *  - Shows a realistic duration hint based on the configured review timeout.
 *  - Shows elapsed timer (ticks every second).
 *  - Shows "Batalkan" button while job is active.
 *  - Stops at terminal status.
 *
 * All colours via design tokens (no hardcoded Tailwind colour classes).
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type { JobStatus } from "@/lib/schemas";
import { TERMINAL_STATUSES } from "@/lib/schemas";
import { cn } from "@/lib/utils";

interface Props {
  status: JobStatus;
  elapsedSeconds: number;
  error?: { code: string; message: string } | null;
  onCancel: () => void;
  isCancelling: boolean;
}

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Menunggu giliran…",
  running: "Sedang memproses…",
  awaiting_approval: "Menunggu persetujuan Anda",
  done: "Selesai",
  failed: "Gagal",
  timeout: "Waktu habis",
  cancelled: "Dibatalkan",
};

/** Token-based border+bg+text classes per status */
function statusClasses(status: JobStatus): string {
  switch (status) {
    case "queued":
      return "border-[rgb(var(--warning))]/40 bg-[rgb(var(--warning))]/8 text-[rgb(var(--warning))]";
    case "running":
      return "border-[rgb(var(--accent-mid))]/40 bg-[rgb(var(--accent-mid))]/8 text-[rgb(var(--accent-mid))]";
    case "awaiting_approval":
      return "border-[rgb(var(--warning))]/40 bg-[rgb(var(--warning))]/8 text-[rgb(var(--warning))]";
    case "done":
      return "border-[rgb(var(--success))]/40 bg-[rgb(var(--success))]/8 text-[rgb(var(--success))]";
    case "failed":
    case "timeout":
      return "border-[rgb(var(--error))]/40 bg-[rgb(var(--error))]/8 text-[rgb(var(--error))]";
    case "cancelled":
      return "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-[rgb(var(--fg-muted))]";
  }
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  if (m === 0) return `${s}d`;
  return `${m}m ${s}d`;
}

export function ReviewProgress({
  status,
  elapsedSeconds,
  error,
  onCancel,
  isCancelling,
}: Props) {
  const [displayElapsed, setDisplayElapsed] = useState(elapsedSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTerminal = TERMINAL_STATUSES.includes(status);

  useEffect(() => {
    setDisplayElapsed(elapsedSeconds);
  }, [elapsedSeconds]);

  useEffect(() => {
    if (isTerminal) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setDisplayElapsed((prev) => prev + 1);
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isTerminal]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Status review: ${STATUS_LABELS[status]}`}
      className={cn("rounded-lg border p-4", statusClasses(status))}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-sm">{STATUS_LABELS[status]}</span>

          {!isTerminal && (
            <span className="text-xs opacity-70">
              Review dapat memerlukan hingga 6 menit
            </span>
          )}

          <span className="font-mono text-xs opacity-80" aria-label="Waktu berjalan">
            {formatElapsed(displayElapsed)}
          </span>
        </div>

        {!isTerminal && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isCancelling}
            className="rounded border border-current px-3 py-1 text-xs font-medium
                       hover:opacity-80 disabled:opacity-40 transition-opacity
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
            aria-label="Batalkan review"
          >
            {isCancelling ? "Membatalkan…" : "Batalkan"}
          </button>
        )}
      </div>

      {/* Honest error message for terminal failures */}
      {(status === "failed" || status === "timeout") && error && (
        <div
          role="alert"
          className="mt-3 rounded border border-current bg-[rgb(var(--surface-2))]/50 p-2 text-xs"
        >
          <strong>{error.code}</strong>: {error.message}
        </div>
      )}
    </div>
  );
}
