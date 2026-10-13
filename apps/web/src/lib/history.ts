/**
 * history.ts — IndexedDB-backed local review history.
 *
 * Uses idb-keyval for a simple key-value store.
 * Keys: review_id (string)
 * Values: HistoryEntry
 *
 * Privacy: raw document text is never stored in browser history. The API keeps
 * it in memory for active reviews and up to 30 minutes after failure for retry.
 */

import { get, set, del, keys } from "idb-keyval";
import type { ParsedReport } from "./schemas";

// ── Types ─────────────────────────────────────────────────────────────────────

export type HistoryStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "done"
  | "failed"
  | "timeout"
  | "cancelled"
  | "expired"; // server TTL passed but we still have local result

export interface HistoryEntry {
  id: string;             // review_id
  conversation_id?: string;
  title: string;          // filename or first 50 chars of pasted text
  doc_type: string;
  created_at: string;     // ISO string
  status: HistoryStatus;
  /** Parsed result — present when status=done and parse succeeded */
  result?: ParsedReport | null;
  /** Raw output — present when status=done */
  raw_output?: string | null;
  /** Error detail — present when status=failed/timeout */
  error?: { code: string; message: string } | null;
}

export interface ConversationMessage {
  job_id: string;
  role: "user" | "assistant";
  content: string;
}

const IDB_PREFIX = "dp-history-";
const CONVERSATION_PREFIX = "dp-conversation-";

function toKey(id: string): string {
  return `${IDB_PREFIX}${id}`;
}

function toConversationKey(id: string): string {
  return `${CONVERSATION_PREFIX}${id}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function saveEntry(entry: HistoryEntry): Promise<void> {
  await set(toKey(entry.id), entry);
}

export async function getEntry(id: string): Promise<HistoryEntry | undefined> {
  return get<HistoryEntry>(toKey(id));
}

export async function deleteEntry(id: string): Promise<void> {
  const entry = await getEntry(id);
  await del(toKey(id));
  if (entry?.conversation_id) {
    const remaining = await getAllEntries();
    if (!remaining.some((item) => item.conversation_id === entry.conversation_id)) {
      await del(toConversationKey(entry.conversation_id));
    }
  }
}

export async function getAllEntries(): Promise<HistoryEntry[]> {
  const allKeys = await keys<string>();
  const dpKeys = allKeys.filter((k) => k.startsWith(IDB_PREFIX));
  const entries = await Promise.all(dpKeys.map((k) => get<HistoryEntry>(k)));
  return (entries.filter(Boolean) as HistoryEntry[]).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export async function updateEntryStatus(
  id: string,
  patch: Partial<Omit<HistoryEntry, "id" | "title" | "doc_type" | "created_at">>,
): Promise<void> {
  const existing = await getEntry(id);
  if (!existing) return;
  await saveEntry({ ...existing, ...patch });
}

export async function clearAllHistory(): Promise<void> {
  const allKeys = await keys<string>();
  const dpKeys = allKeys.filter(
    (k) => k.startsWith(IDB_PREFIX) || k.startsWith(CONVERSATION_PREFIX),
  );
  await Promise.all(dpKeys.map((k) => del(k)));
}

export async function getConversationMessages(
  conversationId: string,
): Promise<ConversationMessage[]> {
  return (await get<ConversationMessage[]>(toConversationKey(conversationId))) ?? [];
}

export async function appendConversationMessage(
  conversationId: string,
  message: ConversationMessage,
): Promise<ConversationMessage[]> {
  const current = await getConversationMessages(conversationId);
  if (!current.some((item) => item.job_id === message.job_id && item.role === message.role)) {
    current.push(message);
  }
  const bounded = current.slice(-12);
  await set(toConversationKey(conversationId), bounded);
  return bounded;
}

/** Rename/update title of an entry */
export async function renameEntry(id: string, title: string): Promise<void> {
  const existing = await getEntry(id);
  if (!existing) return;
  await saveEntry({ ...existing, title });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a display title from a filename or pasted text */
export function buildTitle(opts: {
  filename?: string;
  pastedText?: string;
}): string {
  if (opts.filename) return opts.filename;
  if (opts.pastedText) {
    const trimmed = opts.pastedText.trim().slice(0, 50);
    return trimmed.length < opts.pastedText.trim().length
      ? `${trimmed}…`
      : trimmed;
  }
  return "Review";
}

export function displayHistoryTitle(title: string, id: string): string {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(title);
  return !title || title === id || isUuid ? "Review" : title;
}

// ── Group by recency ──────────────────────────────────────────────────────────

export type HistoryGroup = {
  label: "Hari ini" | "7 hari terakhir" | "Lebih lama";
  entries: HistoryEntry[];
};

export function groupEntriesByDate(entries: HistoryEntry[]): HistoryGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);

  const today: HistoryEntry[] = [];
  const week: HistoryEntry[] = [];
  const older: HistoryEntry[] = [];

  for (const e of entries) {
    const d = new Date(e.created_at);
    if (d >= startOfToday) today.push(e);
    else if (d >= sevenDaysAgo) week.push(e);
    else older.push(e);
  }

  const groups: HistoryGroup[] = [];
  if (today.length) groups.push({ label: "Hari ini", entries: today });
  if (week.length) groups.push({ label: "7 hari terakhir", entries: week });
  if (older.length) groups.push({ label: "Lebih lama", entries: older });
  return groups;
}
