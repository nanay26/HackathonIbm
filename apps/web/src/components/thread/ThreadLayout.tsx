/**
 * ThreadLayout — shell percakapan untuk halaman /review/[id].
 *
 * Menyusun UserBubble + StatusBubble/ResultBubble dalam urutan kronologis,
 * dengan scroll otomatis ke bawah saat konten baru muncul.
 */
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
  composer?: ReactNode;
}

export function ThreadLayout({ children, className, composer }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-scroll ke bawah saat pesan baru muncul
  useEffect(() => {
    if (composer && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  });

  if (composer) {
    return (
      <div className="flex h-[calc(100dvh-3rem)] min-h-0 flex-col">
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={cn("mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8", className)}
            aria-label="Thread review"
          >
            {children}
            <div ref={bottomRef} aria-hidden="true" />
          </div>
        </div>
        <div className="z-10 shrink-0 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95 px-3 py-3 shadow-[0_-8px_24px_rgba(var(--shadow-rgb),0.08)] backdrop-blur-xl">
          <div className="mx-auto w-full max-w-3xl">{composer}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-2xl px-4 py-8",
        "flex flex-col gap-5",
        className,
      )}
      aria-label="Thread review"
    >
      {children}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
