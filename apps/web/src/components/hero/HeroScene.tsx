/**
 * HeroScene — studio backdrop untuk landing page Telaah.
 *
 * Fokus utama:
 *  - panggung lembut di latar belakang
 *  - 3 stand reviewer dengan bentuk yang berbeda
 *  - pencahayaan hangat dan bayangan yang terasa seperti ruang sidang
 *  - gerakan sangat halus tanpa mengklaim progres
 */
"use client";

import { useRef } from "react";
import { Float, PerformanceMonitor, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useHeroStore } from "@/lib/hero-store";

const STATE_CONFIG = {
  idle: { orbitSpeed: 0.16, pulse: 0.4, hueBoost: 0.0 },
  typing: { orbitSpeed: 0.2, pulse: 0.5, hueBoost: 0.12 },
  reviewing: { orbitSpeed: 0.28, pulse: 0.7, hueBoost: 0.2 },
  done: { orbitSpeed: 0.12, pulse: 0.25, hueBoost: 0.05 },
  error: { orbitSpeed: 0.1, pulse: 0.1, hueBoost: -0.2 },
} as const;

const REVIEWERS = [
  {
    key: "metodologi",
    colorVar: "--reviewer-metodologi",
    position: [-2.1, 0, 0.7] as [number, number, number],
    rotation: 0.35,
    shape: "octahedron" as const,
  },
  {
    key: "orisinalitas",
    colorVar: "--reviewer-orisinalitas",
    position: [0, 0, -1.1] as [number, number, number],
    rotation: 1.3,
    shape: "icosahedron" as const,
  },
  {
    key: "revisi",
    colorVar: "--reviewer-revisi",
    position: [2.1, 0, 0.5] as [number, number, number],
    rotation: 2.35,
    shape: "torusKnot" as const,
  },
];

function cssVar(name: string): THREE.Color {
  if (typeof window === "undefined") return new THREE.Color("#8b8b8b");
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const parts = raw.split(" ").map(Number);
  if (parts.length === 3 && parts.every((p) => !isNaN(p))) {
    return new THREE.Color(parts[0] / 255, parts[1] / 255, parts[2] / 255);
  }
  return new THREE.Color("#8b8b8b");
}

function StudioGlow() {
  const heroState = useHeroStore((s) => s.state);
  const lightRef = useRef<THREE.PointLight>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const cfg = STATE_CONFIG[heroState];
    const pulse = Math.sin(t * 2.2) * cfg.pulse;

    if (lightRef.current) {
      lightRef.current.intensity = 1.2 + pulse;
    }

    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.18;
      meshRef.current.rotation.x = t * 0.1;
      meshRef.current.position.y = 0.18 + Math.sin(t * 1.4) * 0.08;
    }
  });

  const accentColor = cssVar("--accent-mid");
  const fillColor = cssVar("--accent-from");

  return (
    <group position={[0, 0.2, 0]}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.42, 1]} />
        <meshStandardMaterial
          color={fillColor}
          emissive={accentColor}
          emissiveIntensity={0.7}
          metalness={0.3}
          roughness={0.22}
        />
      </mesh>
      <pointLight ref={lightRef} color={accentColor} intensity={1.4} distance={7} decay={2} />
    </group>
  );
}

function ReviewerStand({
  colorVar,
  position,
  rotation,
  shape,
  motionReduced,
}: {
  colorVar: string;
  position: [number, number, number];
  rotation: number;
  shape: "octahedron" | "icosahedron" | "torusKnot";
  motionReduced?: boolean;
}) {
  const heroState = useHeroStore((s) => s.state);
  const cfg = STATE_CONFIG[heroState];
  const color = cssVar(colorVar);
  const bodyColor = cfg.hueBoost < 0 ? new THREE.Color(color).multiplyScalar(0.9) : color;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Float
        speed={motionReduced ? 0 : 0.9}
        floatIntensity={motionReduced ? 0 : 0.28}
        rotationIntensity={motionReduced ? 0 : 0.2}
      >
        <mesh position={[0, -0.6, 0]} receiveShadow>
          <cylinderGeometry args={[0.8, 0.92, 0.42, 32]} />
          <meshStandardMaterial color="#f5efe7" roughness={0.86} metalness={0.06} />
        </mesh>

        <mesh position={[0, 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.54, 0.62, 0.7, 32]} />
          <meshStandardMaterial color="#f1e7da" roughness={0.7} metalness={0.08} />
        </mesh>

        <mesh position={[0, 0.85, 0]} castShadow>
          {shape === "octahedron" && <octahedronGeometry args={[0.52, 0]} />}
          {shape === "icosahedron" && <icosahedronGeometry args={[0.56, 0]} />}
          {shape === "torusKnot" && <torusKnotGeometry args={[0.46, 0.18, 64, 10, 2, 3]} />}
          <meshStandardMaterial
            color={bodyColor}
            emissive={bodyColor}
            emissiveIntensity={0.32 + cfg.hueBoost}
            roughness={0.32}
            metalness={0.4}
          />
        </mesh>
      </Float>
    </group>
  );
}

