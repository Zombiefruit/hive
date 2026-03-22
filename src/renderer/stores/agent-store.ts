import { create } from "zustand";
import type {
  Agent,
  AgentEvent,
  Approval,
  ContextRef,
  FleetMetrics,
  Message,
  StoreState,
} from "../../shared/types";

interface AgentStore extends StoreState {
  /** Replace the full store state (called on IPC sync from main). */
  syncFromMain: (state: StoreState) => void;

  /** Append a streaming message for an agent. */
  appendMessage: (agentId: string, message: Message) => void;

  /** Add or update a pending approval. */
  setApproval: (approval: Approval) => void;

  /** Remove a resolved approval. */
  removeApproval: (approvalId: string) => void;
}

const emptyMetrics: FleetMetrics = {
  active: 0,
  idle: 0,
  errored: 0,
  completed: 0,
  totalTokens: 0,
  totalCostUsd: 0,
};

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  messages: {},
  approvals: [],
  contextRefs: {},
  events: [],
  metrics: emptyMetrics,

  syncFromMain: (state) =>
    set({
      agents: state.agents,
      messages: state.messages,
      approvals: state.approvals,
      contextRefs: state.contextRefs,
      events: state.events,
      metrics: state.metrics,
    }),

  appendMessage: (agentId, message) =>
    set((prev) => ({
      messages: {
        ...prev.messages,
        [agentId]: [...(prev.messages[agentId] ?? []), message],
      },
    })),

  setApproval: (approval) =>
    set((prev) => {
      const existing = prev.approvals.findIndex((a) => a.id === approval.id);
      if (existing >= 0) {
        const updated = [...prev.approvals];
        updated[existing] = approval;
        return { approvals: updated };
      }
      return { approvals: [...prev.approvals, approval] };
    }),

  removeApproval: (approvalId) =>
    set((prev) => ({
      approvals: prev.approvals.filter((a) => a.id !== approvalId),
    })),
}));

/** Hook: get pending approvals. */
export function usePendingApprovals() {
  return useAgentStore((state) => state.approvals.filter((a) => a.status === "pending"));
}

/** Hook: get messages for an agent. */
export function useAgentMessages(agentId: string) {
  return useAgentStore((state) => state.messages[agentId] ?? []);
}

/** Hook: get context refs for an agent. */
export function useAgentContextRefs(agentId: string) {
  return useAgentStore((state) => state.contextRefs[agentId] ?? []);
}
