"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Composer } from "@/components/composer/Composer";
import { HeroCanvas } from "@/components/hero/HeroCanvas";
import { startReview } from "@/lib/api";
import { buildTitle } from "@/lib/history";
import { useHeroStore } from "@/lib/hero-store";
import { useConversationStore } from "@/lib/conversation-store";
import type { DocType } from "@/components/composer/DocTypeDropdown";

export default function HomePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const setHeroState = useHeroStore((s) => s.setState);
  const setConversationDocument = useConversationStore((s) => s.setDocument);

  // Reset to idle on mount
  useEffect(() => {
    setHeroState("idle");
  }, [setHeroState]);

  async function handleSubmit(
    text: string,
    docType: DocType,
    meta?: { filename?: string; prompt?: string; documentText?: string },
  ) {
    // Prevent accidental short text submissions without documents (e.g. typing chat questions on home page)
    const hasAttachment = Boolean(meta?.documentText || meta?.filename);
    if (!hasAttachment && text.trim().length < 100) {
      setSubmitError(
        "Teks terlalu singkat untuk ditelaah sebagai proposal. Silakan lampirkan file dokumen (PDF/DOCX) atau tempelkan draf naskah proposal Anda (minimal Bab 1 s.d. Bab 3)."
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setHeroState("reviewing");
    // Log only char count — never document content (SDD §2.2.5)
    console.info("[Telaah] Starting review, chars:", text.length);

    const conversationId = crypto.randomUUID();
    if (meta?.documentText) {
      setConversationDocument(conversationId, {
        text: meta.documentText,
        label: meta.filename ?? "Dokumen terlampir",
      });
    }
    const result = await startReview(text, { conversationId });
    if (!result.ok) {
      setSubmitError(result.message);
      setIsSubmitting(false);
      setHeroState("error");
      return;
    }

    // Store metadata for the review page to build a proper history title
    const title = buildTitle({ filename: meta?.filename, pastedText: text });
    try {
      sessionStorage.setItem(
        `dp-review-meta-${result.data.review_id}`,
        JSON.stringify({
          title,
          doc_type: docType,
          conversation_id: conversationId,
          prompt: meta?.prompt ?? "",
        }),
      );
    } catch {
      // sessionStorage may be unavailable
    }

    router.push(`/review/${result.data.review_id}`);
  }

  return (
    <div className="relative flex min-h-[620px] flex-col items-center justify-center px-4 py-10 overflow-hidden">

      {/* ── Hero 3D — ambience layer behind content ──────────────────── */}
      <HeroCanvas className="absolute inset-0 z-0" />

      {/* ── Foreground content ──────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-3xl">

        {/* Header — LCP element, rendered immediately from DOM */}
        <div className="mb-8 text-center">
          <h1 className="font-display text-5xl font-medium text-[rgb(var(--fg))]">
            Telaah
          </h1>
          <p className="mt-2 text-[rgb(var(--fg-muted))]">
            Review dokumen akademik berbasis multi-agent AI.
          </p>
        </div>

        {/* Submit error */}
        {submitError && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-xl border
                       border-[rgb(var(--error))]/40 bg-[rgb(var(--error))]/10
                       px-4 py-3 text-sm text-[rgb(var(--error))]"
          >
            <span className="font-medium">Gagal memulai review:</span>
            <span>{submitError}</span>
          </div>
        )}

        {/* Composer — receives typing state callback */}
        <ComposerWithHero onSubmit={handleSubmit} isSubmitting={isSubmitting} />

        {/* Disclaimer — always visible (SDD §F3 AC-6) */}
        <p
          role="note"
          className="mt-3 text-center text-xs text-[rgb(var(--fg-muted))]"
        >
          Asistensi akademik — tidak menggantikan penilaian dosen pembimbing/penguji resmi.
        </p>
      </div>
    </div>
  );
}

/**
 * ComposerWithHero — thin wrapper yang meneruskan typing state ke hero store.
 * Memisahkan logika hero state dari Composer agar Composer tetap reusable.
 */
interface ComposerWithHeroProps {
  onSubmit: (
    text: string,
    docType: DocType,
    meta?: { filename?: string; prompt?: string; documentText?: string },
  ) => void;
  isSubmitting: boolean;
}

function ComposerWithHero({ onSubmit, isSubmitting }: ComposerWithHeroProps) {
  const setHeroState = useHeroStore((s) => s.setState);

  // Composer meneruskan typing state lewat onTypingChange prop baru
  function handleTypingChange(hasContent: boolean) {
    if (isSubmitting) return;
    setHeroState(hasContent ? "typing" : "idle");
  }

  return (
    <Composer
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      onTypingChange={handleTypingChange}
    />
  );
}
