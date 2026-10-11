/**
 * Sidebar — persistent 280 px left sidebar.
 *
 * Features:
 *  - Logo + "Review Baru" CTA
 *  - History list grouped: Hari ini / 7 hari terakhir / Lebih lama
 *  - Per-item: status dot + title + rename + delete
 *  - "Hapus semua riwayat" with confirmation
 *  - Theme toggle (dark/light)
 *  - Collapse to icon-rail on desktop, drawer on mobile
 *  - Privacy note + toggle in footer
 *
 * No hardcoded colours — all from design tokens.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Clock,
  X,
  Trash2,
  Pencil,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHistoryStore } from "@/lib/history-store";
import { displayHistoryTitle, groupEntriesByDate, type HistoryEntry } from "@/lib/history";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
}

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
  collapsed,
  onCollapsedChange,
}: SidebarProps) {
  const pathname = usePathname();
  const { entries, loaded, load } = useHistoryStore();

  // Load history on mount
  useEffect(() => {
    load();
  }, [load]);

  // Close mobile drawer on route change
  useEffect(() => {
    onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const groups = groupEntriesByDate(entries);

  return (
    <>
      {/* ── Mobile backdrop ─────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          aria-hidden="true"
          onClick={onMobileClose}
        />
      )}

      {/* ── Sidebar panel ───────────────────────────────────────────────────── */}
      <aside
        aria-label="Navigasi aplikasi"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden",
          "border-r border-[rgb(var(--border))] bg-[radial-gradient(circle_at_top_left,rgba(var(--accent-mid),0.12),transparent_25%),radial-gradient(circle_at_bottom_right,rgba(var(--accent-from),0.12),transparent_30%),rgba(var(--surface))]",
          "shadow-[0_20px_45px_rgba(var(--shadow-rgb),0.08)]",
          "transition-[width,transform] duration-200 ease-in-out backdrop-blur-xl",
          collapsed ? "w-[60px]" : "w-[280px]",
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.48),transparent_38%,rgba(var(--accent-to),0.035))]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgb(var(--accent-mid))]/60 to-transparent" />

        <div className="relative z-10 flex h-full flex-col">
          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div
            className={cn(
              "flex h-14 shrink-0 items-center border-b border-[rgb(var(--border))]/80 px-3",
              collapsed ? "justify-center" : "justify-between",
            )}
          >
            {!collapsed && (
              <Link
                href="/"
                className="flex items-center gap-2.5 text-[rgb(var(--fg))] transition-opacity hover:opacity-80"
                aria-label="Telaah — halaman utama"
              >
                <span
                  aria-hidden="true"
                  className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/40 bg-gradient-to-br from-[rgb(var(--accent-mid))] via-[rgb(var(--accent-from))] to-[rgb(var(--accent-to))] font-display text-lg text-white shadow-[0_8px_18px_rgba(var(--accent-mid),0.28)]"
                >
                  t
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-[rgb(var(--surface))] bg-[rgb(var(--accent-to))]" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold tracking-[0.12em] text-[rgb(var(--fg))] uppercase">
                    Telaah
                  </span>
                  <span className="text-[9px] font-medium tracking-[0.16em] text-[rgb(var(--fg-muted))] uppercase">
                    Review Studio
                  </span>
                </span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => onCollapsedChange(!collapsed)}
              aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
              className={cn(
                "hidden md:flex items-center justify-center rounded-md p-1.5",
                "text-[rgb(var(--fg-muted))] hover:bg-[rgb(var(--surface-2))]",
                "hover:text-[rgb(var(--fg))] transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]",
              )}
            >
              {collapsed ? (
                <PanelLeftOpen size={16} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={16} aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={onMobileClose}
              aria-label="Tutup menu"
              className="flex md:hidden items-center justify-center rounded-md p-1.5
                         text-[rgb(var(--fg-muted))] hover:bg-[rgb(var(--surface-2))]
                         hover:text-[rgb(var(--fg))] transition-colors
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {/* ── Body ────────────────────────────────────────────────────────── */}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2.5">
            <Link
              href="/"
              aria-label="Mulai review baru"
              className={cn(
                "group relative isolate flex items-center gap-2.5 overflow-hidden rounded-xl border border-white/30 px-3 py-2.5 text-sm font-medium",
                "bg-gradient-to-r from-[rgb(var(--accent-mid))] via-[rgb(var(--accent-from))] to-[rgb(var(--accent-to))] text-white",
                "shadow-[0_12px_24px_rgba(var(--accent-mid),0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_16px_28px_rgba(var(--accent-mid),0.3)] active:translate-y-px",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]",
                collapsed && "justify-center px-0",
              )}
            >
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/3 z-[-1] w-1/3 -skew-x-12 bg-white/20 transition-transform duration-700 group-hover:translate-x-[420%]" />
              <Plus size={16} aria-hidden="true" className="shrink-0" />
              {!collapsed && <span>Review Baru</span>}
            </Link>

            {!collapsed && (
              <nav aria-label="Riwayat review" className="mt-1 flex flex-col gap-3">
                <div className="flex items-center gap-2 px-2.5 pt-1">
                  <span className="text-[9px] font-semibold tracking-[0.16em] text-[rgb(var(--fg-muted))] uppercase">
                    Ruang kerja
                  </span>
                  <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-[rgb(var(--border))] to-transparent" />
                  <span className="font-mono text-[9px] text-[rgb(var(--fg-muted))]">
                    {String(entries.length).padStart(2, "0")}
                  </span>
                </div>
                {!loaded ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 size={16} className="animate-spin text-[rgb(var(--fg-muted))]" aria-label="Memuat riwayat" />
                  </div>
                ) : groups.length === 0 ? (
                  <EmptyHistory />
                ) : (
                  groups.map((g) => (
                    <HistoryGroup key={g.label} label={g.label} entries={g.entries} currentPath={pathname} />
                  ))
                )}
              </nav>
            )}

            {collapsed && (
              <div className="mt-2 flex justify-center">
                <span
                  aria-hidden="true"
                  className="flex items-center justify-center rounded-xl bg-[rgb(var(--surface-2))] p-2.5 text-[rgb(var(--fg-muted))] shadow-sm ring-1 ring-[rgb(var(--border))]"
                  title="Riwayat"
                >
                  <Clock size={16} />
                </span>
              </div>
            )}
          </div>

          <div
            className={cn(
              "relative z-10 shrink-0 border-t border-[rgb(var(--border))]/90 p-2.5",
              collapsed ? "items-center" : "",
            )}
          >
            {!collapsed && entries.length > 0 && (
              <ClearAllButton currentPath={pathname} />
            )}

            {!collapsed && (
              <button
                type="button"
                title="Riwayat hanya tersimpan di browser ini dan dapat dihapus kapan saja."
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] text-[rgb(var(--fg-muted))] transition-colors hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--fg))]"
              >
                <Info size={11} aria-hidden="true" />
                Riwayat hanya di perangkat ini
              </button>
            )}

          </div>
        </div>
      </aside>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyHistory() {
  return (
    <div
      className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed
                 border-[rgb(var(--border))] px-3 py-5 text-center"
    >
      <Clock size={18} aria-hidden="true" className="text-[rgb(var(--fg-muted))]" />
      <p className="text-xs text-[rgb(var(--fg-muted))]">
        Belum ada riwayat review.
        <br />
        Riwayat disimpan di browser Anda.
      </p>
    </div>
  );
}

