/**
 * DocTypeDropdown — small dropdown inside the Composer.
 *
 * Only "Proposal Skripsi" is active; others show "Segera hadir".
 * SDD §F1 AC-1.
 */
"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const DOC_TYPES = [
  { value: "proposal_skripsi", label: "Proposal Skripsi", enabled: true },
  { value: "skripsi_tesis", label: "Skripsi/Tesis", enabled: false },
  { value: "jurnal", label: "Jurnal", enabled: false },
  { value: "esai", label: "Esai", enabled: false },
] as const;

export type DocType = (typeof DOC_TYPES)[number]["value"];

interface Props {
  value: DocType;
  onChange: (v: DocType) => void;
}

export function DocTypeDropdown({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const currentLabel = DOC_TYPES.find((d) => d.value === value)?.label ?? value;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Jenis dokumen: ${currentLabel}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
          "border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]",
          "text-[rgb(var(--fg))] hover:bg-[rgb(var(--surface))] transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]",
        )}
      >
        {currentLabel}
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Pilih jenis dokumen"
          className={cn(
            "absolute bottom-full left-0 mb-1 z-50 min-w-[180px]",
            "rounded-lg border border-[rgb(var(--border))]",
            "bg-[rgb(var(--surface))] shadow-lg",
            "py-1 text-sm",
          )}
        >
          {DOC_TYPES.map((dt) => (
            <li
              key={dt.value}
              role="option"
              aria-selected={dt.value === value}
              aria-disabled={!dt.enabled}
              onClick={() => {
                if (dt.enabled) {
                  onChange(dt.value as DocType);
                  setOpen(false);
                }
              }}
              className={cn(
                "flex items-center justify-between gap-2 px-3 py-1.5 cursor-pointer",
                dt.enabled
                  ? "text-[rgb(var(--fg))] hover:bg-[rgb(var(--surface-2))]"
                  : "text-[rgb(var(--fg-muted))] cursor-not-allowed",
                dt.value === value && dt.enabled && "font-semibold",
              )}
            >
              <span>{dt.label}</span>
              {!dt.enabled && (
                <span className="flex items-center gap-1 text-[10px] text-[rgb(var(--fg-muted))]">
                  <Lock size={10} aria-hidden="true" />
                  Segera hadir
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
