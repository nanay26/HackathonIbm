/**
 * Unit tests for buildGraphModel — spec Bagian 7c DoD.
 *
 * Scenarios:
 *  1. Normal: 3 reviewer ok + debate points → nodes + edges + satellites
 *  2. Reviewer gagal/missing → node hollow (available=false), tanpa edge
 *  3. debate_points kosong → nodes ok, edges/satellites kosong
 *  4. 3 reviewer sekaligus → hub edge
 *  5. parse_ok=false → isEmpty=true, no edges
 *  6. ISU_UNIK single reviewer → satellite, bukan edge
 *  7. extractReviewerKeys helper
 */
import { describe, it, expect } from "vitest";
import {
  buildGraphModel,
  extractReviewerKeys,
  type GraphModel,
} from "../graph-model";
import type { ParsedReport } from "../schemas";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeReviewer = (
  key: "metodologi" | "orisinalitas" | "revisi",
  status: "ok" | "failed" | "missing" = "ok",
) => ({
  key,
  status,
  verdict: status === "ok" ? "REVISI MINOR" : "",
  summary: status === "ok" ? "Ringkasan." : "",
  findings: [],
  priority_recommendations: [],
});

const ALL_OK_REVIEWERS = [
  makeReviewer("metodologi"),
  makeReviewer("orisinalitas"),
  makeReviewer("revisi"),
];

const dp2Way = {
  type: "KONTRADIKSI" as const,
  aspect: "Metodologi vs Orisinalitas",
  description: "Deskripsi kontradiksi.",
  reviewers: [
    "- Reviewer Metodologi: tidak setuju.",
    "- Reviewer Orisinalitas: berbeda pendapat.",
  ],
  references: [],
};

const dp3Way = {
  type: "PENGUATAN_SILANG" as const,
  aspect: "Semua setuju",
  description: "Ketiga reviewer sepakat.",
  reviewers: [
    "- Reviewer Metodologi: mendukung.",
    "- Reviewer Orisinalitas: mendukung.",
    "- Reviewer Revisi: mendukung.",
  ],
  references: [],
};

const dpIsuUnik = {
  type: "ISU_UNIK" as const,
  aspect: "Hanya Revisi",
  description: "Hanya ditemukan oleh reviewer revisi.",
  reviewers: ["- Reviewer Revisi: catatan khusus."],
  references: [],
};

const reportOk: ParsedReport = {
  parse_ok: true,
  reviewers: ALL_OK_REVIEWERS,
  debate_points: [dp2Way, dpIsuUnik],
};

const reportEmpty: ParsedReport = {
  parse_ok: true,
  reviewers: ALL_OK_REVIEWERS,
  debate_points: [],
};

const reportFailed: ParsedReport = {
  parse_ok: false,
  reviewers: [],
  debate_points: [],
};

const reportReviewerFailed: ParsedReport = {
  parse_ok: true,
  reviewers: [
    makeReviewer("metodologi", "failed"),
    makeReviewer("orisinalitas"),
    makeReviewer("revisi"),
  ],
  debate_points: [dp2Way],
};

const report3Way: ParsedReport = {
  parse_ok: true,
  reviewers: ALL_OK_REVIEWERS,
  debate_points: [dp3Way],
};

// ── 1. Normal case ─────────────────────────────────────────────────────────────

describe("buildGraphModel — normal", () => {
  let model: GraphModel;
  beforeEach(() => {
    model = buildGraphModel(reportOk);
  });

  it("returns 3 nodes", () => {
    expect(model.nodes).toHaveLength(3);
  });

  it("all nodes available when all reviewers ok", () => {
    expect(model.nodes.every((n) => n.available)).toBe(true);
  });

  it("node keys match reviewer keys", () => {
    const ids = model.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["metodologi", "orisinalitas", "revisi"]);
  });

  it("correct shapes assigned", () => {
    const met = model.nodes.find((n) => n.id === "metodologi")!;
    const ori = model.nodes.find((n) => n.id === "orisinalitas")!;
    const rev = model.nodes.find((n) => n.id === "revisi")!;
    expect(met.shape).toBe("octahedron");
    expect(ori.shape).toBe("icosahedron");
    expect(rev.shape).toBe("torusKnot");
  });

  it("2-way KONTRADIKSI produces 1 edge", () => {
    expect(model.edges).toHaveLength(1);
    expect(model.edges[0].type).toBe("KONTRADIKSI");
    expect(model.edges[0].to).not.toBe("hub");
  });

  it("ISU_UNIK single reviewer → satellite, not edge", () => {
    expect(model.satellites).toHaveLength(1);
    expect(model.satellites[0].nodeId).toBe("revisi");
  });

  it("isEmpty is false when edges or satellites exist", () => {
    expect(model.isEmpty).toBe(false);
  });
});

