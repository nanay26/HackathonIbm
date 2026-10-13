/**
 * Typed API client — all calls go to NEXT_PUBLIC_API_BASE_URL.
 * The Langflow API key is never exposed here (stays in the backend).
 */

import {
  CreateReviewResponseSchema,
  ExtractResponseSchema,
  ReviewStatusResponseSchema,
  type CreateReviewResponse,
  type ExtractResponse,
  type ReviewStatusResponse,
} from "./schemas";
import type { ConversationMessage } from "./history";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// ── Generic fetch helper ───────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  init: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "Tidak dapat terhubung ke server." };
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const code = json?.error?.code ?? "UNKNOWN_ERROR";
    const message = json?.error?.message ?? `HTTP ${res.status}`;
    return { ok: false, code, message };
  }

  return { ok: true, data: json as T };
}

// ── F1: Document extraction ────────────────────────────────────────────────────

export async function extractDocument(
  file: File
): Promise<{ ok: true; data: ExtractResponse } | { ok: false; code: string; message: string }> {
  const form = new FormData();
  form.append("file", file);

  const result = await apiFetch<ExtractResponse>("/api/v1/documents/extract", {
    method: "POST",
    body: form,
  });

  if (!result.ok) return result;
  const parsed = ExtractResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    return { ok: false, code: "PARSE_ERROR", message: "Respons server tidak terduga." };
  }
  return { ok: true, data: parsed.data };
}

// ── F2: Reviews ────────────────────────────────────────────────────────────────

export async function startReview(
  text: string,
  context: {
    conversationId?: string;
    history?: Array<Pick<ConversationMessage, "role" | "content">>;
  } = {},
): Promise<{ ok: true; data: CreateReviewResponse } | { ok: false; code: string; message: string }> {
  const result = await apiFetch<CreateReviewResponse>("/api/v1/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doc_type: "proposal_skripsi",
      text,
      conversation_id: context.conversationId,
      history: context.history ?? [],
    }),
  });

  if (!result.ok) return result;
  const parsed = CreateReviewResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    return { ok: false, code: "PARSE_ERROR", message: "Respons server tidak terduga." };
  }
  return { ok: true, data: parsed.data };
}

export async function getReviewStatus(
  reviewId: string
): Promise<
  { ok: true; data: ReviewStatusResponse } | { ok: false; code: string; message: string }
> {
  const result = await apiFetch<ReviewStatusResponse>(`/api/v1/reviews/${reviewId}`, {
    method: "GET",
  });

  if (!result.ok) return result;
  const parsed = ReviewStatusResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    return { ok: false, code: "PARSE_ERROR", message: "Respons server tidak terduga." };
  }
  return { ok: true, data: parsed.data };
}

export async function retryReview(
  reviewId: string,
  text?: string,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const result = await apiFetch<CreateReviewResponse>(`/api/v1/reviews/${reviewId}/retry`, {
    method: "POST",
    ...(text !== undefined ? { body: JSON.stringify({ text }) } : {}),
  });
  if (!result.ok) return result;
  const parsed = CreateReviewResponseSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.review_id !== reviewId) {
    return { ok: false, code: "PARSE_ERROR", message: "Respons server tidak terduga." };
  }
  return { ok: true };
}

export async function submitReviewApproval(
  reviewId: string,
  actionId: string,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const result = await apiFetch<CreateReviewResponse>(
    `/api/v1/reviews/${reviewId}/approval`,
    {
      method: "POST",
      body: JSON.stringify({ action_id: actionId }),
    },
  );
  if (!result.ok) return result;
  const parsed = CreateReviewResponseSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.review_id !== reviewId) {
    return { ok: false, code: "PARSE_ERROR", message: "Respons server tidak terduga." };
  }
  return { ok: true };
}

export async function cancelReview(reviewId: string): Promise<{ ok: boolean }> {
  try {
    await fetch(`${BASE}/api/v1/reviews/${reviewId}`, { method: "DELETE" });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function downloadExport(reviewId: string): Promise<Blob | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/reviews/${reviewId}/export.docx`);
    if (!res.ok) return null;
    return res.blob();
  } catch {
    return null;
  }
}

export async function getReviewMessages(
  reviewId: string
): Promise<ConversationMessage[]> {
  try {
    const res = await fetch(`${BASE}/api/v1/reviews/${reviewId}/messages`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function sendReviewChat(
  reviewId: string,
  content: string,
  conversationId?: string
): Promise<{ ok: true; data: ConversationMessage } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${BASE}/api/v1/reviews/${reviewId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, conversation_id: conversationId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      return { ok: false, message: err?.error?.message ?? "Gagal mengirim pesan ke asisten AI." };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, message: "Koneksi ke asisten AI terputus." };
  }
}

// ── F5: Stateless export (for history entries whose job has expired) ───────────

export async function exportDocxStateless(opts: {
  parsed?: import("./schemas").ParsedReport | null;
  raw_output?: string | null;
  doc_type: string;
}): Promise<Blob | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/export/docx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    if (!res.ok) return null;
    return res.blob();
  } catch {
    return null;
  }
}