function HistoryGroup({
  label,
  entries,
  currentPath,
}: {
  label: string;
  entries: HistoryEntry[];
  currentPath: string;
}) {
  return (
    <div>
      <p className="px-2.5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--fg-muted))]">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {entries.map((e) => (
          <HistoryItem key={e.id} entry={e} isActive={currentPath === `/review/${e.id}`} />
        ))}
      </ul>
    </div>
  );
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  done: <CheckCircle2 size={10} className="text-[rgb(var(--success))]" aria-label="Selesai" />,
  failed: <XCircle size={10} className="text-[rgb(var(--error))]" aria-label="Gagal" />,
  timeout: <XCircle size={10} className="text-[rgb(var(--error))]" aria-label="Waktu habis" />,
  cancelled: <XCircle size={10} className="text-[rgb(var(--fg-muted))]" aria-label="Dibatalkan" />,
  expired: <XCircle size={10} className="text-[rgb(var(--fg-muted))]" aria-label="Kedaluwarsa" />,
  queued: <Loader2 size={10} className="animate-spin text-[rgb(var(--warning))]" aria-label="Menunggu" />,
  running: <Loader2 size={10} className="animate-spin text-[rgb(var(--accent-mid))]" aria-label="Berjalan" />,
  awaiting_approval: <Clock size={10} className="text-[rgb(var(--warning))]" aria-label="Menunggu persetujuan" />,
};

const STATUS_LABELS: Record<string, string> = {
  done: "Selesai", failed: "Gagal", timeout: "Waktu habis",
  cancelled: "Dibatalkan", expired: "Kedaluwarsa",
  queued: "Menunggu", running: "Berjalan", awaiting_approval: "Menunggu persetujuan",
};

