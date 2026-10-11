/**
 * Composer — single chatbot-style input that replaces the 2-tab UploadForm.
 *
 * Features (SDD §F1, spec Bagian 4):
 *  - Satu textarea auto-grow (max ~8 baris / 192px).
 *  - Tombol lampir (paperclip), drag-drop ke area halaman, paste file dari clipboard.
 *  - File dilampirkan → POST /documents/extract → DocChip (spinner → centang/error).
 *  - Paste teks >= 2.000 karakter → otomatis jadi chip "Teks tertempel".
 *  - Hanya satu dokumen aktif; lampir baru → konfirmasi inline via ReplaceConfirmBar.
 *  - DocType dropdown kecil di dalam composer.
 *  - Tombol kirim (Arrow) disabled dengan tooltip alasan; Enter = kirim, Shift+Enter = baris baru.
 *  - Error tampil inline sebagai alert di atas composer.
 *  - Semua aturan F1 (validasi magic bytes, NO_TEXT_LAYER, pesan spesifik) berlaku.
 */
"use client";

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type DragEvent,
  type ClipboardEvent,
} from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { Paperclip, ArrowUp, AlertCircle } from "lucide-react";
import { extractDocument } from "@/lib/api";
import { MAX_CHARS, MAX_UPLOAD_MB } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { DocChip, type ChipState } from "./DocChip";
import { DocPreviewDrawer } from "./DocPreviewDrawer";
import { DocTypeDropdown, type DocType } from "./DocTypeDropdown";
import { ReplaceConfirmBar } from "./ReplaceConfirmBar";

// Chars at which pasted text becomes a chip (spec Bagian 4d)
const PASTE_CHIP_THRESHOLD = 2_000;

interface Props {
  onSubmit: (
    text: string,
    docType: DocType,
    meta?: { filename?: string; prompt?: string; documentText?: string },
  ) => void;
  isSubmitting: boolean;
  minChars?: number;
  submitLabel?: string;
  requirePrompt?: boolean;
  allowAttachments?: boolean;
  initialDocument?: { text: string; label: string } | null;
  /** Called when textarea content changes — for hero scene state */
  onTypingChange?: (hasContent: boolean) => void;
}

interface DocAttachment {
  label: string;        // filename or "Teks tertempel"
  text: string;         // full extracted/pasted text
  state: ChipState;
  error?: string;
}

/** Pending file/text waiting for replace confirmation */
interface PendingReplace {
  type: "file" | "text";
  file?: File;
  text?: string;
  label?: string;
}

