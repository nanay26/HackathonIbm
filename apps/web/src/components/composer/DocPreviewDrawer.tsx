/**
 * DocPreviewDrawer — slide-in drawer with editable textarea.
 *
 * Opened via "Pratinjau & edit" on DocChip.
 * Shows extracted/pasted text, lets user edit before submit.
 * Accessible: focus trap, Escape to close.
 */
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (v: string) => void;
}

export function DocPreviewDrawer({ open, onClose, value, onChange }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const firstFocusRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea on open
  useEffect(() => {
    if (open) {
      setTimeout(() => firstFocusRef.current?.focus(), 50);
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pratinjau & edit teks dokumen"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col",
          "border-l border-[rgb(var(--border))]",
          "bg-[rgb(var(--surface))]",
          "shadow-2xl",
        )}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[rgb(var(--border))] px-4">
          <h2 className="text-sm font-semibold text-[rgb(var(--fg))]">
            Pratinjau &amp; Edit Teks
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup drawer"
            className="flex items-center justify-center rounded-md p-1.5
                       text-[rgb(var(--fg-muted))] hover:bg-[rgb(var(--surface-2))]
                       hover:text-[rgb(var(--fg))] transition-colors
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Textarea */}
        <div className="flex flex-1 flex-col overflow-hidden p-4">
          <label htmlFor="doc-preview-textarea" className="sr-only">
            Teks dokumen
          </label>
          <textarea
            ref={firstFocusRef}
            id="doc-preview-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Teks dokumen"
            className={cn(
              "flex-1 resize-none rounded-lg border p-3",
              "font-mono text-sm leading-relaxed",
              "bg-[rgb(var(--surface-2))] text-[rgb(var(--fg))]",
              "border-[rgb(var(--border))]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]",
            )}
          />
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[rgb(var(--border))] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium",
              "bg-[rgb(var(--accent-mid))] text-white shadow-1",
              "hover:brightness-95 active:translate-y-px transition-all",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]",
            )}
          >
            Selesai
          </button>
        </div>
      </div>
    </>
  );
}
