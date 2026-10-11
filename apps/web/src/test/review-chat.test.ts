import { describe, expect, it } from "vitest";
import { answerReviewQuestion } from "@/lib/review-chat";
import type { ParsedReport } from "@/lib/schemas";

const REPORT: ParsedReport = {
  parse_ok: true,
  reviewers: [
    {
      key: "metodologi",
      status: "ok",
      verdict: "REVISI MAYOR",
      summary: "Validasi penelitian perlu dijelaskan.",
      findings: [
        {
          no: 1,
          aspect: "Validasi",
          description: "Skema validasi belum menjelaskan pemisahan data.",
          reference: "Bab 3, halaman 12",
        },
      ],
      priority_recommendations: ["Jelaskan pembagian data train dan test."],
    },
  ],
  debate_points: [],
};

describe("answerReviewQuestion", () => {
  it("answers from the related finding rather than repeating the full review", () => {
    const answer = answerReviewQuestion("Apa maksud temuan validasi?", REPORT);

    expect(answer).toContain("temuan Validasi");
    expect(answer).toContain("Skema validasi belum menjelaskan pemisahan data.");
    expect(answer).toContain("Bab 3, halaman 12");
    expect(answer).not.toContain("REVISI MAYOR");
  });

  it("returns only the relevant recommendation", () => {
    const answer = answerReviewQuestion("Apa rekomendasi metodologi?", REPORT);

    expect(answer).toContain("rekomendasi Metodologi");
    expect(answer).toContain("Jelaskan pembagian data train dan test.");
    expect(answer).not.toContain("Skema validasi belum menjelaskan pemisahan data.");
  });

  it("asks for a specific aspect instead of returning the whole review", () => {
    const answer = answerReviewQuestion("Bisa jelaskan hasil review ini?", REPORT);

    expect(answer).toContain("Sebutkan aspek/reviewer");
    expect(answer).not.toContain("Validasi penelitian perlu dijelaskan.");
  });

  it("does not invent explanations when the result is unstructured", () => {
    const answer = answerReviewQuestion("Jelaskan hasilnya", {
      parse_ok: false,
      reviewers: [],
      debate_points: [],
    });

    expect(answer).toContain("tanpa menebak");
  });

  it("explains a quota failure from the raw reviewer output", () => {
    const answer = answerReviewQuestion(
      "Kok ada yang error?",
      { parse_ok: false, reviewers: [], debate_points: [] },
      [
        "===== REVIEWER: METODOLOGI =====",
        "Error: 429 quota exceeded. Please retry in 13h42m.",
        "===== REVIEWER: ORISINALITAS =====",
        "Error: 429 quota exceeded.",
        "===== REVIEWER: REVISI =====",
        "Review completed.",
      ].join("\n"),
    );

    expect(answer).toContain("metodologi dan orisinalitas");
    expect(answer).toContain("kuota Gemini");
    expect(answer).toContain("13h42m");
    expect(answer).toContain("bukan kesalahan pada dokumen");
  });
});
