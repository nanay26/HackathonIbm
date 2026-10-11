/**
 * DebateGraphCanvas — lazy-loads the WebGL canvas via next/dynamic (ssr:false).
 *
 * Spec Bagian 7c performa:
 *  - next/dynamic ssr:false + fallback gradient statis
 *  - Canvas dpr [1, 1.75]
 *  - frameloop "demand" → berhenti saat tidak ada interaksi
 *  - Fallback: tanpa WebGL atau prefers-reduced-motion = latar gradien statis
 *  - Teks halaman tidak menunggu 3D (LCP dari teks)
 *
 * Spec Bagian 7c mobile:
 *  - Canvas tidak terjebak scroll: pointer events diaktifkan lewat tombol
 *  - Sentuh dua jari untuk rotate/zoom (default OrbitControls touch)
 *
 * Spec Bagian 7c aksesibilitas:
 *  - Canvas role="img" + aria-label ringkasan
 *  - Perubahan seleksi diumumkan via aria-live
 */
"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useCallback } from "react";
import { RotateCcw, Play, Pause, MousePointer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphModel } from "@/lib/graph-model";
import type { SceneSelection } from "./DebateGraphScene";

// ── Dynamic import (ssr:false) ─────────────────────────────────────────────────

const CanvasInner = dynamic(
  () =>
    import("./DebateGraphScene").then((m) => ({
      default: m.DebateGraphCanvasInner,
    })),
  {
    ssr: false,
    loading: () => <CanvasFallback label="Memuat grafik 3D…" />,
  },
);

// ── Fallback gradient ─────────────────────────────────────────────────────────

function CanvasFallback({ label = "Pratinjau 3D tidak tersedia" }: { label?: string }) {
  return (
    <div
      className="w-full min-h-[380px] flex items-center justify-center rounded-xl
                 bg-gradient-to-br from-[rgb(var(--accent-from))]/10
                 via-[rgb(var(--accent-mid))]/5
                 to-[rgb(var(--accent-to))]/10"
      aria-label={label}
    >
      <p className="text-xs text-[rgb(var(--fg-muted))]">{label}</p>
    </div>
  );
}

// ── WebGL detection ────────────────────────────────────────────────────────────

function webGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

// ── Detail panel ──────────────────────────────────────────────────────────────

interface SelectionDetail {
  title: string;
  type: string;
  description: string;
  reviewers: string[];
}

