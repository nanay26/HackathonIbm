/**
 * TopBar — thin top bar above the main content area.
 * Shows a hamburger on mobile to open the sidebar drawer.
 */
"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  return (
    <header
      aria-label="Top bar"
      className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3
                 border-b border-[rgb(var(--border))]
                 bg-[rgb(var(--surface))] px-4"
    >
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Buka menu navigasi"
        className="flex md:hidden items-center justify-center rounded-md p-1.5
                   text-[rgb(var(--fg-muted))] hover:bg-[rgb(var(--surface-2))]
                   hover:text-[rgb(var(--fg))] transition-colors
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]"
      >
        <Menu size={18} aria-hidden="true" />
      </button>

      {/* Disclaimer — always visible (SDD §2.2.7) */}
      {!pathname.startsWith("/review/") && (
        <p className="ml-auto text-[11px] text-[rgb(var(--fg-muted))] hidden sm:block">
          Asistensi akademik — tidak menggantikan penilaian dosen pembimbing/penguji resmi.
        </p>
      )}
    </header>
  );
}
