/**
 * DebateGraphScene — Three.js scene untuk Debate Graph 3D.
 *
 * Spec Bagian 7c:
 *  - Node: octahedron (metodologi/cyan), icosahedron (orisinalitas/violet),
 *    torusKnot kecil (revisi/amber); emissive halus; label teks (drei Text)
 *  - Edge KONTRADIKSI = garis bergerigi (jagged) berdenyut + simbol ⚡ di tengah
 *  - Edge PENGUATAN_SILANG = garis lengkung mulus + partikel mengalir
 *  - ISU_UNIK = satelit berlian (octahedron kecil) mengorbit node terkait
 *  - 3-reviewer hub = node kecil di tengah dengan garis ke tiap reviewer
 *  - Hover = highlight + dim sisanya + tooltip
 *  - OrbitControls dengan damping, batas zoom dan polar angle
 *  - Tombol reset kamera + toggle putar otomatis
 *  - Reviewer gagal = node hollow (wireframe abu-abu)
 *  - PerformanceMonitor untuk turunkan kualitas saat FPS rendah
 *
 * Dirender hanya di client (next/dynamic ssr:false dari DebateGraphCanvas).
 */
"use client";

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import {
  OrbitControls,
  Text,
  Sparkles,
  PerformanceMonitor,
} from "@react-three/drei";
import * as THREE from "three";
import type { GraphModel, GraphNode, GraphEdge, GraphSatellite } from "@/lib/graph-model";

// ── Colour helper ──────────────────────────────────────────────────────────────

/** Read a CSS variable from :root as a hex string. Falls back to grey. */
function cssVar(name: string): string {
  if (typeof window === "undefined") return "#888";
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  // Format: "R G B" → parse to hex
  const parts = raw.split(" ").map(Number);
  if (parts.length === 3 && parts.every((p) => !isNaN(p))) {
    return `rgb(${parts[0]},${parts[1]},${parts[2]})`;
  }
  return "#888";
}

// ── Node geometries ────────────────────────────────────────────────────────────

function NodeMesh({
  node,
  isHovered,
  isDimmed,
  onHover,
  onUnhover,
  onClick,
}: {
  node: GraphNode;
  isHovered: boolean;
  isDimmed: boolean;
  onHover: () => void;
  onUnhover: () => void;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = cssVar(node.colorVar);
  const opacity = isDimmed ? 0.25 : 1;
  const emissiveIntensity = isHovered ? 0.6 : 0.15;

  // Gentle float animation
  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    meshRef.current.position.y =
      node.position[1] + Math.sin(t * 0.7 + node.position[0]) * 0.06;
    meshRef.current.rotation.y += 0.004;
  });

  const scale = isHovered ? 1.18 : 1;

  const commonMat = (
    <meshStandardMaterial
      color={node.available ? color : "#555"}
      emissive={node.available ? color : "#333"}
      emissiveIntensity={node.available ? emissiveIntensity : 0.05}
      metalness={0.4}
      roughness={0.3}
      transparent
      opacity={opacity}
      wireframe={!node.available}
    />
  );

  return (
    <group position={node.position}>
      <mesh
        ref={meshRef}
        scale={scale}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(); }}
        onPointerOut={() => onUnhover()}
        castShadow
      >
        {node.shape === "octahedron" && <octahedronGeometry args={[0.38, 0]} />}
        {node.shape === "icosahedron" && <icosahedronGeometry args={[0.36, 0]} />}
        {node.shape === "torusKnot" && <torusKnotGeometry args={[0.2, 0.07, 80, 12, 2, 3]} />}
        {commonMat}
      </mesh>

      {/* Label below node */}
      <Text
        position={[0, -0.62, 0]}
        fontSize={0.13}
        color={node.available ? color : "#666"}
        anchorX="center"
        anchorY="top"
        renderOrder={10}
      >
        {node.label}
        {!node.available ? "\n(Tidak tersedia)" : ""}
      </Text>
    </group>
  );
}

// ── Hub node for 3-way edges ───────────────────────────────────────────────────

function HubNode({ visible }: { visible: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y = state.clock.elapsedTime * 0.5;
  });
  if (!visible) return null;
  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <sphereGeometry args={[0.1, 16, 16]} />
      <meshStandardMaterial
        color="#aaa"
        emissive="#888"
        emissiveIntensity={0.3}
        transparent
        opacity={0.7}
      />
    </mesh>
  );
}

