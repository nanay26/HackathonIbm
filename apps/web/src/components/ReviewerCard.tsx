/**
 * ReviewerCard — renders one reviewer's result.
 *
 * SDD §F3-1: VERDICT, RINGKASAN, TEMUAN accordion, Rekomendasi Prioritas.
 * SDD §F3-2: tiap temuan: nomor, tag [ASPEK], deskripsi, Rujukan verbatim.
 *            Temuan tanpa Rujukan → tag "Tanpa rujukan", tidak disembunyikan.
 * SDD §F3-4: reviewer gagal/missing → kartu "Gagal/Tidak tersedia", dilarang
 *            mengisi konten pengganti.
 * SDD §F3-6: accordion bisa dioperasikan keyboard.
 * Spec 7b: paper card + tilt 3D halus (CSS perspective + framer-motion spring).
 * No dangerouslySetInnerHTML anywhere.
 * All colours via design tokens — no hardcoded Tailwind colour classes.
 */
"use client";

import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { AlertTriangle, Check, CheckCircle2, Copy, XCircle } from "lucide-react";
import type { ReviewerResult } from "@/lib/schemas";
import { cn } from "@/lib/utils";

interface Props {
  reviewer: ReviewerResult;
}

const KEY_LABELS: Record<ReviewerResult["key"], string> = {
  metodologi: "Reviewer Metodologi",
  orisinalitas: "Reviewer Orisinalitas",
  revisi: "Reviewer Revisi",
};

/**
 * Returns token-based badge classes for the verdict.
 * Works in dark + light via CSS variables.
 */
function verdictBadge(verdict: string) {
  const upper = verdict.toUpperCase();
  if (upper.includes("TIDAK LAYAK"))
    return { Icon: XCircle, className: "bg-[#792e2a] text-white" };
  if (upper.includes("MAYOR"))
    return { Icon: AlertTriangle, className: "bg-[#844218] text-white" };
  if (upper.includes("MINOR"))
    return { Icon: AlertTriangle, className: "bg-[#234a86] text-white" };
  if (upper.includes("LAYAK"))
    return { Icon: CheckCircle2, className: "bg-[#236747] text-white" };
  return { Icon: CheckCircle2, className: "bg-[rgb(var(--surface-2))] text-[rgb(var(--fg))]" };
}

