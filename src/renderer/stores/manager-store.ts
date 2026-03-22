import { create } from "zustand";

export interface ManagerMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown>; result: string }>;
  timestamp: string;
}

export interface ManagerConversation {
  id: string;
  title: string;
  messages: ManagerMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ContextItem {
  id: string;
  label: string;
  type: "agent" | "metric" | "ticket" | "custom";
  data?: Record<string, unknown>;
}

interface ManagerStore {
  isOpen: boolean;
  isPinned: boolean;
  isHistoryOpen: boolean;
  isStreaming: boolean;
  streamingText: string;

  conversations: ManagerConversation[];
  activeConversationId: string | null;
  messages: ManagerMessage[];

  contextItems: ContextItem[];

  // Actions
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setPinned: (pinned: boolean) => void;
  togglePinned: () => void;
  setHistoryOpen: (open: boolean) => void;
  toggleHistory: () => void;

  setConversations: (convos: ManagerConversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  setMessages: (messages: ManagerMessage[]) => void;
  addMessage: (message: ManagerMessage) => void;

  setStreaming: (streaming: boolean) => void;
  appendStreamingText: (text: string) => void;
  clearStreamingText: () => void;

  addContext: (item: ContextItem) => void;
  removeContext: (id: string) => void;
  clearContext: () => void;
}

export const useManagerStore = create<ManagerStore>((set) => ({
  isOpen: false,
  isPinned: false,
  isHistoryOpen: false,
  isStreaming: false,
  streamingText: "",

  conversations: [],
  activeConversationId: null,
  messages: [],

  contextItems: [],

  setOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setPinned: (pinned) => set({ isPinned: pinned }),
  togglePinned: () => set((s) => ({ isPinned: !s.isPinned })),
  setHistoryOpen: (open) => set({ isHistoryOpen: open }),
  toggleHistory: () => set((s) => ({ isHistoryOpen: !s.isHistoryOpen })),

  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),

  setStreaming: (streaming) => set({ isStreaming: streaming }),
  appendStreamingText: (text) =>
    set((s) => ({ streamingText: s.streamingText + text })),
  clearStreamingText: () => set({ streamingText: "" }),

  addContext: (item) =>
    set((s) => {
      if (s.contextItems.some((c) => c.id === item.id)) return s;
      return { contextItems: [...s.contextItems, item] };
    }),
  removeContext: (id) =>
    set((s) => ({ contextItems: s.contextItems.filter((c) => c.id !== id) })),
  clearContext: () => set({ contextItems: [] }),
}));
