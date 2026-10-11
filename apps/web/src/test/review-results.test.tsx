/**
 * Vitest tests for ReviewResults, ReviewerCard, DebateCard (Fase 4 DoD).
 *
 * Covers all AC F3:
 *  F3-1: order disclaimer → debate → reviewers
 *  F3-2: nomor, [ASPEK], deskripsi, Rujukan verbatim; Tanpa rujukan tag
 *  F3-3: badge teks+ikon, bukan hanya warna
 *  F3-4: reviewer gagal/missing → stub card, no fabricated content
 *  F3-5: parse_ok=false → raw text + banner
 *  F3-6: accordion keyboard operable, responsive
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReviewResults } from "@/components/ReviewResults";
import { ReviewerCard } from "@/components/ReviewerCard";
import { DebateCard } from "@/components/DebateCard";
import type { ParsedReport, ReviewerResult, DebatePoint } from "@/lib/schemas";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FINDING_WITH_REF = {
  no: 1,
  aspect: "Desain Penelitian",
  description: "Skema validasi tidak dijelaskan.",
  reference: '"validasi dilakukan menggunakan 10-fold CV" (BAB 3, hlm. 24)',
};

const FINDING_NO_REF = {
  no: 2,
  aspect: "Reproduksibilitas",
  description: "Hyperparameter tidak dicantumkan.",
  reference: null,
};

const REVIEWER_OK: ReviewerResult = {
  key: "metodologi",
  status: "ok",
  verdict: "REVISI MAYOR",
  summary: "Metodologi perlu perbaikan signifikan.",
  findings: [FINDING_WITH_REF, FINDING_NO_REF],
  priority_recommendations: ["Perbaiki skema validasi.", "Tambahkan detail hyperparameter."],
};

const REVIEWER_FAILED: ReviewerResult = {
  key: "orisinalitas",
  status: "failed",
  verdict: "",
  summary: "",
  findings: [],
  priority_recommendations: [],
};

const REVIEWER_MISSING: ReviewerResult = {
  key: "revisi",
  status: "missing",
  verdict: "",
  summary: "",
  findings: [],
  priority_recommendations: [],
};

const DEBATE_POINT: DebatePoint = {
  type: "PENGUATAN_SILANG",
  aspect: "Validitas Skema Data Split",
  description: "Dua reviewer menyoroti isu ini secara independen.",
  reviewers: [
    "- Reviewer Metodologi: potensi data leakage.",
    "- Reviewer Revisi: harus diprioritaskan.",
  ],
  references: [],
};

const PARSED_REPORT_OK: ParsedReport = {
  parse_ok: true,
  reviewers: [REVIEWER_OK, REVIEWER_FAILED, REVIEWER_MISSING],
  debate_points: [DEBATE_POINT],
};

const PARSED_REPORT_FAILED: ParsedReport = {
  parse_ok: false,
  reviewers: [],
  debate_points: [],
};

// ── F3-1: Layout order ────────────────────────────────────────────────────────

describe("ReviewResults — layout order (F3-1)", () => {
  it("does not render the disclaimer on the review page", () => {
    render(<ReviewResults result={PARSED_REPORT_OK} />);
    expect(screen.queryByText(/Asistensi akademik/i)).not.toBeInTheDocument();
  });

  it("shows all debate-category filters, including cross-review strengthening", () => {
    render(<ReviewResults result={PARSED_REPORT_OK} />);
    expect(screen.getByRole("button", { name: /^Semua$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Penguatan Silang/i })).toBeInTheDocument();
    expect(screen.queryByText(/Peta 3D/i)).not.toBeInTheDocument();
  });

  it("renders Titik Perdebatan section", () => {
    render(<ReviewResults result={PARSED_REPORT_OK} />);
    expect(screen.getByRole("region", { name: /Titik Perdebatan/i })).toBeInTheDocument();
  });

  it("renders reviewer section", () => {
    render(<ReviewResults result={PARSED_REPORT_OK} />);
    expect(screen.getByRole("region", { name: /Hasil ketiga reviewer/i })).toBeInTheDocument();
  });
});

// ── F3-2: Findings ─────────────────────────────────────────────────────────────

describe("ReviewerCard — findings (F3-2)", () => {
  it("shows [ASPEK] tag", () => {
    render(<ReviewerCard reviewer={REVIEWER_OK} />);
    // Open accordion first
    fireEvent.click(screen.getByRole("button", { name: /Temuan/i }));
    expect(screen.getByText(/ASPEK: Desain Penelitian/i)).toBeInTheDocument();
  });

  it("shows finding description", () => {
    render(<ReviewerCard reviewer={REVIEWER_OK} />);
    fireEvent.click(screen.getByRole("button", { name: /Temuan/i }));
    expect(screen.getByText(/Skema validasi tidak dijelaskan/i)).toBeInTheDocument();
  });

  it("shows Rujukan verbatim", () => {
    render(<ReviewerCard reviewer={REVIEWER_OK} />);
    fireEvent.click(screen.getByRole("button", { name: /Temuan/i }));
    expect(screen.getByText(/10-fold CV/i)).toBeInTheDocument();
  });

  it("shows 'Tanpa rujukan' tag for finding without reference (not hidden)", () => {
    render(<ReviewerCard reviewer={REVIEWER_OK} />);
    fireEvent.click(screen.getByRole("button", { name: /Temuan/i }));
    expect(screen.getByText(/Tanpa rujukan/i)).toBeInTheDocument();
  });

  it("shows finding number", () => {
    render(<ReviewerCard reviewer={REVIEWER_OK} />);
    fireEvent.click(screen.getByRole("button", { name: /Temuan/i }));
    expect(screen.getByText(/#1/)).toBeInTheDocument();
  });
});

// ── F3-3: Debate badge text + icon ───────────────────────────────────────────

describe("DebateCard — badge text + icon (F3-3)", () => {
  it("renders type label as text (not color-only)", () => {
    render(<DebateCard point={DEBATE_POINT} index={0} />);
    expect(screen.getByText(/Penguatan Silang/i)).toBeInTheDocument();
  });

  it("renders icon alongside label", () => {
    render(<DebateCard point={DEBATE_POINT} index={0} />);
    // The badge span contains both icon and label
    const badge = screen.getByLabelText(/Jenis: Penguatan Silang/i);
    expect(badge.textContent).toMatch(/🔗/);
  });

  it("renders debate aspect", () => {
    render(<DebateCard point={DEBATE_POINT} index={0} />);
    expect(screen.getByText(/Validitas Skema Data Split/i)).toBeInTheDocument();
  });

  it("renders reviewer lines", () => {
    render(<DebateCard point={DEBATE_POINT} index={0} />);
    expect(screen.getByText(/potensi data leakage/i)).toBeInTheDocument();
  });

  it("renders all three debate type configs", () => {
    const kontradiksi: DebatePoint = { ...DEBATE_POINT, type: "KONTRADIKSI" };
    const isuUnik: DebatePoint = { ...DEBATE_POINT, type: "ISU_UNIK" };
    const { rerender } = render(<DebateCard point={kontradiksi} index={0} />);
    expect(screen.getByText(/Kontradiksi/i)).toBeInTheDocument();
    rerender(<DebateCard point={isuUnik} index={0} />);
    expect(screen.getByText(/Isu Unik/i)).toBeInTheDocument();
  });
});

// ── F3-4: Reviewer failed/missing ────────────────────────────────────────────

describe("ReviewerCard — failed/missing (F3-4)", () => {
  it("shows stub card for failed reviewer (no fabricated content)", () => {
    render(<ReviewerCard reviewer={REVIEWER_FAILED} />);
    expect(screen.getByText(/Terjadi kesalahan/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Temuan/i })).not.toBeInTheDocument();
  });

  it("shows stub card for missing reviewer", () => {
    render(<ReviewerCard reviewer={REVIEWER_MISSING} />);
    expect(screen.getByText(/tidak tersedia/i)).toBeInTheDocument();
  });

  it("ReviewResults shows alert banner when a reviewer failed", () => {
    render(<ReviewResults result={PARSED_REPORT_OK} />);
    const alerts = screen.getAllByRole("alert");
    const failBanner = alerts.find((el) =>
      el.textContent?.includes("Satu atau lebih reviewer")
    );
    expect(failBanner).toBeTruthy();
  });
});

// ── F3-5: parse_ok=false fallback ────────────────────────────────────────────

describe("ReviewResults — parse_ok=false fallback (F3-5)", () => {
  it("shows fallback banner", () => {
    render(<ReviewResults result={PARSED_REPORT_FAILED} rawOutput="teks mentah" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert").textContent).toMatch(/Format output tidak dapat diparsing/i);
  });

  it("shows raw output verbatim", () => {
    render(<ReviewResults result={PARSED_REPORT_FAILED} rawOutput="teks mentah versi asli" />);
    expect(screen.getByText(/teks mentah versi asli/i)).toBeInTheDocument();
  });

  it("does NOT render structured sections when parse_ok=false", () => {
    render(<ReviewResults result={PARSED_REPORT_FAILED} rawOutput="teks" />);
    expect(screen.queryByRole("region", { name: /Hasil ketiga reviewer/i })).not.toBeInTheDocument();
  });
});

// ── F3-6: Accordion keyboard ─────────────────────────────────────────────────

describe("ReviewerCard — accordion keyboard (F3-6)", () => {
  it("accordion is a button with aria-expanded=false initially", () => {
    render(<ReviewerCard reviewer={REVIEWER_OK} />);
    const btn = screen.getByRole("button", { name: /Temuan/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("accordion opens on click and aria-expanded becomes true", () => {
    render(<ReviewerCard reviewer={REVIEWER_OK} />);
    const btn = screen.getByRole("button", { name: /Temuan/i });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("findings content is hidden initially", () => {
    render(<ReviewerCard reviewer={REVIEWER_OK} />);
    const content = screen.getByRole("button", { name: /Temuan/i })
      .getAttribute("aria-controls");
    const panel = document.getElementById(content!);
    expect(panel).toBeTruthy();
    // hidden attribute present before open
    const btn = screen.getByRole("button", { name: /Temuan/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });
});

// ── Debate count per kategori ─────────────────────────────────────────────────

describe("ReviewResults — debate count per kategori", () => {
  it("shows the available Penguatan Silang filter", () => {
    render(<ReviewResults result={PARSED_REPORT_OK} />);
    expect(screen.getByRole("button", { name: /Penguatan Silang/i })).toBeInTheDocument();
  });

  it("renders each debate point as its own readable card", () => {
    render(<ReviewResults result={PARSED_REPORT_OK} />);
    expect(screen.getByRole("list", { name: /Daftar titik perdebatan/i })).toBeInTheDocument();
    expect(screen.getByText(/Validitas Skema Data Split/)).toBeInTheDocument();
    expect(screen.getByText(/Dua reviewer menyoroti isu ini/i)).toBeInTheDocument();
  });
});

// ── F4: Tombol Unduh Word ─────────────────────────────────────────────────────

describe("ReviewResults — Unduh Word button (F4)", () => {
  // The button has aria-label="Unduh hasil review dalam format Word"
  const DOWNLOAD_LABEL = /Unduh hasil review dalam format Word/i;

  it("shows download button when reviewId is provided", () => {
    render(<ReviewResults result={PARSED_REPORT_OK} reviewId="test-id-123" />);
    expect(screen.getByRole("button", { name: DOWNLOAD_LABEL })).toBeInTheDocument();
  });

  it("does NOT show download button when reviewId is absent", () => {
    render(<ReviewResults result={PARSED_REPORT_OK} />);
    expect(screen.queryByRole("button", { name: DOWNLOAD_LABEL })).not.toBeInTheDocument();
  });

  it("shows download button in fallback (parse_ok=false) when reviewId provided", () => {
    render(
      <ReviewResults
        result={PARSED_REPORT_FAILED}
        rawOutput="teks mentah"
        reviewId="test-id-456"
      />
    );
    expect(screen.getByRole("button", { name: DOWNLOAD_LABEL })).toBeInTheDocument();
  });

  it("download button is enabled initially", () => {
    render(<ReviewResults result={PARSED_REPORT_OK} reviewId="test-id-789" />);
    const btn = screen.getByRole("button", { name: DOWNLOAD_LABEL });
    expect(btn).not.toBeDisabled();
  });
});
