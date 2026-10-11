/** DebateSection — daftar titik perdebatan yang bisa difilter. */
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ParsedReport } from "@/lib/schemas";
import { DebateListView } from "./DebateListView";

type FilterType = "all" | "KONTRADIKSI" | "PENGUATAN_SILANG" | "ISU_UNIK";

interface Props {
  parsed: ParsedReport;
}

const FILTER_OPTIONS: Array<{
  value: FilterType;
  label: string;
  icon: string;
}> = [
  { value: "all", label: "Semua", icon: "✦" },
  { value: "KONTRADIKSI", label: "Kontradiksi", icon: "⚡" },
  { value: "PENGUATAN_SILANG", label: "Penguatan Silang", icon: "↗" },
  { value: "ISU_UNIK", label: "Isu Unik", icon: "📌" },
];

export function DebateSection({ parsed }: Props) {
  const [filter, setFilter] = useState<FilterType>("all");

  // parse_ok=false → titik perdebatan tidak tersedia.
  if (!parsed.parse_ok) {
    return (
      <section aria-label="Titik Perdebatan">
        <h2 className="text-base font-semibold text-[rgb(var(--fg))] mb-3">
          Titik Perdebatan
        </h2>
        <p className="text-sm text-[rgb(var(--fg-muted))]">
          Hasil tidak terstruktur — daftar titik perdebatan tidak tersedia.
        </p>
      </section>
    );
  }

  const counts: Record<FilterType, number> = {
    all: parsed.debate_points.length,
    KONTRADIKSI: parsed.debate_points.filter((point) => point.type === "KONTRADIKSI").length,
    PENGUATAN_SILANG: parsed.debate_points.filter((point) => point.type === "PENGUATAN_SILANG").length,
    ISU_UNIK: parsed.debate_points.filter((point) => point.type === "ISU_UNIK").length,
  };

  const isEmpty = counts.all === 0;

  return (
    <section aria-label="Titik Perdebatan">
      {/* Header + count */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-base font-semibold text-[rgb(var(--fg))]">
          Titik Perdebatan
        </h2>
        {!isEmpty && (
          <span className="rounded border border-[rgb(var(--border))]
                           bg-[rgb(var(--surface-2))] px-2 py-0.5 text-xs
                           text-[rgb(var(--fg-muted))]">
            {counts.all}
          </span>
        )}
      </div>

      {isEmpty ? (
        <p className="text-sm text-[rgb(var(--fg-muted))]" role="note">
          Tidak ada Titik Perdebatan terdeteksi.
        </p>
      ) : (
        <>
          {/* Filter chips */}
          <div
            role="group"
            aria-label="Filter jenis titik perdebatan"
            className="flex flex-wrap gap-2 mb-4"
          >
            {FILTER_OPTIONS.map((opt) => {
              const count = counts[opt.value];
              if (opt.value !== "all" && count === 0) return null;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={filter === opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium",
                    "transition-colors focus:outline-none",
                    "focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]",
                    filter === opt.value
                      ? "border-[rgb(var(--accent-mid))] bg-[rgb(var(--accent-mid))]/10 text-[rgb(var(--accent-mid))]"
                      : "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-[rgb(var(--fg-muted))] hover:text-[rgb(var(--fg))]",
                  )}
                >
                  {opt.icon && <span aria-hidden="true">{opt.icon}</span>}
                  {opt.label}
                  {opt.value !== "all" && (
                    <span className="ml-0.5 opacity-70">({count})</span>
                  )}
                </button>
              );
            })}
          </div>

          <DebateListView points={parsed.debate_points} filter={filter} />
        </>
      )}
    </section>
  );
}