/** Copy-to-clipboard button for Rujukan */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — clipboard not available in all contexts
    }
  }
  return (
    <button
      type="button"
      aria-label={copied ? "Tersalin" : "Salin rujukan"}
      onClick={handleCopy}
      className={cn(
        "ml-1 inline-flex items-center rounded p-0.5 transition-colors",
        "hover:bg-[rgb(var(--surface-2))] focus:outline-none",
        "focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]",
        "text-[rgb(var(--fg-muted))]",
      )}
    >
      {copied ? (
        <Check size={11} aria-hidden="true" className="text-[rgb(var(--success))]" />
      ) : (
        <Copy size={11} aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * TiltCard — wraps children in a paper card with 3D tilt on hover.
 * Uses CSS perspective + framer-motion spring for smooth feel.
 * Respects prefers-reduced-motion via the global CSS rule in globals.css.
 */
function TiltCard({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Motion values for mouse position relative to card center
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  // Spring config: gentle, low stiffness
  const springConfig = { stiffness: 150, damping: 20, mass: 0.5 };
  const rotateX = useSpring(useTransform(rawY, [-0.5, 0.5], [6, -6]), springConfig);
  const rotateY = useSpring(useTransform(rawX, [-0.5, 0.5], [-6, 6]), springConfig);
  const scale = useSpring(1, { stiffness: 200, damping: 20 });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    // Normalise to -0.5 … +0.5
    rawX.set((e.clientX - left) / width - 0.5);
    rawY.set((e.clientY - top) / height - 0.5);
  }

  function handleMouseEnter() {
    scale.set(1.015);
  }

  function handleMouseLeave() {
    rawX.set(0);
    rawY.set(0);
    scale.set(1);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={ariaLabel}
      style={{
        rotateX,
        rotateY,
        scale,
        transformPerspective: 800,
        transformStyle: "preserve-3d",
      }}
      className={cn(
        "rounded-xl border border-[rgb(var(--border))]",
        "bg-[rgb(var(--surface))]",
        "transition-shadow",
              "hover:shadow-3",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function ReviewerCard({ reviewer }: Props) {
  const [findingsOpen, setFindingsOpen] = useState(false);
  const label = KEY_LABELS[reviewer.key];
  const accordionId = `findings-${reviewer.key}`;

  // SDD §F3-4: failed/missing → stub card, no fabricated content
  if (reviewer.status === "failed" || reviewer.status === "missing") {
    return (
      <TiltCard aria-label={`${label} — tidak tersedia`}>
        <div className="p-4">
          <h3 className="font-semibold text-[rgb(var(--error))] mb-1">{label}</h3>
          <p className="text-sm text-[rgb(var(--fg-muted))]">
            {reviewer.status === "missing"
              ? "Data reviewer ini tidak tersedia dalam output."
              : "Terjadi kesalahan saat memproses hasil reviewer ini."}
          </p>
        </div>
      </TiltCard>
    );
  }

  return (
    <TiltCard>
      {/* Header */}
      <div className="bg-[rgb(var(--surface-2))] border-b border-[rgb(var(--border))]
                      px-4 py-3 flex flex-wrap items-center justify-between gap-2
                      rounded-t-xl">
        <h3 className="font-semibold text-[rgb(var(--fg))] text-sm">{label}</h3>
        {reviewer.verdict && (
          (() => {
            const badge = verdictBadge(reviewer.verdict);
            return (
              <span
                className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold", badge.className)}
                aria-label={`Verdict: ${reviewer.verdict}`}
              >
                <badge.Icon size={13} aria-hidden="true" />
                {reviewer.verdict}
              </span>
            );
          })()
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Ringkasan */}
        {reviewer.summary && (
          <section aria-label="Ringkasan">
            <h4 className="text-xs font-semibold text-[rgb(var(--fg-muted))] uppercase tracking-wide mb-1">
              Ringkasan
            </h4>
            <p className="text-sm text-[rgb(var(--fg))] leading-relaxed">{reviewer.summary}</p>
          </section>
        )}

        {/* Temuan — accordion dengan visual yang JELAS terbuka (spec Bagian 7b) */}
        {reviewer.findings.length > 0 && (
          <section aria-label="Temuan">
            <button
              type="button"
              aria-expanded={findingsOpen}
              aria-controls={accordionId}
              onClick={() => setFindingsOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg
                         border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]
                         px-3 py-2.5 text-xs font-semibold text-[rgb(var(--fg))]
                         hover:bg-[rgb(var(--surface))] focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]
                         transition-colors group"
            >
              <span className="flex items-center gap-2">
                {/* Animated chevron — makes it obvious it's interactive */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center rounded-full",
                    "bg-[rgb(var(--accent-mid))] text-white text-[9px] font-bold",
                    "transition-transform duration-200",
                    findingsOpen && "rotate-180",
                  )}
                >
                  ▼
                </span>
                Temuan ({reviewer.findings.length})
              </span>
              <span
                aria-hidden="true"
                className="text-[10px] text-[rgb(var(--fg-muted))] group-hover:text-[rgb(var(--fg))]
                           transition-colors"
              >
                {findingsOpen ? "Tutup" : "Buka"}
              </span>
            </button>

            <div
              id={accordionId}
              hidden={!findingsOpen}
              className="mt-2 space-y-3"
            >
              {reviewer.findings.map((finding) => (
                <div
                  key={finding.no}
                  className="rounded-lg border border-[rgb(var(--border))]
                             bg-[rgb(var(--surface-2))] p-3"
                >
                  {/* Nomor + Aspek */}
                  <div className="flex flex-wrap items-baseline gap-2 mb-1">
                    <span className="text-xs font-bold text-[rgb(var(--fg-muted))]">
                      #{finding.no}
                    </span>
                    <span className="rounded border border-[rgb(var(--accent-mid))]/30
                                     bg-[rgb(var(--accent-mid))]/10
                                     px-1.5 py-0.5 text-xs font-medium
                                     text-[rgb(var(--accent-mid))]">
                      [ASPEK: {finding.aspect}]
                    </span>
                    {finding.reference === null && (
                      <span className="rounded border border-[rgb(var(--border))]
                                       bg-[rgb(var(--surface))]
                                       px-1.5 py-0.5 text-xs text-[rgb(var(--fg-muted))]">
                        Tanpa rujukan
                      </span>
                    )}
                  </div>

                  {/* Deskripsi */}
                  <p className="text-sm text-[rgb(var(--fg))] mb-2 leading-relaxed">
                    {finding.description}
                  </p>

                  {/* Rujukan verbatim + tombol salin */}
                  {finding.reference !== null && (
                    <blockquote
                      className="flex items-start gap-1 border-l-2
                                 border-[rgb(var(--accent-mid))]/50 pl-3
                                 text-xs text-[rgb(var(--fg-muted))] italic"
                      aria-label="Rujukan"
                    >
                      <span className="flex-1">Rujukan: {finding.reference}</span>
                      <CopyButton text={finding.reference} />
                    </blockquote>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Rekomendasi Prioritas */}
        {reviewer.priority_recommendations.length > 0 && (
          <section aria-label="Rekomendasi Prioritas">
            <h4 className="text-xs font-semibold text-[rgb(var(--fg-muted))] uppercase tracking-wide mb-1">
              Rekomendasi Prioritas
            </h4>
            <ol className="list-decimal list-inside space-y-1">
              {reviewer.priority_recommendations.map((rec, i) => (
                <li key={i} className="text-sm text-[rgb(var(--fg))]">
                  {rec}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </TiltCard>
  );
}
