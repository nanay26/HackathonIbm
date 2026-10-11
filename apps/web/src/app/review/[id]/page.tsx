/**
 * Review thread page — gaya percakapan (spec Bagian 5).
 *
 * SDD §F2 AC-2: polling berhenti di status terminal.
 * SDD §F2 AC-3: tampilkan Retry-After pada rate limit.
 * SDD §F2 AC-7: tombol "Batalkan" membatalkan job.
 * SDD §F3: hasil terstruktur via ReviewResults.
 * F5: simpan ke riwayat lokal saat terminal; buka dari riwayat jika server 404/410.
 *
 * Layout:
 *   ThreadLayout
 *     UserBubble  — chip dokumen pengguna
 *     StatusBubble — status running/queued/failed
 *     ResultBubble — hasil kaya setelah done
 */
"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelReview,
  getReviewStatus,
  retryReview,
  submitReviewApproval,
  startReview,
  exportDocxStateless,
  getReviewMessages,
  sendReviewChat,
} from "@/lib/api";
import type { ReviewStatusResponse } from "@/lib/schemas";
import { TERMINAL_STATUSES } from "@/lib/schemas";
import type { ParsedReport } from "@/lib/schemas";
import { ThreadLayout } from "@/components/thread/ThreadLayout";
import { UserBubble } from "@/components/thread/UserBubble";
import { StatusBubble } from "@/components/thread/StatusBubble";
import { ResultBubble } from "@/components/thread/ResultBubble";
import { Composer } from "@/components/composer/Composer";
import type { DocType } from "@/components/composer/DocTypeDropdown";
import { useHistoryStore } from "@/lib/history-store";
import { answerReviewQuestion } from "@/lib/review-chat";
import {
  appendConversationMessage,
  buildTitle,
  displayHistoryTitle,
  getConversationMessages,
  getEntry,
  type ConversationMessage,
} from "@/lib/history";

const POLL_INTERVAL_MS = 3_000;

interface Props {
  params: Promise<{ id: string }>;
}

/** Metadata yang disimpan di sessionStorage oleh page.tsx */
interface ReviewMeta {
  title: string;
  doc_type: string;
  conversation_id?: string;
  prompt?: string;
}

function ConversationTranscript({
  messages,
  excludeAssistantJobId,
}: {
  messages: ConversationMessage[];
  excludeAssistantJobId: string;
}) {
  const visibleMessages = messages.filter(
    (message) => !(message.role === "assistant" && message.job_id === excludeAssistantJobId),
  );
  if (visibleMessages.length === 0) return null;
  return (
    <section aria-label="Riwayat percakapan" className="space-y-3">
      {visibleMessages.map((message) => (
        <div
          key={`${message.job_id}-${message.role}`}
          className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
        >
          <div
            className={
              message.role === "user"
                ? "max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-4 py-3 text-sm text-[rgb(var(--fg))]"
                : "max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm leading-relaxed text-[rgb(var(--fg))] shadow-[var(--shadow-1)]"
            }
          >
            {message.content}
          </div>
        </div>
      ))}
    </section>
  );
}

