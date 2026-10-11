/**
 * Vitest tests for frontend F1 components — AC F1 (Fase 2 DoD).
 *
 * Note: UploadForm was replaced by Composer in U2.
 * Tests for the old 2-tab UploadForm have been replaced with
 * equivalent Composer tests covering the same AC F1 criteria.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import * as api from "@/lib/api";
import { CharCounter } from "@/components/CharCounter";
import { TextPreview } from "@/components/TextPreview";
import { MAX_CHARS } from "@/lib/schemas";

// ── CharCounter ────────────────────────────────────────────────────────────────

describe("CharCounter", () => {
  it("uses the project max length contract", () => {
    expect(MAX_CHARS).toBe(500_000);
  });

  it("shows count / max", () => {
    render(<CharCounter count={5000} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/5\.000/)).toBeInTheDocument();
  });

  it("does not show a minimum-length warning", () => {
    render(<CharCounter count={500} />);
    const el = screen.getByRole("status");
    expect(el.className).toMatch(/gray/);
    expect(screen.queryByText(/minimum/i)).not.toBeInTheDocument();
  });

  it("shows red error when count exceeds MAX_CHARS", () => {
    render(<CharCounter count={MAX_CHARS + 1} />);
    const el = screen.getByRole("status");
    expect(el.className).toMatch(/red/);
    expect(screen.getByText(/melebihi batas/i)).toBeInTheDocument();
  });

  it("is neutral (gray) when count is in valid range", () => {
    render(<CharCounter count={100} />);
    const el = screen.getByRole("status");
    expect(el.className).toMatch(/gray/);
    expect(screen.queryByText(/minimum/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/melebihi/i)).not.toBeInTheDocument();
  });

  it("shows no warning when count is 0", () => {
    render(<CharCounter count={0} />);
    expect(screen.queryByText(/minimum/i)).not.toBeInTheDocument();
  });
});

// ── TextPreview ────────────────────────────────────────────────────────────────

describe("TextPreview", () => {
  it("renders textarea with current value", () => {
    render(<TextPreview value="hello world" onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveValue("hello world");
  });

  it("calls onChange when text changes", () => {
    const onChange = vi.fn();
    render(<TextPreview value="" onChange={onChange} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "new text" } });
    expect(onChange).toHaveBeenCalledWith("new text");
  });

  it("shows filename when provided", () => {
    render(<TextPreview value="text" onChange={vi.fn()} filename="doc.pdf" />);
    expect(screen.getByText(/doc\.pdf/)).toBeInTheDocument();
  });

  it("shows warnings when provided", () => {
    render(
      <TextPreview
        value="text"
        onChange={vi.fn()}
        warnings={["Halaman 2 tidak berteks."]}
      />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Halaman 2 tidak berteks/)).toBeInTheDocument();
  });

  it("does not show warning block when warnings is empty", () => {
    render(<TextPreview value="text" onChange={vi.fn()} warnings={[]} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ── Composer — document type selector (AC F1-1) ───────────────────────────────

import { Composer } from "@/components/composer/Composer";

describe("Composer — document type", () => {
  it("shows Proposal Skripsi option", () => {
    render(<Composer onSubmit={vi.fn()} isSubmitting={false} />);
    expect(screen.getByText(/Proposal Skripsi/)).toBeInTheDocument();
  });

  it("shows disabled labels for other doc types in dropdown", () => {
    render(<Composer onSubmit={vi.fn()} isSubmitting={false} />);
    // The DocTypeDropdown trigger has aria-haspopup="listbox"
    const trigger = screen.getByRole("button", { name: /jenis dokumen/i });
    fireEvent.click(trigger);
    const badges = screen.getAllByText(/Segera hadir/);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Composer — submit button state (AC F1-3,4,5) ─────────────────────────────

describe("Composer — submit button", () => {
  it("button is disabled when no text entered", () => {
    render(<Composer onSubmit={vi.fn()} isSubmitting={false} />);
    // When empty, aria-label = reason string (not "Mulai review")
    const btn = screen.getByRole("button", {
      name: /masukkan atau lampirkan dokumen/i,
    });
    expect(btn).toBeDisabled();
  });

  it("button is enabled for short non-empty input", () => {
    render(<Composer onSubmit={vi.fn()} isSubmitting={false} />);
    const textarea = screen.getByLabelText(/tempel proposal/i);
    fireEvent.change(textarea, { target: { value: "short" } });
    expect(screen.getByRole("button", { name: /mulai review/i })).not.toBeDisabled();
  });

  it("button is disabled when text exceeds MAX_CHARS", () => {
    render(<Composer onSubmit={vi.fn()} isSubmitting={false} />);
    const textarea = screen.getByLabelText(/tempel proposal/i);
    fireEvent.change(textarea, { target: { value: "x".repeat(MAX_CHARS + 1) } });
    const btn = screen.getByRole("button", { name: /mulai review|terlalu panjang/i });
    expect(btn).toBeDisabled();
  });

  it("button is enabled when text length is in valid range", () => {
    render(<Composer onSubmit={vi.fn()} isSubmitting={false} />);
    const textarea = screen.getByLabelText(/tempel proposal/i);
    fireEvent.change(textarea, { target: { value: "brief proposal" } });
    const btn = screen.getByRole("button", { name: /mulai review/i });
    expect(btn).not.toBeDisabled();
  });

  it("allows a short non-empty prompt when used for a conversation reply", () => {
    render(<Composer onSubmit={vi.fn()} isSubmitting={false} minChars={0} />);
    fireEvent.change(screen.getByLabelText(/tempel proposal/i), {
      target: { value: "Jelaskan temuan pertama." },
    });
    expect(screen.getByRole("button", { name: /mulai review/i })).not.toBeDisabled();
  });

  it("keeps the reply button disabled when the prompt is empty", () => {
    render(<Composer onSubmit={vi.fn()} isSubmitting={false} minChars={0} />);
    expect(screen.getByRole("button", { name: /masukkan atau lampirkan/i })).toBeDisabled();
  });

  it("requires a prompt when an existing conversation document is attached", () => {
    render(
      <Composer
        onSubmit={vi.fn()}
        isSubmitting={false}
        minChars={0}
        requirePrompt
        initialDocument={{ text: "proposal content", label: "proposal.docx" }}
      />,
    );
    expect(screen.getByRole("button", { name: /tulis pesan untuk melanjutkan/i })).toBeDisabled();
  });

  it("calls onSubmit with text when submitted in valid state", () => {
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} isSubmitting={false} />);
    const textarea = screen.getByLabelText(/tempel proposal/i);
    const validText = "Tinjau latar belakang proposal.";
    fireEvent.change(textarea, { target: { value: validText } });
    const btn = screen.getByRole("button", { name: /mulai review/i });
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledWith(
      validText,
      "proposal_skripsi",
      { prompt: validText },
    );
  });

  it("keeps a typed prompt when a document is uploaded afterward", async () => {
    const onSubmit = vi.fn();
    const documentText = "Isi dokumen proposal.";
    vi.spyOn(api, "extractDocument").mockResolvedValueOnce({
      ok: true,
      data: {
        text: documentText,
        char_count: documentText.length,
        filename: "proposal.docx",
        warnings: [],
      },
    });
    render(<Composer onSubmit={onSubmit} isSubmitting={false} />);

    const prompt = "Fokuskan telaah pada metode penelitian.";
    const textarea = screen.getByLabelText(/tempel proposal/i);
    fireEvent.change(textarea, { target: { value: prompt } });
    fireEvent.change(screen.getByLabelText("Pilih file PDF atau DOCX"), {
      target: { files: [new File(["docx"], "proposal.docx")] },
    });

    await waitFor(() => expect(screen.getByText("proposal.docx")).toBeInTheDocument());
    expect(textarea).toHaveValue(prompt);
    fireEvent.click(screen.getByRole("button", { name: /mulai review/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      `${prompt}\n\nDokumen terlampir (proposal.docx):\n${documentText}`,
      "proposal_skripsi",
      { filename: "proposal.docx", prompt, documentText },
    );
  });

  it("keeps an uploaded document when the user adds a prompt afterward", async () => {
    const onSubmit = vi.fn();
    const documentText = "Isi dokumen proposal.";
    vi.spyOn(api, "extractDocument").mockResolvedValueOnce({
      ok: true,
      data: {
        text: documentText,
        char_count: documentText.length,
        filename: "proposal.docx",
        warnings: [],
      },
    });
    render(<Composer onSubmit={onSubmit} isSubmitting={false} />);

    fireEvent.change(screen.getByLabelText("Pilih file PDF atau DOCX"), {
      target: { files: [new File(["docx"], "proposal.docx")] },
    });
    await waitFor(() => expect(screen.getByText("proposal.docx")).toBeInTheDocument());

    const prompt = "Tolong jelaskan temuan yang paling penting.";
    const textarea = screen.getByLabelText(/tempel proposal/i);
    fireEvent.change(textarea, { target: { value: prompt } });
    expect(screen.getByText("proposal.docx")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /mulai review/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      `${prompt}\n\nDokumen terlampir (proposal.docx):\n${documentText}`,
      "proposal_skripsi",
      { filename: "proposal.docx", prompt, documentText },
    );
  });
});
