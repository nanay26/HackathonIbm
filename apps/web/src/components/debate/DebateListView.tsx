/**
 * DebateListView — readable card list for every debate point in the report.
 */
import type { DebatePoint } from "@/lib/schemas";
import { cn } from "@/lib/utils";

interface Props {
  points: DebatePoint[];
  filter: "all" | "KONTRADIKSI" | "PENGUATAN_SILANG" | "ISU_UNIK";
}

const TYPE_CONFIG = {
  KONTRADIKSI: { label: "Kontradiksi", icon: "⚡", cls: "text-[rgb(var(--error))] border-[rgb(var(--error))]/35 bg-[rgb(var(--error))]/10" },
  PENGUATAN_SILANG: { label: "Penguatan Silang", icon: "↗", cls: "text-[rgb(var(--accent-mid))] border-[rgb(var(--accent-mid))]/35 bg-[rgb(var(--accent-mid))]/10" },
  ISU_UNIK: { label: "Isu Unik", icon: "◆", cls: "text-[rgb(var(--warning))] border-[rgb(var(--warning))]/35 bg-[rgb(var(--warning))]/10" },
} as const;

export function DebateListView({ points, filter }: Props) {
  const items = points.filter((point) => filter === "all" || point.type === filter);

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[rgb(var(--fg-muted))]">
        Tidak ada titik perdebatan untuk filter ini.
      </p>
    );
  }

  return (
    <ul
      className="space-y-3"
      aria-label="Daftar titik perdebatan"
    >
      {items.map((item, idx) => {
        const cfg = TYPE_CONFIG[item.type];
        return (
          <li
            key={`${item.type}-${item.aspect}-${idx}`}
            tabIndex={0}
            className={cn(
              "relative overflow-hidden rounded-2xl border p-4 outline-none",
              "focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]",
              "transition-all duration-200",
              "border-[rgb(var(--border))] bg-[linear-gradient(135deg,rgba(var(--accent-mid),0.06),transparent_42%),rgb(var(--surface))]",
              "shadow-[0_12px_28px_rgba(var(--shadow-rgb),0.06)]",
              "hover:-translate-y-0.5 hover:border-[rgb(var(--accent-mid))]/45 hover:shadow-[0_18px_36px_rgba(var(--shadow-rgb),0.12)]",
            )}
            aria-label={`${idx + 1}. ${item.aspect} — ${cfg.label}`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[rgb(var(--fg))]">
                {idx + 1}. {item.aspect}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-2 py-0.5",
                  "text-xs font-medium",
                  cfg.cls,
                )}
              >
                <span aria-hidden="true">{cfg.icon}</span>
                {cfg.label}
              </span>
            </div>

            <p className="text-sm text-[rgb(var(--fg))] leading-relaxed mb-2">
              {item.description}
            </p>

            {item.reviewers.length > 0 && (
              <ul className="space-y-1" aria-label="Posisi tiap reviewer">
                {item.reviewers.map((line, i) => (
                  <li
                    key={i}
                    className="text-xs text-[rgb(var(--fg-muted))] pl-3
                               border-l-2 border-[rgb(var(--border))]"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            )}
            {item.references.length > 0 && (
              <div className="mt-3 rounded-xl border border-[rgb(var(--border))]/70 bg-[rgb(var(--surface-2))]/70 px-3 py-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--fg-muted))]">
                  Rujukan
                </p>
                <ul className="space-y-1">
                  {item.references.map((reference, i) => (
                    <li
                      key={`${i}-${reference}`}
                      className="text-xs leading-relaxed text-[rgb(var(--fg-muted))]"
                    >
                      {reference}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
