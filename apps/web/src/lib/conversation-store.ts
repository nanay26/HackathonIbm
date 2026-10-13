import { create } from "zustand";

interface ConversationDocument {
  text: string;
  label: string;
}

interface ConversationState {
  documents: Record<string, ConversationDocument>;
  setDocument: (conversationId: string, document: ConversationDocument | null) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  documents: {},
  setDocument: (conversationId, document) =>
    set((state) => {
      const documents = { ...state.documents };
      if (document) documents[conversationId] = document;
      else delete documents[conversationId];
      return { documents };
    }),
}));