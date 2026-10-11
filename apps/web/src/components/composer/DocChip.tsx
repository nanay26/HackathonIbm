/**
 * DocChip — shows attached document status inside the Composer.
 *
 * States:
 *   extracting  — spinner + "Mengekstrak…"
 *   ok          — filename/label, green tick, "Pratinjau & edit"
 *   error       — red X + error message, "Coba lagi" or dismiss
 *
 * Clicking the X on an ok/error chip clears the document.
 */
"use client";

import { Loader2, CheckCircle2, XCircle, X, FileText, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChipState = "extracting" | "ok" | "error";

interface Props {
  state: ChipState;
  /** Display label: filename or "Teks tertempel" */
  label: string;
  /** Error message — shown when state=error */
  errorMessage?: string;
  onPreview?: () => void;
  onClear: () => void;
}

export function DocChip({
  state,
  label,
  errorMessage,
  onPreview,
  onClear,
}: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={
        state === "extracting"
          ? `Mengekstrak ${label}…`
          : state === "error"
          ? `Kesalahan pada ${label}: ${errorMessage}`
          : `Dokumen siap: ${label}`
      }
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        "bg-[rgb(var(--surface-2))] border-[rgb(var(--border))]",
        state === "error" && "border-[rgb(var(--error))]/50 bg-[rgb(var(--error))]/5",
        state === "ok" && "border-[rgb(var(--success))]/40",
      )}
    >
      {/* Left icon */}
      {state === "extracting" && (
        <Loader2
          size={15}
          aria-hidden="true"
          className="shrink-0 animate-spin text-[rgb(var(--accent-mid))]"
        />
      )}
      {state === "ok" && (
        <CheckCircle2
          size={15}
          aria-hidden="true"
          className="shrink-0 text-[rgb(var(--success))]"
        />
      )}
      {state === "error" && (
        <XCircle
          size={15}
          aria-hidden="true"
          className="shrink-0 text-[rgb(var(--error))]"
        />
      )}

      {/* File icon + label */}
      <FileText size={14} aria-hidden="true" className="shrink-0 text-[rgb(var(--fg-muted))]" />
      <span className="min-w-0 flex-1 truncate font-medium text-[rgb(var(--fg))]">
        {label}
      </span>

      {/* Error text */}
      {state === "error" && errorMessage && (
        <span className="min-w-0 truncate text-xs text-[rgb(var(--error))]">
          {errorMessage}
        </span>
      )}

      {/* Preview button */}
      {state === "ok" && onPreview && (
        <button
          type="button"
          onClick={onPreview}
          aria-label="Pratinjau dan edit teks dokumen"
          className="shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs
                     text-[rgb(var(--accent-mid))] hover:bg-[rgb(var(--surface))]
                     transition-colors focus:outline-none focus-visible:ring-2
                     focus-visible:ring-[rgb(var(--accent-mid))]"
        >
          <Eye size={12} aria-hidden="true" />
          Edit
        </button>
      )}

      {/* Extracting label */}
      {state === "extracting" && (
        <span className="shrink-0 text-xs text-[rgb(var(--fg-muted))]">
          Mengekstrak…
        </span>
      )}

      {/* Clear button */}
      {state !== "extracting" && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Hapus dokumen"
          className="shrink-0 flex items-center justify-center rounded p-0.5
                     text-[rgb(var(--fg-muted))] hover:bg-[rgb(var(--surface))]
                     hover:text-[rgb(var(--fg))] transition-colors
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]"
        >
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