// ── 2. Reviewer gagal/missing ──────────────────────────────────────────────────

describe("buildGraphModel — reviewer gagal", () => {
  let model: GraphModel;
  beforeEach(() => {
    model = buildGraphModel(reportReviewerFailed);
  });

  it("node metodologi is NOT available", () => {
    const met = model.nodes.find((n) => n.id === "metodologi")!;
    expect(met.available).toBe(false);
  });

  it("other nodes remain available", () => {
    const ori = model.nodes.find((n) => n.id === "orisinalitas")!;
    const rev = model.nodes.find((n) => n.id === "revisi")!;
    expect(ori.available).toBe(true);
    expect(rev.available).toBe(true);
  });

  it("edge involving failed reviewer is NOT created", () => {
    // dp2Way involves metodologi (failed) — should produce no edge
    expect(model.edges).toHaveLength(0);
  });
});

// ── 3. debate_points kosong ───────────────────────────────────────────────────

describe("buildGraphModel — debate kosong", () => {
  let model: GraphModel;
  beforeEach(() => {
    model = buildGraphModel(reportEmpty);
  });

  it("still returns 3 nodes", () => {
    expect(model.nodes).toHaveLength(3);
  });

  it("edges array is empty", () => {
    expect(model.edges).toHaveLength(0);
  });

  it("satellites array is empty", () => {
    expect(model.satellites).toHaveLength(0);
  });

  it("isEmpty is false (nodes are available)", () => {
    // Nodes exist and are available — graph has content to show
    expect(model.isEmpty).toBe(false);
  });
});

// ── 4. 3 reviewer sekaligus → hub ─────────────────────────────────────────────

describe("buildGraphModel — 3-reviewer hub", () => {
  let model: GraphModel;
  beforeEach(() => {
    model = buildGraphModel(report3Way);
  });

  it("creates exactly 1 edge", () => {
    expect(model.edges).toHaveLength(1);
  });

  it("edge.to is 'hub'", () => {
    expect(model.edges[0].to).toBe("hub");
  });

  it("edge.reviewers has 3 entries", () => {
    expect(model.edges[0].reviewers).toHaveLength(3);
  });

  it("edge type is PENGUATAN_SILANG", () => {
    expect(model.edges[0].type).toBe("PENGUATAN_SILANG");
  });
});

// ── 5. parse_ok=false ──────────────────────────────────────────────────────────

describe("buildGraphModel — parse_ok=false", () => {
  let model: GraphModel;
  beforeEach(() => {
    model = buildGraphModel(reportFailed);
  });

  it("isEmpty is true", () => {
    expect(model.isEmpty).toBe(true);
  });

  it("edges array is empty", () => {
    expect(model.edges).toHaveLength(0);
  });

  it("satellites array is empty", () => {
    expect(model.satellites).toHaveLength(0);
  });
});

// ── 6. ISU_UNIK single reviewer ────────────────────────────────────────────────

describe("buildGraphModel — ISU_UNIK single reviewer", () => {
  it("creates satellite, not edge", () => {
    const model = buildGraphModel(reportOk);
    const sat = model.satellites.find((s) => s.aspect === dpIsuUnik.aspect);
    expect(sat).toBeTruthy();
    expect(sat!.nodeId).toBe("revisi");
    // No edge for this debate point
    const edge = model.edges.find((e) => e.aspect === dpIsuUnik.aspect);
    expect(edge).toBeUndefined();
  });
});

// ── 7. extractReviewerKeys ─────────────────────────────────────────────────────

describe("extractReviewerKeys", () => {
  it("extracts key from line containing reviewer name", () => {
    const keys = extractReviewerKeys(["- Reviewer Metodologi: teks"]);
    expect(keys).toContain("metodologi");
  });

  it("deduplicates repeated mentions", () => {
    const keys = extractReviewerKeys([
      "metodologi: a",
      "metodologi: b",
    ]);
    expect(keys.filter((k) => k === "metodologi")).toHaveLength(1);
  });

  it("returns empty array for unrecognised text", () => {
    const keys = extractReviewerKeys(["tidak ada reviewer di sini"]);
    expect(keys).toHaveLength(0);
  });

  it("extracts multiple different keys", () => {
    const keys = extractReviewerKeys([
      "- Reviewer Orisinalitas: ok.",
      "- Reviewer Revisi: catatan.",
    ]);
    expect(keys).toContain("orisinalitas");
    expect(keys).toContain("revisi");
    expect(keys).not.toContain("metodologi");
  });

  it("case insensitive match", () => {
    const keys = extractReviewerKeys(["METODOLOGI berpendapat..."]);
    expect(keys).toContain("metodologi");
  });
});

// helper needed by some beforeEach
import { beforeEach } from "vitest";