// ── Edges ──────────────────────────────────────────────────────────────────────

const NODE_POSITIONS: Record<string, [number, number, number]> = {
  metodologi: [0, 1.4, 0],
  orisinalitas: [-1.2, -0.7, 0],
  revisi: [1.2, -0.7, 0],
  hub: [0, 0, 0],
};

/** Build a jagged path between two points (for KONTRADIKSI) */
function buildJaggedPoints(
  from: THREE.Vector3,
  to: THREE.Vector3,
  steps = 12,
  amplitude = 0.08,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const base = from.clone().lerp(to, t);
    if (i > 0 && i < steps) {
      const jitter = (Math.random() - 0.5) * 2 * amplitude;
      const perp = new THREE.Vector3(-(to.y - from.y), to.x - from.x, 0)
        .normalize()
        .multiplyScalar(jitter);
      base.add(perp);
    }
    points.push(base);
  }
  return points;
}

/** Build a smooth arc between two points (for PENGUATAN_SILANG) */
function buildArcPoints(
  from: THREE.Vector3,
  to: THREE.Vector3,
  segments = 30,
  lift = 0.35,
): THREE.Vector3[] {
  const mid = from.clone().lerp(to, 0.5);
  mid.y += lift;
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  return curve.getPoints(segments);
}

function EdgeLine({
  edge,
  isHovered,
  isDimmed,
  onHover,
  onUnhover,
  onClick,
}: {
  edge: GraphEdge;
  isHovered: boolean;
  isDimmed: boolean;
  onHover: () => void;
  onUnhover: () => void;
  onClick: () => void;
}) {
  const fromPos = new THREE.Vector3(...(NODE_POSITIONS[edge.from] ?? [0, 0, 0]));
  const toPos = new THREE.Vector3(...(NODE_POSITIONS[edge.to] ?? [0, 0, 0]));
  const midPos = fromPos.clone().lerp(toPos, 0.5);

  // Jagged points are stable (seeded by edge id)
  const jaggedPoints = useMemo(
    () => buildJaggedPoints(fromPos, toPos, 14, 0.09),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edge.id],
  );
  const arcPoints = useMemo(
    () => buildArcPoints(fromPos, toPos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edge.id],
  );

  const points = edge.type === "KONTRADIKSI" ? jaggedPoints : arcPoints;
  const color =
    edge.type === "KONTRADIKSI"
      ? cssVar("--error")
      : cssVar("--accent-mid");

  const opacity = isDimmed ? 0.1 : isHovered ? 1 : 0.65;

  // Build Float32Array once per edge
  const positions = useMemo(
    () => new Float32Array(points.flatMap((p) => [p.x, p.y, p.z])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edge.id],
  );

  // Use primitive line object for full Three.js type safety
  const lineObj = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat =
      edge.type === "KONTRADIKSI"
        ? new THREE.LineDashedMaterial({
            color,
            transparent: true,
            opacity,
            dashSize: 0.08,
            gapSize: 0.04,
          })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.Line(geom, mat);
    if (edge.type === "KONTRADIKSI") line.computeLineDistances();
    return line;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edge.id]);

  // Update opacity reactively
  useMemo(() => {
    if (lineObj.material) {
      (lineObj.material as THREE.LineBasicMaterial).opacity = opacity;
    }
  }, [lineObj, opacity]);

  // Pulsing gapSize for KONTRADIKSI
  useFrame((state) => {
    if (edge.type !== "KONTRADIKSI") return;
    const mat = lineObj.material as THREE.LineDashedMaterial;
    mat.gapSize = 0.04 + Math.abs(Math.sin(state.clock.elapsedTime * 2)) * 0.04;
  });

  return (
    <group>
      <primitive
        object={lineObj}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(); }}
        onPointerOut={() => onUnhover()}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
      />

      {/* Partikel mengalir untuk PENGUATAN_SILANG */}
      {edge.type === "PENGUATAN_SILANG" && !isDimmed && (
        <FlowParticles points={arcPoints} color={color} />
      )}

      {/* Simbol di midpoint */}
      <Text
        position={[midPos.x, midPos.y + 0.12, midPos.z]}
        fontSize={0.16}
        color={color}
        fillOpacity={isDimmed ? 0.2 : 0.9}
        anchorX="center"
        anchorY="middle"
      >
        {edge.type === "KONTRADIKSI" ? "!" : "+"}
      </Text>
    </group>
  );
}