function readMeta(reviewId: string): ReviewMeta | null {
  try {
    const raw = sessionStorage.getItem(`dp-review-meta-${reviewId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ReviewMeta;
  } catch {
    return null;
  }
}

function clearMeta(reviewId: string) {
  try {
    sessionStorage.removeItem(`dp-review-meta-${reviewId}`);
  } catch {
    // ignore
  }
}

export default function ReviewPage({ params }: Props) {
  const { id: reviewId } = use(params);
  const router = useRouter();
  const [statusData, setStatusData] = useState<ReviewStatusResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [pollGeneration, setPollGeneration] = useState(0);
  const [meta, setMeta] = useState<ReviewMeta | null>(null);
  const [conversationId, setConversationId] = useState(reviewId);
  const [conversationReady, setConversationReady] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [isSubmittingFollowUp, setIsSubmittingFollowUp] = useState(false);
  const [followUpComposerKey, setFollowUpComposerKey] = useState(0);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  // Ketika server job sudah expired, tampilkan dari riwayat lokal
  const [localEntry, setLocalEntry] = useState<{
    result: ParsedReport | null;
    raw_output: string | null;
    status: string;
    title: string;
    doc_type: string;
    created_at: string;
  } | null>(null);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { upsert, patchStatus } = useHistoryStore();

  // Restore bounded, document-free conversation history for this review thread.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const m = readMeta(reviewId);
      const existing = await getEntry(reviewId);
      const currentConversationId =
        m?.conversation_id ?? existing?.conversation_id ?? reviewId;
      if (cancelled) return;

      setConversationId(currentConversationId);
      if (m) {
        setMeta(m);
        clearMeta(reviewId);
      }

      let messages = await getConversationMessages(currentConversationId);
      if (m) {
        messages = await appendConversationMessage(currentConversationId, {
          job_id: reviewId,
          role: "user",
          content: m.prompt?.trim() || "Tinjau dokumen yang saya lampirkan.",
        });
      }

      // Sync persistent messages from backend database if available
      try {
        const serverMsgs = await getReviewMessages(reviewId);
        if (Array.isArray(serverMsgs) && serverMsgs.length > 0) {
          if (serverMsgs.length >= messages.length) {
            messages = serverMsgs;
          }
        }
      } catch {
        // Fallback to local storage if server unreachable
      }

      if (cancelled) return;
      setConversationMessages(messages);
      setConversationReady(true);

      if (!existing) {
        await upsert({
          id: reviewId,
          title: displayHistoryTitle(m?.title ?? "Review", reviewId),
          doc_type: m?.doc_type ?? "proposal_skripsi",
          created_at: new Date().toISOString(),
          status: "running",
          conversation_id: currentConversationId,
        });
      } else if (existing.conversation_id !== currentConversationId) {
        await upsert({ ...existing, conversation_id: currentConversationId });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reviewId, upsert]);

  // Polling
  useEffect(() => {
    let stopped = false;

    async function poll() {
      const result = await getReviewStatus(reviewId);
      if (stopped) return;

      // Server 404/410 → coba dari riwayat lokal
      if (!result.ok) {
        if (result.code === "NOT_FOUND" || result.code === "EXPIRED") {
          const entry = await getEntry(reviewId);
          if (entry && entry.status === "done") {
            setLocalEntry({
              result: entry.result ?? null,
              raw_output: entry.raw_output ?? null,
              status: "done",
              title: displayHistoryTitle(entry.title, reviewId),
              doc_type: entry.doc_type,
              created_at: entry.created_at,
            });
            await patchStatus(reviewId, { status: "expired" });
            return;
          }
          if (entry && (entry.status === "running" || entry.status === "queued")) {
            await patchStatus(reviewId, { status: "expired" });
            setLocalEntry({
              result: null,
              raw_output: null,
              status: "expired",
              title: displayHistoryTitle(entry.title, reviewId),
              doc_type: entry.doc_type,
              created_at: entry.created_at,
            });
            return;
          }
        }
        setFetchError(result.message);
        return;
      }

      setStatusData(result.data);
      setFetchError(null);

      const isTerminal = TERMINAL_STATUSES.includes(result.data.status);

      // Simpan ke riwayat lokal saat terminal
      if (isTerminal) {
        await patchStatus(reviewId, {
          status: result.data.status,
          result: result.data.result ?? null,
          raw_output: result.data.raw_output ?? null,
          error: result.data.error ?? null,
        });
      }
      if (result.data.status === "awaiting_approval") {
        await patchStatus(reviewId, { status: "awaiting_approval" });
      }

      if (!isTerminal) {
        pollingRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();

    return () => {
      stopped = true;
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [reviewId, patchStatus, conversationId, pollGeneration]);

  async function handleCancel() {
    setIsCancelling(true);
    await cancelReview(reviewId);
    setIsCancelling(false);
    const result = await getReviewStatus(reviewId);
    if (result.ok) {
      setStatusData(result.data);
      await patchStatus(reviewId, { status: result.data.status });
    }
  }

  async function handleRefreshStatus() {
    setIsRefreshingStatus(true);
    const result = await getReviewStatus(reviewId);
    if (result.ok) {
      setStatusData(result.data);
      setFetchError(null);
    } else {
      setFetchError(result.message);
    }
    setIsRefreshingStatus(false);
  }

  async function handleRetry(text?: string) {
    if (isRetrying) return;
    setIsRetrying(true);
    setRetryError(null);
    const result = await retryReview(reviewId, text);
    if (!result.ok) {
      setRetryError(result.message);
      const latest = await getReviewStatus(reviewId);
      if (latest.ok) setStatusData(latest.data);
      setIsRetrying(false);
      return;
    }

    await patchStatus(reviewId, {
      status: "queued",
      result: null,
      raw_output: null,
      error: null,
    });
    setStatusData({
      status: "queued",
      elapsed_seconds: 0,
      retry_available: false,
    });
    setFetchError(null);
    setPollGeneration((generation) => generation + 1);
    setIsRetrying(false);
  }

  async function handleApproval(actionId: string) {
    if (isSubmittingApproval) return;
    setIsSubmittingApproval(true);
    const result = await submitReviewApproval(reviewId, actionId);
    if (!result.ok) {
      setRetryError(result.message);
      setIsSubmittingApproval(false);
      return;
    }

    await patchStatus(reviewId, { status: "queued", error: null });
    setStatusData((current) =>
      current
        ? { ...current, status: "queued", approval: null }
        : current,
    );
    setRetryError(null);
    setPollGeneration((generation) => generation + 1);
    setIsSubmittingApproval(false);
  }

  async function handleStartFreshReview(
    text: string,
    docType: DocType,
    submittedMeta?: { filename?: string; prompt?: string; documentText?: string },
  ) {
    setIsRetrying(true);
    setRetryError(null);
    const newConversationId = crypto.randomUUID();
    const result = await startReview(text, { conversationId: newConversationId });
    if (!result.ok) {
      setRetryError(result.message);
      setIsRetrying(false);
      return;
    }

    try {
      sessionStorage.setItem(
        `dp-review-meta-${result.data.review_id}`,
        JSON.stringify({
          title: buildTitle({ filename: submittedMeta?.filename, pastedText: text }),
          doc_type: docType,
          conversation_id: newConversationId,
          prompt: submittedMeta?.prompt ?? "",
        }),
      );
    } catch {
      // The review can continue if session metadata storage is unavailable.
    }
    router.push(`/review/${result.data.review_id}`);
  }

  // Unduh dari riwayat (stateless endpoint) untuk entri expired
  async function handleHistoryDownload() {
    if (!localEntry) return;
    const blob = await exportDocxStateless({
      parsed: localEntry.result,
      raw_output: localEntry.raw_output,
      doc_type: localEntry.doc_type ?? "proposal_skripsi",
    });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
    a.href = url;
    a.download = `Telaah-Review-${ts}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleFollowUp(text: string) {
    if (!text.trim() || isSubmittingFollowUp) return;
    setIsSubmittingFollowUp(true);
    setFollowUpError(null);
    try {
      const turnId = crypto.randomUUID();
      let messages = await appendConversationMessage(conversationId, {
        job_id: turnId,
        role: "user",
        content: text.trim().slice(0, 10_000),
      });
      setConversationMessages(messages);

      // Invoke backend AI chat agent with full context & history
      let answer = "";
      const chatRes = await sendReviewChat(reviewId, text.trim(), conversationId);
      if (chatRes.ok && chatRes.data?.content) {
        answer = chatRes.data.content;
      } else {
        // Fallback to local heuristic answer generator
        answer = answerReviewQuestion(
          text,
          statusData?.result ?? localEntry?.result,
          statusData?.raw_output ?? localEntry?.raw_output,
          messages,
        );
      }

      messages = await appendConversationMessage(conversationId, {
        job_id: turnId,
        role: "assistant",
        content: answer,
      });
      setConversationMessages(messages);
      setFollowUpComposerKey((key) => key + 1);
    } catch {
      setFollowUpError("Pesan tidak dapat dikirim. Silakan coba lagi.");
    } finally {
      setIsSubmittingFollowUp(false);
    }
  }

  // Resolved display title & doc_type (dari meta atau status data atau fallback)
  const displayTitle = displayHistoryTitle(meta?.title ?? localEntry?.title ?? "Review", reviewId);
  const displayDocType = meta?.doc_type ?? localEntry?.doc_type ?? "proposal_skripsi";
  const followUpComposer = conversationReady && (
    <div className="space-y-2">
      {(statusData?.status === "failed" || statusData?.status === "timeout") && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgb(var(--warning))]/30 bg-[rgb(var(--warning))]/10 px-4 py-2.5 text-xs text-[rgb(var(--warning))]">
          <span>Proses telaah mengalami kendala. Anda dapat menanyakan ke AI atau menjalankan ulang review.</span>
          <button
            type="button"
            onClick={() => handleRetry()}
            disabled={isRetrying}
            className="rounded-lg bg-[rgb(var(--accent-mid))] px-3 py-1 font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {isRetrying ? "Memulai ulang…" : "Coba Ulang Review"}
          </button>
        </div>
      )}
      {followUpError && (
        <p role="alert" className="rounded-lg border border-[rgb(var(--error))]/30 bg-[rgb(var(--error))]/10 px-3 py-2 text-sm text-[rgb(var(--error))]">
          {followUpError}
        </p>
      )}
      <Composer
        key={followUpComposerKey}
        onSubmit={handleFollowUp}
        isSubmitting={isSubmittingFollowUp}
        minChars={0}
        requirePrompt
        allowAttachments={false}
        submitLabel="Kirim"
      />
    </div>
  );

  // ── Render: entri lokal / expired ──────────────────────────────────────────
  if (localEntry) {
    if (localEntry.status === "expired" && !localEntry.result && !localEntry.raw_output) {
      return (
        <ThreadLayout>
          <UserBubble
            title={displayTitle}
            docType={displayDocType}
            createdAt={localEntry.created_at}
          />
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center
                         rounded-md bg-[rgb(var(--accent-mid))] text-white font-display text-base"
            >
              t
            </span>
            <div className="rounded-2xl rounded-tl-md border border-[rgb(var(--warning))]/40
                            bg-[rgb(var(--warning))]/10 px-4 py-3 text-sm
                            text-[rgb(var(--warning))] max-w-[85%]" role="alert">
              <strong>Kedaluwarsa:</strong> Sesi review ini sudah tidak tersedia di server
              (TTL 30 menit). Tidak ada data tersimpan secara lokal.
            </div>
          </div>
        </ThreadLayout>
      );
    }

    return (
      <ThreadLayout composer={conversationReady ? followUpComposer : undefined}>
        <UserBubble
          title={displayTitle}
          docType={displayDocType}
          createdAt={localEntry.created_at}
        />
        {/* Banner: dari riwayat lokal */}
        <div className="pl-11">
          <div role="note" className="rounded-lg border border-[rgb(var(--border))]
                                       bg-[rgb(var(--surface))] px-4 py-2.5 text-xs
                                       text-[rgb(var(--fg-muted))]">
            Hasil dari riwayat lokal — sesi server sudah berakhir.
          </div>
        </div>
        <ResultBubble
          result={localEntry.result}
          rawOutput={localEntry.raw_output}
          onStatelessDownload={handleHistoryDownload}
        />
        <ConversationTranscript
          messages={conversationMessages}
          excludeAssistantJobId={reviewId}
        />
      </ThreadLayout>
    );
  }

  // ── Render: fetch error ─────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <ThreadLayout
        composer={
          conversationReady ? (
            <div className="space-y-2">
              {retryError && <p role="alert" className="text-sm text-[rgb(var(--error))]">{retryError}</p>}
              <Composer
                onSubmit={handleStartFreshReview}
                isSubmitting={isRetrying}
                minChars={0}
                requirePrompt
                submitLabel="Mulai review di ruang baru"
              />
            </div>
          ) : undefined
        }
      >
        <UserBubble title={displayTitle} docType={displayDocType} />
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center
                       rounded-md bg-[rgb(var(--accent-mid))] text-white font-display text-base"
          >
            t
          </span>
          <div
            role="alert"
            className="rounded-2xl rounded-tl-md border border-[rgb(var(--error))]/40
                       bg-[rgb(var(--error))]/10 px-4 py-3 text-sm
                       text-[rgb(var(--error))] max-w-[85%]"
          >
            {fetchError}
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefreshStatus}
          disabled={isRefreshingStatus}
          className="ml-11 self-start rounded-lg border border-[rgb(var(--border))]
                     bg-[rgb(var(--surface))] px-3 py-2 text-sm font-medium
                     text-[rgb(var(--fg))] hover:bg-[rgb(var(--surface-2))]
                     disabled:opacity-50"
        >
          {isRefreshingStatus ? "Memeriksa status…" : "Periksa lagi"}
        </button>
      </ThreadLayout>
    );
  }

  // ── Render: loading awal (belum ada statusData) ────────────────────────────
  if (!statusData) {
    return (
      <ThreadLayout>
        <UserBubble title={displayTitle} docType={displayDocType} />
        <p role="status" className="pl-11 text-sm text-[rgb(var(--fg-muted))]">
          Menghubungi server…
        </p>
      </ThreadLayout>
    );
  }

  const isTerminal = TERMINAL_STATUSES.includes(statusData.status);

  return (
    <ThreadLayout
      composer={conversationReady ? followUpComposer : undefined}
    >
      {/* Pesan pengguna */}
      <UserBubble
        title={displayTitle}
        docType={displayDocType}
      />

      {/* Status running / queued / terminal non-done */}
      {(!isTerminal || statusData.status !== "done") && (
        <StatusBubble
          status={statusData.status}
          elapsedSeconds={statusData.elapsed_seconds}
          error={statusData.error ?? null}
          onCancel={handleCancel}
          isCancelling={isCancelling}
          onRetry={handleRetry}
          isRetrying={isRetrying}
          retryError={retryError}
          retryAvailable={statusData.retry_available ?? false}
          activeReviewer={statusData.active_reviewer ?? null}
          completedReviewers={statusData.completed_reviewers ?? []}
          approval={statusData.approval ?? null}
          onApproval={handleApproval}
          isSubmittingApproval={isSubmittingApproval}
        />
      )}

      {/* Hasil kaya setelah done */}
      {isTerminal && statusData.status === "done" && (
        <ResultBubble
          result={statusData.result ?? null}
          rawOutput={statusData.raw_output ?? null}
          reviewId={reviewId}
        />
      )}
      {isTerminal &&
        (statusData.status === "failed" || statusData.status === "timeout") &&
        statusData.raw_output && (
          <ResultBubble result={null} rawOutput={statusData.raw_output} />
        )}
      <ConversationTranscript
        messages={conversationMessages}
        excludeAssistantJobId={reviewId}
      />

    </ThreadLayout>
  );
}