export function Composer({
  onSubmit,
  isSubmitting,
  minChars = 0,
  submitLabel = "Mulai review",
  requirePrompt = false,
  allowAttachments = true,
  initialDocument,
  onTypingChange,
}: Props) {
  const prefersReducedMotion = useReducedMotion();
  const tiltX = useSpring(useMotionValue(0), { stiffness: 140, damping: 22, mass: 0.6 });
  const tiltY = useSpring(useMotionValue(0), { stiffness: 140, damping: 22, mass: 0.6 });
  const [textareaValue, setTextareaValue] = useState("");
  const [docType, setDocType] = useState<DocType>("proposal_skripsi");
  const [attachment, setAttachment] = useState<DocAttachment | null>(() =>
    initialDocument
      ? {
          ...initialDocument,
          state: "ok",
        }
      : null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const documentText = attachment?.state === "ok" ? attachment.text : "";
  const promptText = textareaValue.trim();
  const activeText = [
    promptText,
    documentText && `Dokumen terlampir (${attachment?.label}):\n${documentText}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const tooLong = promptText.length > MAX_CHARS || documentText.length > MAX_CHARS;
  const tooShort = promptText.length < minChars && !documentText;
  const isExtracting = attachment?.state === "extracting";
  const canSubmit =
    Boolean(promptText || documentText) &&
    (!requirePrompt || Boolean(promptText)) &&
    !tooShort &&
    !tooLong &&
    !isSubmitting &&
    !isExtracting;

  // Submit reason for tooltip
  let submitReason = "";
  if (!promptText && !documentText) submitReason = "Masukkan atau lampirkan dokumen terlebih dahulu.";
  else if (tooShort) submitReason = `Minimal ${minChars.toLocaleString("id-ID")} karakter untuk prompt.`;
  else if (tooLong) submitReason = `Teks terlalu panjang (maks. ${MAX_CHARS.toLocaleString("id-ID")} karakter per bagian).`;
  else if (requirePrompt && !promptText) submitReason = "Tulis pesan untuk melanjutkan percakapan.";
  else if (isExtracting) submitReason = "Tunggu hingga ekstraksi selesai.";
  else if (isSubmitting) submitReason = "Review sedang berjalan.";

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Max ~8 lines ≈ 192px (24px line-height × 8)
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }, [textareaValue]);

  // ── File handling ──────────────────────────────────────────────────────────

  async function processFile(file: File) {
    setInlineError(null);

    // Client-side size check
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setInlineError(`File terlalu besar. Maksimum ${MAX_UPLOAD_MB} MB.`);
      return;
    }

    const label = file.name;
    setAttachment({ label, text: "", state: "extracting" });
    const result = await extractDocument(file);
    if (!result.ok) {
      setAttachment({ label, text: "", state: "error", error: result.message });
      return;
    }
    setAttachment({
      label: result.data.filename || label,
      text: result.data.text,
      state: "ok",
    });
    onTypingChange?.(Boolean(textareaValue.trim() || result.data.text));
    // Show extraction warnings inline
    if (result.data.warnings.length > 0) {
      setInlineError(result.data.warnings.join(" "));
    }
  }

  /**
   * If there is an existing "ok" or "error" attachment, show inline confirm
   * bar instead of window.confirm() (accessibility + CSP compliant).
   */
  const handleFileChosen = useCallback(
    (file: File) => {
      if (attachment?.state === "ok" || attachment?.state === "error") {
        setPendingReplace({ type: "file", file });
      } else {
        void processFile(file);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attachment],
  );

  function handleConfirmReplace() {
    if (!pendingReplace) return;
    const pending = pendingReplace;
    setPendingReplace(null);
    if (pending.type === "file" && pending.file) {
      void processFile(pending.file);
    } else if (pending.type === "text" && pending.text) {
      setAttachment({
        label: pending.label ?? "Teks tertempel",
        text: pending.text,
        state: "ok",
      });
      onTypingChange?.(true);
    }
  }

  function handleCancelReplace() {
    setPendingReplace(null);
    // Reset file input so same file can be reattached later
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileChosen(file);
    // Reset so same file can be reattached
    e.target.value = "";
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (allowAttachments) setDragOver(true);
  }
  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    // Only clear if leaving the outermost drop zone
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
  }
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (!allowAttachments) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFileChosen(file);
  }

  // ── Clipboard paste ────────────────────────────────────────────────────────

  function handleGlobalPaste(e: ClipboardEvent<HTMLDivElement>) {
    if (!allowAttachments) return;
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      handleFileChosen(files[0]);
      return;
    }
    // Text paste is handled by textarea's own onChange
  }

  // ── Textarea paste — long text → chip ─────────────────────────────────────

  function handleTextareaPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!allowAttachments) return;
    const pasted = e.clipboardData.getData("text");
    if (pasted.length >= PASTE_CHIP_THRESHOLD) {
      e.preventDefault();
      const label = "Teks tertempel";
      if (attachment?.state === "ok" || attachment?.state === "error") {
        setPendingReplace({ type: "text", text: pasted, label });
      } else {
        setAttachment({ label, text: pasted, state: "ok" });
        onTypingChange?.(true);
      }
    }
  }

  // ── Keyboard submit ────────────────────────────────────────────────────────

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) handleSubmit();
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  function handleSubmit() {
    if (!canSubmit) return;
    // Pass filename meta so the review page can build a proper history title
    const meta: { filename?: string; prompt?: string; documentText?: string } = {};
    if (attachment?.state === "ok" && attachment.label && !attachment.label.startsWith("Teks tertempel")) {
      meta.filename = attachment.label;
    }
    if (promptText) meta.prompt = promptText;
    if (documentText) meta.documentText = documentText;
    onSubmit(activeText, docType, Object.keys(meta).length > 0 ? meta : undefined);
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSubmit();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (prefersReducedMotion || e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    tiltX.set(((e.clientY - rect.top) / rect.height - 0.5) * -6);
    tiltY.set(((e.clientX - rect.left) / rect.width - 0.5) * 6);
  }

  function resetTilt() {
    tiltX.set(0);
    tiltY.set(0);
  }

  // ── Clear attachment ───────────────────────────────────────────────────────

  function clearAttachment() {
    setAttachment(null);
    setInlineError(null);
    setPendingReplace(null);
    onTypingChange?.(Boolean(textareaValue.trim()));
  }

  // ── Textarea onChange ──────────────────────────────────────────────────────

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setTextareaValue(val);
    onTypingChange?.(Boolean(val.trim() || documentText));
  }

  return (
    <motion.div
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      style={{ rotateX: tiltX, rotateY: tiltY, transformPerspective: 1200 }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handleGlobalPaste}
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-[rgb(var(--border))] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.7),transparent_34%),rgba(var(--surface))]/90 shadow-[0_18px_52px_rgba(var(--shadow-rgb),0.12)] backdrop-blur-xl transition-all duration-150",
        dragOver && "border-[rgb(var(--accent-mid))] bg-[rgb(var(--accent-mid))]/5",
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(var(--accent-mid),0.08),transparent_35%,rgba(var(--accent-from),0.06))]" />

      {dragOver && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[28px] bg-[rgb(var(--accent-mid))]/10 text-sm font-medium text-[rgb(var(--accent-mid))]"
        >
          Lepaskan untuk melampirkan file
        </div>
      )}

      {pendingReplace && (
        <ReplaceConfirmBar
          onConfirm={handleConfirmReplace}
          onCancel={handleCancelReplace}
        />
      )}

      {!pendingReplace && inlineError && (
        <div
          role="alert"
          className="relative z-10 flex items-start gap-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--error))]/10 px-4 py-2.5 text-sm text-[rgb(var(--error))]"
        >
          <AlertCircle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{inlineError}</span>
          <button
            type="button"
            aria-label="Tutup peringatan"
            onClick={() => setInlineError(null)}
            className="ml-auto shrink-0 hover:opacity-70"
          >
            ×
          </button>
        </div>
      )}

      <form onSubmit={handleFormSubmit} className="relative z-10 flex flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--fg-muted))]">
              {requirePrompt ? "Tanya hasil review" : "Prompt"}
            </span>
            {allowAttachments && (
              <DocTypeDropdown value={docType} onChange={setDocType} />
            )}
          </div>

          {allowAttachments && (
            <>
              <button
                type="button"
                aria-label="Lampirkan file PDF atau DOCX"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex items-center justify-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-2.5",
                  "text-[rgb(var(--fg-muted))] hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--fg))] transition-all",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]",
                )}
              >
                <Paperclip size={15} aria-hidden="true" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                onChange={handleFileInput}
                aria-label="Pilih file PDF atau DOCX"
                tabIndex={-1}
              />
            </>
          )}
        </div>

        <div className="px-3 pt-3">
          <label htmlFor="composer-textarea" className="sr-only">
            {requirePrompt
              ? "Tanyakan tentang hasil review"
              : "Tempel proposal skripsi atau lampirkan PDF/DOCX"}
          </label>
          <textarea
            ref={textareaRef}
            id="composer-textarea"
            value={textareaValue}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onPaste={handleTextareaPaste}
            rows={1}
            placeholder={
              requirePrompt
                ? "Tanyakan bagian hasil review yang ingin Anda pahami…"
                : attachment?.state === "ok"
                ? "Tambahkan instruksi atau pertanyaan tentang dokumen ini…"
                : "Ketik prompt atau lampirkan dokumen…"
            }
            disabled={isSubmitting}
            className={cn(
              "w-full resize-none bg-transparent text-base leading-6 text-[rgb(var(--fg))] placeholder:text-[rgb(var(--fg-muted))] focus:outline-none disabled:opacity-50",
            )}
            style={{ minHeight: "52px", maxHeight: "192px" }}
          />
        </div>

        {attachment && (
          <div className="px-3 pt-3">
            <DocChip
              state={attachment.state}
              label={attachment.label}
              errorMessage={attachment.error}
              onPreview={() => setPreviewOpen(true)}
              onClear={clearAttachment}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-3 pb-3 pt-3">
          <div className="relative group">
            <button
              type="submit"
              disabled={!canSubmit}
              aria-label={canSubmit ? submitLabel : submitReason}
              aria-disabled={!canSubmit}
              className={cn(
                "flex items-center justify-center rounded-xl p-2.5",
                "bg-gradient-to-br from-[rgb(var(--accent-mid))] to-[rgb(var(--accent-from))] text-white shadow-[0_12px_26px_rgba(var(--accent-mid),0.35)]",
                "hover:brightness-105 active:translate-y-0.5 transition-all",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {isSubmitting ? (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8z"
                  />
                </svg>
              ) : (
                <ArrowUp size={16} aria-hidden="true" />
              )}
            </button>

            {!canSubmit && submitReason && (
              <div
                aria-hidden="true"
                role="tooltip"
                className="pointer-events-none absolute bottom-full right-0 mb-2 z-20 max-w-[200px] rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--fg-muted))] shadow-lg opacity-0 transition-opacity group-hover:opacity-100"
              >
                {submitReason}
              </div>
            )}
          </div>
        </div>
      </form>

      {attachment?.state === "ok" && (
        <DocPreviewDrawer
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          value={attachment.text}
          onChange={(v) =>
            setAttachment((prev) => (prev ? { ...prev, text: v } : null))
          }
        />
      )}
    </motion.div>
  );
}
