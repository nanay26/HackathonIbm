/**
 * Smoke test for the home page — verifies rendering with router mock.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import HomePage from "@/app/page";

// Mock Next.js router (useRouter requires App Router context unavailable in jsdom)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("HomePage (scaffold)", () => {
  it("renders the app heading", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: /telaah/i })).toBeInTheDocument();
  });

  it("renders the disclaimer text", () => {
    render(<HomePage />);
    expect(screen.getByText(/asistensi akademik/i)).toBeInTheDocument();
  });
});
