/**
 * HeroCanvas — lazy-loads R3F hero scene via next/dynamic (ssr:false).
 *
 * Logika render:
 *  - "off" (pengaturan) → fallback statis + pesan alasan
 *  - No WebGL           → fallback statis + pesan "WebGL tidak tersedia"
 *  - reduced-motion (OS) + setting "auto" → render canvas tapi tanpa gerak
 *    (frameloop="demand", tanpa auto-rotate, tanpa partikel bergerak)
 *  - "on" (pengaturan)  → render penuh, abaikan sinyal OS
 *
 * Performa: next/dynamic ssr:false, dpr [1,1.75], IntersectionObserver pause.
 */
"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const CanvasInner = dynamic(
  () => import("./HeroCanvasInner").then((m) => ({ default: m.HeroCanvasInner })),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 hero-gradient-fallback" aria-hidden="true" />,
  },
);

function webGLAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

interface Props {
  className?: string;
}

export function HeroCanvas({ className }: Props) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWebgl(webGLAvailable());
    setReducedMotion(
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false,
    );
  }, []);

  // Masih mendeteksi
  if (webgl === null) {
    return (
      <div aria-hidden="true" className={cn("pointer-events-none select-none", className)}>
        <div className="absolute inset-0 hero-gradient-fallback" />
      </div>
    );
  }

  // WebGL tidak tersedia → fallback + alasan
  if (webgl === false) {
    return (
      <div className={cn("pointer-events-none select-none", className)}>
        <div aria-hidden="true" className="absolute inset-0 hero-gradient-fallback" />
        <p role="status" className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-[rgb(var(--fg-muted))]">
          WebGL tidak tersedia di browser ini. Menampilkan latar statis.
        </p>
      </div>
    );
  }

  // WebGL tersedia — render canvas
  // reducedMotion + "auto" → pass flag ke scene untuk mode gerak-minimal
  const motionReduced = reducedMotion;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn("pointer-events-none select-none", className)}
    >
      <CanvasInner containerRef={containerRef} motionReduced={motionReduced} />
    </div>
  );
}
