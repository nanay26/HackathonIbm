import type { ParsedReport } from "./schemas";

interface ReviewExcerpt {
  reviewer: string;
  category: "ringkasan" | "temuan" | "rekomendasi" | "titik perdebatan";
  aspect: string;
  content: string;
  reference?: string | null;
}

const STOP_WORDS = new Set([
  "apa", "apakah", "yang", "dan", "atau", "dari", "dengan", "ini", "itu",
  "saya", "tolong", "bisa", "jelaskan", "maksud", "hasil", "review",
  "reviewer", "tentang", "untuk", "pada", "tersebut", "bagian", "belum",
  "paham", "kenapa", "mengapa", "bagaimana", "lebih", "ada", "di", "ke",
]);

function tokenize(value: string): string[] {
  return value
    .toLocaleLowerCase("id-ID")
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) ?? [];
}

function getExcerpts(report: ParsedReport): ReviewExcerpt[] {
  const excerpts: ReviewExcerpt[] = [];

  for (const reviewer of report.reviewers) {
    const reviewerLabel = reviewer.key[0].toUpperCase() + reviewer.key.slice(1);
    if (reviewer.summary) {
      excerpts.push({
        reviewer: reviewerLabel,
        category: "ringkasan",
        aspect: reviewerLabel,
        content: reviewer.summary,
      });
    }
    for (const finding of reviewer.findings) {
      excerpts.push({
        reviewer: reviewerLabel,
        category: "temuan",
        aspect: finding.aspect,
        content: finding.description,
        reference: finding.reference,
      });
    }
    for (const recommendation of reviewer.priority_recommendations) {
      excerpts.push({
        reviewer: reviewerLabel,
        category: "rekomendasi",
        aspect: reviewerLabel,
        content: recommendation,
      });
    }
  }

  for (const point of report.debate_points) {
    excerpts.push({
      reviewer: point.reviewers.join(", ") || "Lintas reviewer",
      category: "titik perdebatan",
      aspect: point.aspect,
      content: point.description,
      reference: point.references.join("\n") || null,
    });
  }

  return excerpts;
}

export function answerReviewQuestion(
  question: string,
  report: ParsedReport | null | undefined,
  rawOutput?: string | null,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
): string {
  if (!report?.parse_ok) {
    const source = rawOutput ?? "";
    if (/429|quota exceeded|too many requests/i.test(source)) {
      const failedReviewers = [...source.matchAll(/===== REVIEWER:\s*([A-Z]+)\s*=====([\s\S]*?)(?=\n===== REVIEWER:|\s*$)/gi)]
        .filter((match) => /error|failed/i.test(match[2]))
        .map((match) => match[1].toLocaleLowerCase("id-ID"));
      const reviewerText = failedReviewers.length
        ? `Dari keluaran yang tersedia, reviewer ${failedReviewers.join(" dan ")} gagal.`
        : "Sebagian proses reviewer gagal.";
      const retryDelay = source.match(/retry in ([^\s,]+)/i)?.[1]?.replace(/[.]$/, "");
      return [
        reviewerText,
        "Penyebabnya adalah batas kuota Gemini (HTTP 429), bukan kesalahan pada dokumen. Reviewer yang sudah selesai tetap terlihat pada hasil parsial; proses yang gagal tidak menghasilkan temuan yang dapat dijelaskan.",
        retryDelay ? `Pesan Langflow menyarankan mencoba lagi dalam ${retryDelay}.` : "",
      ].filter(Boolean).join("\n\n");
    }

    const latestContext = history
      .filter((message) => message.role === "user")
      .slice(-2)
      .map((message) => message.content)
      .join(" ");
    const quoted = source.match(/(?:Error:|gagal:)\s*([^\n]+)/i)?.[1];
    if (quoted) {
      return `Berdasarkan error pada hasil review${latestContext ? ` dan pertanyaan sebelumnya (“${latestContext}”)` : ""}, penyebab yang tercatat adalah: ${quoted}. Saya tidak akan menebak temuan yang tidak tersedia.`;
    }
    return "Hasil review ini belum tersedia dalam format terstruktur, jadi saya tidak bisa menjelaskan bagian tertentu tanpa menebak. Sebutkan kalimat dari hasil mentah yang ingin Anda pahami.";
  }

  const priorQuestions = history
    .filter((message) => message.role === "user")
    .slice(-2)
    .map((message) => message.content)
    .join(" ");
  const questionTokens = new Set([
    ...tokenize(question),
    ...tokenize(priorQuestions),
  ]);
  const excerpts = getExcerpts(report);
  const asksForRecommendation = /rekomendasi|saran|langkah|perbaikan/i.test(question);
  const asksForFinding = /temuan|masalah|kritik|catatan/i.test(question);

  const ranked = excerpts
    .map((excerpt, index) => {
      const excerptTokens = new Set(tokenize(
        `${excerpt.reviewer} ${excerpt.category} ${excerpt.aspect} ${excerpt.content}`,
      ));
      let score = [...questionTokens].filter((token) => excerptTokens.has(token)).length;
      if (asksForRecommendation && excerpt.category === "rekomendasi") score += 3;
      if (asksForFinding && excerpt.category === "temuan") score += 2;
      if (/pertama|awal/i.test(question) && excerpt.category === "rekomendasi" && index === 0) {
        score += 3;
      }
      return { excerpt, score, index };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = ranked.slice(0, 2).map(({ excerpt }) => excerpt);
  if (selected.length === 0) {
    const availableAspects = [...new Set(excerpts.map((excerpt) => excerpt.aspect))]
      .slice(0, 6)
      .join(", ");
    return availableAspects
      ? `Saya bisa menjelaskan isi review, tetapi pertanyaan ini belum menyebut aspek yang cocok dengan temuan tertentu. Sebutkan aspek/reviewer yang dimaksud (misalnya: ${availableAspects}) atau kutip kalimat yang membingungkan.`
      : "Belum ada temuan atau rekomendasi terstruktur yang dapat dijelaskan dari hasil review ini.";
  }

  return selected.map((excerpt) => {
    const explanation = [
      `Bagian yang paling terkait adalah ${excerpt.category} ${excerpt.aspect} (${excerpt.reviewer}): “${excerpt.content}”`,
      excerpt.reference ? `Rujukan yang dicatat: “${excerpt.reference}”` : "",
    ].filter(Boolean).join("\n");
    return explanation;
  }).join("\n\n");
}
