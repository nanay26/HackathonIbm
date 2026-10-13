/**
 * graph-model.ts — Pure data mapping: ParsedReport → graph nodes/edges/satellites.
 *
 * Spec Bagian 7c:
 *  - Node: 3 reviewer (bentuk berbeda per key)
 *  - Edge dari DebatePoint: KONTRADIKSI / PENGUATAN_SILANG / ISU_UNIK
 *  - Satellite: ISU_UNIK yang hanya melibatkan 1 reviewer → orbit node terkait
 *  - DebatePoint 3 reviewer → hub kecil di tengah
 *  - Reviewer gagal/missing → node hollow (abu-abu), tanpa edge
 *  - debate_points kosong → tidak ada edge
 *  - parse_ok=false → kembalikan graph kosong
 *
 * Semua fungsi di sini PURE (tanpa WebGL / browser API) — bisa di-unit-test.
 */

import type { ParsedReport } from "./schemas";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReviewerKey = "metodologi" | "orisinalitas" | "revisi";
export type DebateEdgeType = "KONTRADIKSI" | "PENGUATAN_SILANG" | "ISU_UNIK";

export interface GraphNode {
  id: ReviewerKey;
  /** Shape discriminator for 3D geometry */
  shape: "octahedron" | "icosahedron" | "torusKnot";
  /** CSS-variable token name for reviewer colour */
  colorVar: "--reviewer-metodologi" | "--reviewer-orisinalitas" | "--reviewer-revisi";
  /** Display label */
  label: string;
  /** Position in 3D space — equilateral triangle layout */
  position: [number, number, number];
  /** Whether the reviewer actually produced output */
  available: boolean;
}

export interface GraphEdge {
  id: string;
  type: DebateEdgeType;
  /** reviewer keys involved */
  reviewers: ReviewerKey[];
  /** Source node id (first reviewer) */
  from: ReviewerKey;
  /** Target node id (second reviewer, or hub id for 3-way) */
  to: ReviewerKey | "hub";
  aspect: string;
  description: string;
  rawReviewerLines: string[];
}

export interface GraphSatellite {
  id: string;
  /** Node this satellite orbits */
  nodeId: ReviewerKey;
  aspect: string;
  description: string;
  rawReviewerLines: string[];
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** ISU_UNIK belonging to a single reviewer */
  satellites: GraphSatellite[];
  /** Whether the graph has any visual content */
  isEmpty: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_DEFS: Record<
  ReviewerKey,
  Pick<GraphNode, "shape" | "colorVar" | "label" | "position">
> = {
  metodologi: {
    shape: "octahedron",
    colorVar: "--reviewer-metodologi",
    label: "Metodologi",
    position: [0, 1.4, 0],
  },
  orisinalitas: {
    shape: "icosahedron",
    colorVar: "--reviewer-orisinalitas",
    label: "Orisinalitas",
    position: [-1.2, -0.7, 0],
  },
  revisi: {
    shape: "torusKnot",
    colorVar: "--reviewer-revisi",
    label: "Revisi",
    position: [1.2, -0.7, 0],
  },
};

const REVIEWER_ORDER: ReviewerKey[] = ["metodologi", "orisinalitas", "revisi"];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract reviewer keys that appear in a DebatePoint's reviewer lines.
 * Matches partial key names case-insensitively.
 */
export function extractReviewerKeys(lines: string[]): ReviewerKey[] {
  const found: ReviewerKey[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const key of REVIEWER_ORDER) {
      if (!found.includes(key) && lower.includes(key)) {
        found.push(key);
      }
    }
  }
  return found;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build a GraphModel from a ParsedReport.
 * Pure function — no side effects, no browser APIs.
 */
export function buildGraphModel(parsed: ParsedReport): GraphModel {
  // parse_ok=false → empty graph (spec: don't render graph)
  if (!parsed.parse_ok) {
    return {
      nodes: buildNodes(parsed),
      edges: [],
      satellites: [],
      isEmpty: true,
    };
  }

  const nodes = buildNodes(parsed);
  const availableKeys = new Set(
    parsed.reviewers
      .filter((r) => r.status === "ok")
      .map((r) => r.key as ReviewerKey),
  );

  const edges: GraphEdge[] = [];
  const satellites: GraphSatellite[] = [];

  if (parsed.debate_points.length === 0) {
    return { nodes, edges, satellites, isEmpty: nodes.every((n) => !n.available) };
  }

  for (let i = 0; i < parsed.debate_points.length; i++) {
    const dp = parsed.debate_points[i];
    const involvedKeys = extractReviewerKeys(dp.reviewers).filter((k) =>
      availableKeys.has(k),
    );

    // ISU_UNIK with exactly 1 reviewer → satellite
    if (dp.type === "ISU_UNIK" && involvedKeys.length === 1) {
      satellites.push({
        id: `sat-${i}`,
        nodeId: involvedKeys[0],
        aspect: dp.aspect,
        description: dp.description,
        rawReviewerLines: dp.reviewers,
      });
      continue;
    }

    // Need at least 2 distinct reviewers for an edge (or 3 for a hub edge)
    if (involvedKeys.length < 2) {
      // Single reviewer debate point that isn't ISU_UNIK → treat as satellite
      if (involvedKeys.length === 1) {
        satellites.push({
          id: `sat-${i}`,
          nodeId: involvedKeys[0],
          aspect: dp.aspect,
          description: dp.description,
          rawReviewerLines: dp.reviewers,
        });
      }
      continue;
    }

    // 3-reviewer edge → hub
    if (involvedKeys.length >= 3) {
      edges.push({
        id: `edge-${i}`,
        type: dp.type,
        reviewers: involvedKeys.slice(0, 3),
        from: involvedKeys[0],
        to: "hub",
        aspect: dp.aspect,
        description: dp.description,
        rawReviewerLines: dp.reviewers,
      });
      continue;
    }

    // 2-reviewer edge
    edges.push({
      id: `edge-${i}`,
      type: dp.type,
      reviewers: [involvedKeys[0], involvedKeys[1]],
      from: involvedKeys[0],
      to: involvedKeys[1],
      aspect: dp.aspect,
      description: dp.description,
      rawReviewerLines: dp.reviewers,
    });
  }

  const isEmpty = edges.length === 0 && satellites.length === 0;
  return { nodes, edges, satellites, isEmpty };
}

function buildNodes(parsed: ParsedReport): GraphNode[] {
  const availableKeys = new Set(
    parsed.reviewers
      .filter((r) => r.status === "ok")
      .map((r) => r.key as ReviewerKey),
  );

  return REVIEWER_ORDER.map((key) => ({
    id: key,
    ...NODE_DEFS[key],
    available: availableKeys.has(key),
  }));
}
