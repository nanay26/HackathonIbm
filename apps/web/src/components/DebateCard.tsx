import { useState } from "react";
import type { DebatePoint } from "@/lib/schemas";

interface Props {
  point: DebatePoint;
  index: number;
}

/**
 * Futuristic visual config for each debate type:
 * Neon-glowing badges, accent borders, ambient gradients, and dynamic indicators.
 */
const TYPE_CONFIG: Record<
  DebatePoint["type"],
  {
    label: string;
    icon: string;
    badgeStyle: string;
    borderGlow: string;
    ambientBg: string;
    dotGlow: string;
  }
> = {
  KONTRADIKSI: {
    label: "Kontradiksi",
    icon: "⚡",
    badgeStyle:
      "border-rose-500/40 bg-gradient-to-r from-rose-500/15 via-red-500/10 to-amber-500/15 text-rose-700 shadow-[0_0_12px_rgba(244,63,94,0.25)]",
    borderGlow:
      "hover:border-rose-400/60 hover:shadow-[0_4px_24px_-4px_rgba(244,63,94,0.2)]",
    ambientBg:
      "from-rose-500/[0.04] via-transparent to-amber-500/[0.02]",
    dotGlow: "bg-rose-500 shadow-[0_0_8px_#f43f5e]",
  },
  PENGUATAN_SILANG: {
    label: "Penguatan Silang",
    icon: "🔗",
    badgeStyle:
      "border-cyan-500/40 bg-gradient-to-r from-cyan-500/15 via-teal-500/10 to-emerald-500/15 text-teal-800 shadow-[0_0_12px_rgba(6,182,212,0.25)]",
    borderGlow:
      "hover:border-cyan-400/60 hover:shadow-[0_4px_24px_-4px_rgba(6,182,212,0.2)]",
    ambientBg:
      "from-cyan-500/[0.04] via-transparent to-emerald-500/[0.02]",
    dotGlow: "bg-cyan-500 shadow-[0_0_8px_#06b6d4]",
  },
  ISU_UNIK: {
    label: "Isu Unik",
    icon: "📌",
    badgeStyle:
      "border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-yellow-500/15 text-amber-800 shadow-[0_0_12px_rgba(245,158,11,0.25)]",
    borderGlow:
      "hover:border-amber-400/60 hover:shadow-[0_4px_24px_-4px_rgba(245,158,11,0.2)]",
    ambientBg:
      "from-amber-500/[0.04] via-transparent to-yellow-500/[0.02]",
    dotGlow: "bg-amber-500 shadow-[0_0_8px_#f59e0b]",
  },
};

export function DebateCard({ point, index }: Props) {
  const cfg = TYPE_CONFIG[point.type] ?? TYPE_CONFIG.ISU_UNIK;
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border border-[rgb(var(--border))]/80
                 bg-[rgb(var(--surface))] p-5 shadow-[var(--shadow-2)]
                 backdrop-blur-md transition-all duration-300 ${cfg.borderGlow}`}
      aria-label={`Titik perdebatan ${index + 1}: ${point.aspect}`}
    >
      {/* Dynamic ambient background glow */}
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${cfg.ambientBg} opacity-80 transition-opacity group-hover:opacity-100`}
        aria-hidden="true"
      />

      {/* Decorative futuristic micro-grid watermark */}
      <div
        className="pointer-events-none absolute right-2 top-2 h-16 w-16 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity"
        aria-hidden="true"
      >
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx="20" cy="20" r="10" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M 0 20 H 40 M 20 0 V 40" stroke="currentColor" strokeWidth="0.5" />
        </svg>
      </div>

      <div className="relative z-10">
        {/* Header: Aspect title, Index badge, and Futuristic Glowing Type badge */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-lg bg-[rgb(var(--surface-2))] border border-[rgb(var(--border))] text-xs font-mono font-bold text-[rgb(var(--fg-muted))]"
              aria-hidden="true"
            >
              #{index + 1}
            </span>
            <h3 className="text-sm font-semibold tracking-tight text-[rgb(var(--fg))]">
              {index + 1}. {point.aspect}
            </h3>
          </div>

          {/* Futuristic Badge: Glow, icon, pulsing LED status */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium tracking-wide backdrop-blur-sm ${cfg.badgeStyle}`}
            aria-label={`Jenis: ${cfg.label}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full animate-pulse ${cfg.dotGlow}`}
              aria-hidden="true"
            />
            <span aria-hidden="true">{cfg.icon}</span>
            <span>{cfg.label}</span>
          </span>
        </div>

        {/* Description / Implikasi temuan */}
        <p className="text-sm leading-relaxed text-[rgb(var(--fg))] mb-4 font-normal">
          {point.description}
        </p>

        {/* Reviewer viewpoints / comparison */}
        {point.reviewers.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[rgb(var(--border))]/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-medium uppercase tracking-wider text-[rgb(var(--fg-muted))] flex items-center gap-1.5">
                <span className="inline-block h-1 w-1 rounded-full bg-[rgb(var(--accent-from))]" />
                Perspektif Dewan Penilai ({point.reviewers.length})
              </span>
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-[11px] font-medium text-[rgb(var(--accent-mid))] hover:underline focus:outline-none"
                aria-expanded={isExpanded}
              >
                {isExpanded ? "Sembunyikan" : "Tampilkan detail"}
              </button>
            </div>

            {isExpanded && (
              <ul className="space-y-2 mt-2" aria-label="Posisi tiap reviewer">
                {point.reviewers.map((line, i) => (
                  <li
                    key={i}
                    className="relative flex items-start gap-2.5 rounded-xl border border-[rgb(var(--border))]/60 bg-[rgb(var(--surface-2))]/60 p-2.5 text-xs text-[rgb(var(--fg))] transition-colors hover:bg-[rgb(var(--surface-2))]"
                  >
                    <span
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--surface))] border border-[rgb(var(--border))] text-[9px] font-mono font-bold text-[rgb(var(--fg-muted))]"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <span className="leading-relaxed flex-1">{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