function HistoryItem({ entry, isActive }: { entry: HistoryEntry; isActive: boolean }) {
  const router = useRouter();
  const { remove, rename } = useHistoryStore();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(entry.title);
  const title = displayHistoryTitle(entry.title, entry.id);

  async function handleRename() {
    if (editValue.trim() && editValue !== entry.title) {
      await rename(entry.id, editValue.trim());
    }
    setEditing(false);
  }

  async function handleDelete() {
    await remove(entry.id);
    if (isActive) router.replace("/");
  }

  return (
    <li
      className={cn(
        "group relative flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-2",
        "transition-[background-color,color,box-shadow] duration-200",
        isActive
          ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--fg))] shadow-[inset_0_0_0_1px_rgba(var(--accent-mid),0.14),0_4px_12px_rgba(var(--shadow-rgb),0.06)]"
          : "text-[rgb(var(--fg-muted))] hover:bg-[rgb(var(--surface-2))]/80 hover:text-[rgb(var(--fg))]",
      )}
      onClick={() => !editing && router.push(`/review/${entry.id}`)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full transition-colors",
          isActive ? "bg-[rgb(var(--accent-mid))]" : "bg-transparent group-hover:bg-[rgb(var(--border))]",
        )}
      />
      {/* Status indicator — shape + text label, not color alone */}
      <span className="shrink-0 flex items-center">
        {STATUS_ICONS[entry.status] ?? <Clock size={10} />}
      </span>

      {/* Title */}
      {editing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            if (e.key === "Escape") { setEditValue(title); setEditing(false); }
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label="Ubah judul riwayat"
          className="min-w-0 flex-1 rounded bg-[rgb(var(--surface))] px-1 text-xs
                     text-[rgb(var(--fg))] border border-[rgb(var(--border))]
                     focus:outline-none focus-visible:ring-1 focus-visible:ring-[rgb(var(--accent-mid))]"
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-xs"
          title={`${title} — ${STATUS_LABELS[entry.status] ?? entry.status}`}
        >
          {title}
        </span>
      )}

      {/* Actions — visible on group hover */}
      {!editing && (
        <span className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            aria-label="Ubah nama"
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="rounded p-0.5 hover:bg-[rgb(var(--surface))] transition-colors"
          >
            <Pencil size={11} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Hapus riwayat ini"
            onClick={(e) => { e.stopPropagation(); void handleDelete(); }}
            className="rounded p-0.5 hover:bg-[rgb(var(--error))]/15 text-[rgb(var(--error))] transition-colors"
          >
            <Trash2 size={11} aria-hidden="true" />
          </button>
        </span>
      )}
    </li>
  );
}

function ClearAllButton({ currentPath }: { currentPath: string }) {
  const router = useRouter();
  const { clearAll } = useHistoryStore();
  const [confirming, setConfirming] = useState(false);

  async function handleClearAll() {
    await clearAll();
    setConfirming(false);
    if (currentPath.startsWith("/review/")) router.replace("/");
  }

  if (confirming) {
    return (
      <div
        role="alertdialog"
        aria-label="Konfirmasi hapus semua riwayat"
        className="flex flex-col gap-1.5 rounded-lg border border-[rgb(var(--error))]/30
                   bg-[rgb(var(--error))]/10 px-2.5 py-2"
      >
        <p className="text-[10px] text-[rgb(var(--error))]">
          Hapus semua riwayat di perangkat ini?
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => { void handleClearAll(); }}
            className="flex-1 rounded px-2 py-0.5 text-[10px] font-semibold
                       bg-[rgb(var(--error))]/20 text-[rgb(var(--error))]
                       hover:bg-[rgb(var(--error))]/30 transition-colors
                       focus:outline-none focus-visible:ring-1 focus-visible:ring-[rgb(var(--error))]"
          >
            Hapus
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="flex-1 rounded px-2 py-0.5 text-[10px]
                       text-[rgb(var(--fg-muted))] hover:bg-[rgb(var(--surface-2))]
                       transition-colors focus:outline-none
                       focus-visible:ring-1 focus-visible:ring-[rgb(var(--accent-mid))]"
          >
            Batal
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 w-full rounded-lg px-2.5 py-1.5 text-xs
                 text-[rgb(var(--fg-muted))] hover:bg-[rgb(var(--surface-2))]
                 hover:text-[rgb(var(--error))] transition-colors
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-mid))]"
    >
      <Trash2 size={13} aria-hidden="true" />
      Hapus semua riwayat
    </button>
  );
}
