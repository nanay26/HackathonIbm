/**
 * ReplaceConfirmBar — inline confirmation strip shown when user tries
 * to replace an existing document attachment.
 *
 * Replaces window.confirm() for accessibility and CSP compliance.
 */
"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Called when user confirms the replacement */
  onConfirm: () => void;
  /** Called when user cancels */
  onCancel: () => void;
  className?: string;
}

export function ReplaceConfirmBar({ onConfirm, onCancel, className }: Props) {
  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-label="Konfirmasi ganti dokumen"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-t-2xl",
        "border-b border-[rgb(var(--border))]",
        "bg-[rgb(var(--warning))]/10 px-4 py-2.5",
        className,
      )}
    >
      <AlertCircle
        size={14}
        aria-hidden="true"
        className="shrink-0 text-[rgb(var(--warning))]"
      />
      <span className="flex-1 text-xs text-[rgb(var(--warning))]">
        Sudah ada dokumen dilampirkan. Ganti dengan yang baru?
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2.5 py-1 text-xs font-medium
                     text-[rgb(var(--fg-muted))] hover:bg-[rgb(var(--surface-2))]
                     transition-colors focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded px-2.5 py-1 text-xs font-medium
                     bg-[rgb(var(--warning))]/20 text-[rgb(var(--warning))]
                     hover:bg-[rgb(var(--warning))]/30 transition-colors
                     focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-[rgb(var(--warning))]"
        >
          Ganti
        </button>
      </div>
    </div>
  );
}
