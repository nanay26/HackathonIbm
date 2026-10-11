import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusBubble } from "@/components/thread/StatusBubble";

const defaultProps = {
  status: "timeout" as const,
  elapsedSeconds: 360,
  error: { code: "LANGFLOW_TIMEOUT", message: "Review melewati batas waktu." },
  onCancel: vi.fn(),
  isCancelling: false,
};

describe("StatusBubble retry", () => {
  it("retries the current room when retry input is available", () => {
    const onRetry = vi.fn();
    render(
      <StatusBubble
        {...defaultProps}
        onRetry={onRetry}
        retryAvailable
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /coba lagi di ruang ini/i }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith();
  });

  it("explains when retry input is no longer available", () => {
    render(<StatusBubble {...defaultProps} retryAvailable={false} />);

    expect(
      screen.getByText(/teks dokumen untuk mencoba lagi sudah tidak tersedia/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /coba lagi/i })).not.toBeInTheDocument();
  });

  it("disables retry while a retry is being submitted", () => {
    render(
      <StatusBubble
        {...defaultProps}
        onRetry={vi.fn()}
        isRetrying
        retryAvailable
      />,
    );

    expect(screen.getByRole("button", { name: /coba lagi di ruang ini/i })).toBeDisabled();
    expect(screen.getByText(/mencoba lagi/i)).toBeInTheDocument();
  });
});

describe("StatusBubble reviewer progress", () => {
  it("shows each reviewer in sequential progress order", () => {
    render(
      <StatusBubble
        status="running"
        elapsedSeconds={5}
        onCancel={vi.fn()}
        isCancelling={false}
        activeReviewer="ORISINALITAS"
        completedReviewers={["METODOLOGI"]}
      />,
    );

    expect(screen.getByText("Metodologi")).toBeInTheDocument();
    expect(screen.getByText("Orisinalitas")).toBeInTheDocument();
    expect(screen.getByText("Revisi")).toBeInTheDocument();
    expect(screen.getByText("Selesai")).toBeInTheDocument();
    expect(screen.getByText("Berjalan")).toBeInTheDocument();
    expect(screen.getByText("Antrean")).toBeInTheDocument();
  });
});
