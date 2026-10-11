import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// ── jsdom doesn't implement window.matchMedia ─────────────────────────────────
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ── jsdom doesn't implement HTMLCanvasElement.getContext ──────────────────────
// DebateGraphCanvas falls back to gradient when getContext throws/returns null.
// Suppress the "Not implemented" error by providing a no-op stub.
HTMLCanvasElement.prototype.getContext = () => null;
