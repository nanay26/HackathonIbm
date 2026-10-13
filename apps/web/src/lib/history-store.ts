/**
 * history-store.ts — Zustand store wrapping the IndexedDB history layer.
 *
 * Responsible for:
 *  - Loading all entries on first access
 *  - Providing reactive state to Sidebar and review pages
 *  - Exposing CRUD actions
 *
 * All IndexedDB calls are async; the store handles loading state.
 */

import { create } from "zustand";
import {
  getAllEntries,
  saveEntry,
  deleteEntry,
  renameEntry as renameEntryDB,
  clearAllHistory,
  updateEntryStatus,
  appendConversationMessage as appendConversationMessageDB,
  type ConversationMessage,
  type HistoryEntry,
  type HistoryStatus,
} from "./history";
import type { ParsedReport } from "./schemas";

interface HistoryState {
  entries: HistoryEntry[];
  loaded: boolean;
  /** Load all entries from IndexedDB (idempotent after first call) */
  load: () => Promise<void>;
  /** Add or overwrite an entry */
  upsert: (entry: HistoryEntry) => Promise<void>;
  /** Patch status + optional result/error on an existing entry */
  patchStatus: (
    id: string,
    patch: {
      status: HistoryStatus;
      result?: ParsedReport | null;
      raw_output?: string | null;
      error?: { code: string; message: string } | null;
    },
  ) => Promise<void>;
  appendConversationMessage: (
    conversationId: string,
    message: ConversationMessage,
  ) => Promise<ConversationMessage[]>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const entries = await getAllEntries();
    set({ entries, loaded: true });
  },

  upsert: async (entry) => {
    await saveEntry(entry);
    set((s) => {
      const without = s.entries.filter((e) => e.id !== entry.id);
      return {
        entries: [entry, ...without].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      };
    });
  },

  patchStatus: async (id, patch) => {
    await updateEntryStatus(id, patch);
    set((s) => ({
      entries: s.entries.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    }));
  },

  appendConversationMessage: async (conversationId, message) => {
    return appendConversationMessageDB(conversationId, message);
  },

  remove: async (id) => {
    await deleteEntry(id);
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
  },

  rename: async (id, title) => {
    await renameEntryDB(id, title);
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, title } : e)),
    }));
  },

  clearAll: async () => {
    await clearAllHistory();
    set({ entries: [] });
  },
}));
