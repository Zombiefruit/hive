import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
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
  syncFromMain: (state: StoreState) => void;
  appendMessage: (agentId: string, message: Message) => void;
  setApproval: (approval: Approval) => void;
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

const EMPTY_ARRAY: never[] = [];

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

/** Hook: get pending approvals (shallow compared to prevent infinite loops). */
export function usePendingApprovals() {
  return useAgentStore(
    useShallow((state) => state.approvals.filter((a) => a.status === "pending"))
  );
}

/** Hook: get messages for an agent. */
export function useAgentMessages(agentId: string) {
  return useAgentStore((state) => state.messages[agentId] ?? EMPTY_ARRAY) as Message[];
}

/** Hook: get context refs for an agent. */
export function useAgentContextRefs(agentId: string) {
  return useAgentStore((state) => state.contextRefs[agentId] ?? EMPTY_ARRAY) as ContextRef[];
}
