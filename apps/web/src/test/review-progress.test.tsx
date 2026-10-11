/**
 * Vitest tests for ReviewProgress component (Fase 3 DoD — AC F2).
 */
import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReviewProgress } from "@/components/ReviewProgress";
import type { JobStatus } from "@/lib/schemas";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ReviewProgress", () => {
  const defaultProps = {
    status: "running" as JobStatus,
    elapsedSeconds: 10,
    error: null,
    onCancel: vi.fn(),
    isCancelling: false,
  };

  it("renders status label for running", () => {
    render(<ReviewProgress {...defaultProps} />);
    expect(screen.getByText(/Sedang memproses/i)).toBeInTheDocument();
  });

  it("shows the configured maximum duration while non-terminal", () => {
    render(<ReviewProgress {...defaultProps} />);
    expect(screen.getByText(/hingga 6 menit/i)).toBeInTheDocument();
  });

  it("shows Batalkan button while non-terminal", () => {
    render(<ReviewProgress {...defaultProps} />);
    expect(screen.getByRole("button", { name: /batalkan/i })).toBeInTheDocument();
  });

  it("calls onCancel when Batalkan is clicked", () => {
    const onCancel = vi.fn();
    render(<ReviewProgress {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /batalkan/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("hides Batalkan button when status is done", () => {
    render(<ReviewProgress {...defaultProps} status="done" />);
    expect(screen.queryByRole("button", { name: /batalkan/i })).not.toBeInTheDocument();
  });

  it("shows error message for failed status", () => {
    render(
      <ReviewProgress
        {...defaultProps}
        status="failed"
        error={{ code: "LANGFLOW_UNAVAILABLE", message: "Tidak dapat dihubungi." }}
      />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Tidak dapat dihubungi/i)).toBeInTheDocument();
  });

  it("does NOT show fake percentage or progress bar", () => {
    const { container } = render(<ReviewProgress {...defaultProps} />);
    // No progressbar role
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    // No percentage text
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  it("timer increments every second while running", () => {
    render(<ReviewProgress {...defaultProps} elapsedSeconds={5} />);
    // Initially shows 5s
    expect(screen.getByText(/5d/)).toBeInTheDocument();
    // After 3 ticks
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText(/8d/)).toBeInTheDocument();
  });

  it("timer stops ticking after terminal status", () => {
    const { rerender } = render(<ReviewProgress {...defaultProps} elapsedSeconds={5} />);
    rerender(<ReviewProgress {...defaultProps} status="done" elapsedSeconds={30} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Should still show 30 (not 35)
    expect(screen.getByText(/30d/)).toBeInTheDocument();
  });

  it("shows status label for queued", () => {
    render(<ReviewProgress {...defaultProps} status="queued" />);
    expect(screen.getByText(/Menunggu giliran/i)).toBeInTheDocument();
  });

  it("shows correct label for timeout", () => {
    render(<ReviewProgress {...defaultProps} status="timeout" />);
    expect(screen.getByText(/Waktu habis/i)).toBeInTheDocument();
  });
});