/** Partikel mengalir di sepanjang garis PENGUATAN_SILANG */
function FlowParticles({
  points,
  color,
}: {
  points: THREE.Vector3[];
  color: string;
}) {
  const count = 6;
  const refs = useRef<THREE.Mesh[]>([]);
  const offsets = useMemo(
    () => Array.from({ length: count }, (_, i) => i / count),
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.4;
    offsets.forEach((offset, i) => {
      const progress = ((t + offset) % 1);
      const idx = Math.floor(progress * (points.length - 1));
      const local = progress * (points.length - 1) - idx;
      const p1 = points[Math.min(idx, points.length - 1)];
      const p2 = points[Math.min(idx + 1, points.length - 1)];
      if (refs.current[i] && p1 && p2) {
        refs.current[i].position.lerpVectors(p1, p2, local);
      }
    });
  });

  return (
    <>
      {offsets.map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) refs.current[i] = el; }}>
          <sphereGeometry args={[0.025, 6, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
        </mesh>
      ))}
    </>
  );
}

// ── Satellite ──────────────────────────────────────────────────────────────────

function SatelliteMesh({
  nodePos,
  index,
  isDimmed,
  isHovered,
  onHover,
  onUnhover,
  onClick,
}: {
  sat: GraphSatellite;
  nodePos: [number, number, number];
  index: number;
  isDimmed: boolean;
  isHovered: boolean;
  onHover: () => void;
  onUnhover: () => void;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const radius = 0.55;
  const speed = 0.5 + index * 0.1;
  const phaseOffset = (index * Math.PI * 2) / 3;

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime * speed + phaseOffset;
    meshRef.current.position.x = nodePos[0] + Math.cos(t) * radius;
    meshRef.current.position.y = nodePos[1] + Math.sin(t * 0.5) * 0.1;
    meshRef.current.position.z = nodePos[2] + Math.sin(t) * radius;
  });

  const color = cssVar("--warning");

  return (
    <mesh
      ref={meshRef}
      scale={isHovered ? 0.14 : 0.1}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(); }}
      onPointerOut={() => onUnhover()}
    >
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.4}
        transparent
        opacity={isDimmed ? 0.15 : 0.85}
      />
    </mesh>
  );
}

// ── Camera reset ───────────────────────────────────────────────────────────────

function CameraReset({ trigger }: { trigger: number }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    if (trigger === 0) return;
    camera.position.set(0, 0, 4.5);
    camera.lookAt(0, 0, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (controls as any)?.reset?.();
  }, [trigger, camera, controls]);
  return null;
}

// ── Main Scene ────────────────────────────────────────────────────────────────

export interface SceneSelection {
  type: "node" | "edge" | "satellite";
  id: string;
}

interface SceneProps {
  model: GraphModel;
  filter: "all" | "KONTRADIKSI" | "PENGUATAN_SILANG" | "ISU_UNIK";
  autoRotate: boolean;
  resetTrigger: number;
  onSelect: (sel: SceneSelection | null) => void;
  degraded: boolean;
}

