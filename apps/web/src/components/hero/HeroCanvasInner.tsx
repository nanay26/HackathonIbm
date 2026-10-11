/**
 * HeroCanvasInner — actual R3F Canvas, client-side only.
 *
 * motionReduced=true → frameloop="demand" (render sekali, tidak loop),
 * tanpa auto-rotate, tanpa partikel. Pengguna masih bisa orbit manual.
 */
"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { HeroSceneWithMonitor } from "./HeroScene";

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
  motionReduced: boolean;
}

export function HeroCanvasInner({ containerRef, motionReduced }: Props) {
  const [degraded, setDegraded] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [containerRef]);

  // motionReduced → demand (render sekali saat mount, lalu pause)
  // visible=false → never (tab hidden / scrolled away)
  const frameloop = !visible ? "never" : motionReduced ? "demand" : "always";

  return (
    <Canvas
      dpr={[1, degraded ? 1 : 1.75]}
      camera={{ position: [0, 0, 5], fov: 55 }}
      frameloop={frameloop}
      style={{ width: "100%", height: "100%" }}
      gl={{ alpha: true, antialias: !degraded }}
    >
      <HeroSceneWithMonitor
        degraded={degraded}
        onDegraded={setDegraded}
        motionReduced={motionReduced}
      />
    </Canvas>
  );
}