function buildDetail(
  sel: SceneSelection,
  model: GraphModel,
): SelectionDetail | null {
  if (sel.type === "node") {
    const node = model.nodes.find((n) => n.id === sel.id);
    if (!node) return null;
    return {
      title: node.label,
      type: node.available ? "Reviewer" : "Reviewer (tidak tersedia)",
      description: node.available
        ? "Node reviewer ini aktif dalam analisis."
        : "Reviewer ini tidak menghasilkan output.",
      reviewers: [],
    };
  }
  if (sel.type === "edge") {
    const edge = model.edges.find((e) => e.id === sel.id);
    if (!edge) return null;
    const typeLabel =
      edge.type === "KONTRADIKSI"
        ? "Kontradiksi"
        : edge.type === "PENGUATAN_SILANG"
        ? "Penguatan Silang"
        : "Isu Unik";
    return {
      title: edge.aspect,
      type: typeLabel,
      description: edge.description,
      reviewers: edge.rawReviewerLines,
    };
  }
  if (sel.type === "satellite") {
    const sat = model.satellites.find((s) => s.id === sel.id);
    if (!sat) return null;
    return {
      title: sat.aspect,
      type: "Isu Unik",
      description: sat.description,
      reviewers: sat.rawReviewerLines,
    };
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  model: GraphModel;
  filter: "all" | "KONTRADIKSI" | "PENGUATAN_SILANG" | "ISU_UNIK";
}

export function DebateGraphCanvas({ model, filter }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [selection, setSelection] = useState<SceneSelection | null>(null);
  const [mobileInteractive, setMobileInteractive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSupported(webGLAvailable());
    setReducedMotion(
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false,
    );
  }, []);

  // Announce selection changes via aria-live
  useEffect(() => {
    if (!liveRef.current || !selection) return;
    const detail = buildDetail(selection, model);
    if (detail) {
      liveRef.current.textContent = `Dipilih: ${detail.title} — ${detail.type}`;
    }
  }, [selection, model]);

  const handleSelect = useCallback((sel: SceneSelection | null) => {
    setSelection(sel);
  }, []);

  const detail = selection ? buildDetail(selection, model) : null;

  // Reduced-motion mempertahankan scene statis dan tetap mengizinkan orbit manual.
  if (supported === false) {
    return (
      <CanvasFallback label="WebGL tidak tersedia di browser ini" />
    );
  }

  return (
    <div className="relative w-full" style={{ height: 380 }}>
      {/* Aria live region */}
      <div ref={liveRef} className="sr-only" aria-live="polite" aria-atomic="true" />

      {/* Canvas container */}
      <div
        ref={containerRef}
        className={cn(
          "w-full h-full rounded-xl overflow-hidden",
          "border border-[rgb(var(--border))]",
          !mobileInteractive && "touch-none pointer-events-none md:pointer-events-auto md:touch-auto",
          mobileInteractive && "touch-auto pointer-events-auto",
        )}
        style={{ height: 380 }}
      >
        {supported !== null && (
          <CanvasInner
            model={model}
            filter={filter}
            autoRotate={autoRotate}
            resetTrigger={resetTrigger}
            onSelect={handleSelect}
            motionReduced={reducedMotion}
          />
        )}
      </div>

      {/* Controls overlay */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
        <button
          type="button"
          aria-label={autoRotate ? "Matikan putar otomatis" : "Putar otomatis"}
          onClick={() => setAutoRotate((v) => !v)}
          className="flex items-center justify-center rounded-lg p-1.5
                     bg-[rgb(var(--surface))]/80 border border-[rgb(var(--border))]
                     text-[rgb(var(--fg-muted))] hover:text-[rgb(var(--fg))]
                     backdrop-blur-sm transition-colors
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]"
        >
          {autoRotate ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
        </button>
        <button
          type="button"
          aria-label="Reset posisi kamera"
          onClick={() => setResetTrigger((v) => v + 1)}
          className="flex items-center justify-center rounded-lg p-1.5
                     bg-[rgb(var(--surface))]/80 border border-[rgb(var(--border))]
                     text-[rgb(var(--fg-muted))] hover:text-[rgb(var(--fg))]
                     backdrop-blur-sm transition-colors
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]"
        >
          <RotateCcw size={13} aria-hidden="true" />
        </button>
      </div>

      {/* Mobile: tombol aktifkan interaksi 3D */}
      <div className="md:hidden absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
        <button
          type="button"
          onClick={() => setMobileInteractive((v) => !v)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium
                     bg-[rgb(var(--surface))]/90 border border-[rgb(var(--border))]
                     text-[rgb(var(--fg-muted))] backdrop-blur-sm transition-colors
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]"
        >
          <MousePointer size={11} aria-hidden="true" />
          {mobileInteractive ? "Nonaktifkan interaksi 3D" : "Aktifkan interaksi 3D"}
        </button>
      </div>

      {/* Detail panel — DOM text, terbaca tanpa WebGL */}
      {detail && (
        <div
          className="absolute left-2 bottom-2 z-10 max-w-[calc(100%-4rem)]
                     rounded-xl border border-[rgb(var(--border))]
                     bg-[rgb(var(--surface))]/90 backdrop-blur-sm
                     px-3 py-2.5 text-xs shadow-lg"
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-semibold text-[rgb(var(--fg))] leading-tight">{detail.title}</p>
            <button
              type="button"
              aria-label="Tutup detail"
              onClick={() => setSelection(null)}
              className="shrink-0 text-[rgb(var(--fg-muted))] hover:text-[rgb(var(--fg))]"
            >
              ×
            </button>
          </div>
          <p className="text-[rgb(var(--accent-mid))] font-medium mb-1">{detail.type}</p>
          <p className="text-[rgb(var(--fg-muted))] leading-relaxed">{detail.description}</p>
          {detail.reviewers.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {detail.reviewers.map((line, i) => (
                <li key={i} className="text-[rgb(var(--fg-muted))] pl-2 border-l border-[rgb(var(--border))]">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