export function DebateGraphScene({
  model,
  filter,
  autoRotate,
  resetTrigger,
  onSelect,
  degraded,
}: SceneProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filteredEdges = useMemo(
    () =>
      filter === "all"
        ? model.edges
        : model.edges.filter((e) => e.type === filter),
    [model.edges, filter],
  );

  const filteredSats = useMemo(
    () =>
      filter === "all" || filter === "ISU_UNIK"
        ? model.satellites
        : [],
    [model.satellites, filter],
  );

  const hasHub = filteredEdges.some((e) => e.to === "hub");

  const handleNodeHover = useCallback((id: string) => setHoveredId(id), []);
  const handleUnhover = useCallback(() => setHoveredId(null), []);

  return (
    <>
      {/* Ambient + directional light */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 5, 4]} intensity={0.8} />
      <pointLight position={[-2, -2, 2]} intensity={0.3} color="#818cf8" />

      {/* Camera reset helper */}
      <CameraReset trigger={resetTrigger} />

      {/* OrbitControls — damping, bounded zoom + polar */}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={2.5}
        maxDistance={8}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={(Math.PI * 5) / 6}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        makeDefault
      />

      {/* Subtle background sparkles */}
      {!degraded && (
        <Sparkles
          count={30}
          scale={6}
          size={0.8}
          speed={0.2}
          color="#818cf8"
          opacity={0.25}
        />
      )}

      {/* Hub node for 3-way edges */}
      <HubNode visible={hasHub} />

      {/* Nodes */}
      {model.nodes.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          isHovered={hoveredId === node.id}
          isDimmed={hoveredId !== null && hoveredId !== node.id}
          onHover={() => handleNodeHover(node.id)}
          onUnhover={handleUnhover}
          onClick={() => onSelect({ type: "node", id: node.id })}
        />
      ))}

      {/* Edges */}
      {filteredEdges.map((edge) => (
        <EdgeLine
          key={edge.id}
          edge={edge}
          isHovered={hoveredId === edge.id}
          isDimmed={hoveredId !== null && hoveredId !== edge.id}
          onHover={() => handleNodeHover(edge.id)}
          onUnhover={handleUnhover}
          onClick={() => onSelect({ type: "edge", id: edge.id })}
        />
      ))}

      {/* Satellites */}
      {filteredSats.map((sat, i) => {
        const nodePos = NODE_POSITIONS[sat.nodeId] as [number, number, number] ?? [0, 0, 0];
        return (
          <SatelliteMesh
            key={sat.id}
            sat={sat}
            nodePos={nodePos}
            index={i}
            isDimmed={hoveredId !== null && hoveredId !== sat.id}
            isHovered={hoveredId === sat.id}
            onHover={() => handleNodeHover(sat.id)}
            onUnhover={handleUnhover}
            onClick={() => onSelect({ type: "satellite", id: sat.id })}
          />
        );
      })}
    </>
  );
}

// ── Outer Canvas wrapper (exported for next/dynamic) ──────────────────────────

interface CanvasProps {
  model: GraphModel;
  filter: "all" | "KONTRADIKSI" | "PENGUATAN_SILANG" | "ISU_UNIK";
  autoRotate: boolean;
  resetTrigger: number;
  onSelect: (sel: SceneSelection | null) => void;
  /** Reduced-motion: render canvas tetapi tanpa animasi loop */
  motionReduced?: boolean;
}

export function DebateGraphCanvasInner({
  model,
  filter,
  autoRotate,
  resetTrigger,
  onSelect,
  motionReduced,
}: CanvasProps) {
  const [degraded, setDegraded] = useState(false);

  const kontradiksiCount = model.edges.filter((e) => e.type === "KONTRADIKSI").length;
  const penguatanCount = model.edges.filter((e) => e.type === "PENGUATAN_SILANG").length;
  const isuUnikCount = model.satellites.length +
    model.edges.filter((e) => e.type === "ISU_UNIK").length;

  const ariaLabel = [
    kontradiksiCount > 0 && `${kontradiksiCount} kontradiksi`,
    penguatanCount > 0 && `${penguatanCount} penguatan silang`,
    isuUnikCount > 0 && `${isuUnikCount} isu unik`,
  ]
    .filter(Boolean)
    .join(", ") || "Tidak ada titik perdebatan terdeteksi";

  return (
      <Canvas
        dpr={[1, degraded ? 1 : 1.75]}
        camera={{ position: [0, 0, 4.5], fov: 50 }}
        role="img"
        aria-label={ariaLabel}
        style={{ width: "100%", height: "100%" }}
        frameloop="demand"
      >
        <PerformanceMonitor
          onDecline={() => setDegraded(true)}
          onIncline={() => setDegraded(false)}
        >
        <DebateGraphScene
          model={model}
          filter={filter}
          autoRotate={motionReduced ? false : autoRotate}
          resetTrigger={resetTrigger}
          onSelect={onSelect}
          degraded={degraded}
        />
        </PerformanceMonitor>
      </Canvas>
  );
}