function StageDocumentStack() {
  const heroState = useHeroStore((s) => s.state);
  const cfg = STATE_CONFIG[heroState];

  return (
    <group position={[0, -0.15, 0]}>
      {[0, 0.09, 0.18].map((y, idx) => (
        <mesh key={idx} position={[0, y, -0.36 + idx * 0.04]} castShadow>
          <boxGeometry args={[1.65, 0.08, 1.2]} />
          <meshStandardMaterial
            color={idx === 2 ? "#efe2d0" : "#f8f1e6"}
            emissive={cssVar(idx === 0 ? "--accent-mid" : "--accent-from")}
            emissiveIntensity={0.08 + cfg.hueBoost * 0.3}
            roughness={0.78}
          />
        </mesh>
      ))}
    </group>
  );
}

function ParallaxGroup({ children, motionReduced }: { children: React.ReactNode; motionReduced?: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const target = useRef({ x: 0, y: 0 });

  useFrame(({ pointer }) => {
    if (motionReduced) return;
    target.current.x = pointer.x * 0.18;
    target.current.y = pointer.y * 0.1;

    if (groupRef.current) {
      groupRef.current.rotation.y += (target.current.x - groupRef.current.rotation.y) * 0.05;
      groupRef.current.rotation.x += (-target.current.y - groupRef.current.rotation.x) * 0.05;
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

export function HeroSceneInner({ degraded, motionReduced }: { degraded: boolean; motionReduced?: boolean }) {
  const sparkleCount = degraded ? 6 : motionReduced ? 0 : 18;

  return (
    <>
      <color attach="background" args={["#f6efe7"]} />
      <ambientLight intensity={0.9} />
      <directionalLight
        position={[4, 6, 3]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-3, 2, 4]} intensity={0.45} color="#f8d3ae" />

      <ParallaxGroup motionReduced={motionReduced}>
        <group position={[0, -1.2, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.75, 0]} receiveShadow>
            <circleGeometry args={[4.8, 64]} />
            <meshStandardMaterial color="#efe4d5" roughness={1} />
          </mesh>

          <mesh position={[0, -0.6, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[2.2, 2.5, 0.5, 48]} />
            <meshStandardMaterial color="#f8f3ee" roughness={0.9} metalness={0.08} />
          </mesh>

          <mesh position={[0, -0.2, 0]} castShadow>
            <cylinderGeometry args={[1.7, 1.9, 0.42, 48]} />
            <meshStandardMaterial color="#efe6dc" roughness={0.72} metalness={0.08} />
          </mesh>

          <StageDocumentStack />
          <StudioGlow />
        </group>

        {REVIEWERS.map(({ key, ...props }) => (
          <ReviewerStand key={key} motionReduced={motionReduced} {...props} />
        ))}
      </ParallaxGroup>

      {sparkleCount > 0 && (
        <Sparkles
          count={sparkleCount}
          scale={6}
          size={1.2}
          speed={0.2}
          opacity={0.24}
          color="#d7a983"
        />
      )}
    </>
  );
}

export function HeroSceneWithMonitor({
  degraded,
  onDegraded,
  motionReduced,
}: {
  degraded: boolean;
  onDegraded: (v: boolean) => void;
  motionReduced?: boolean;
}) {
  return (
    <PerformanceMonitor
      onDecline={() => onDegraded(true)}
      onIncline={() => onDegraded(false)}
    >
      <HeroSceneInner degraded={degraded} motionReduced={motionReduced} />
    </PerformanceMonitor>
  );
}
