/** Shared types used across main, preload, and renderer processes. */

export type AgentStatus = "active" | "idle" | "errored" | "completed";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "auto_denied";
export type RiskLevel = "low" | "medium" | "high";
export type ContextRefType = "linear" | "slack" | "notion" | "github";
export type AgentSource = "deck" | "external";

export interface Agent {
  id: string;
  sessionId: string | null;
  pid: number | null;
  status: AgentStatus;
  source: AgentSource;
  task: string;
  model: string;
  branch: string | null;
  cwd: string;
  parentAgentId: string | null;
  permissionMode: string;
  maxBudgetUsd: number | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  agentId: string;
  role: "user" | "assistant" | "system" | "tool_use" | "tool_result";
  content: string;
  toolCallsJson: string | null;
  costUsd: number | null;
  tokenUsageJson: string | null;
  timestamp: string;
}

export interface Approval {
  id: string;
  agentId: string;
  toolName: string;
  toolInput: string;
  description: string;
  riskLevel: RiskLevel;
  status: ApprovalStatus;
  timestamp: string;
}

export interface ContextRef {
  id: string;
  agentId: string;
  type: ContextRefType;
  resourceId: string;
  title: string;
  url: string | null;
  detectedAt: string;
}

export interface AgentEvent {
  id: string;
  agentId: string;
  type: string;
  summary: string;
  metadataJson: string | null;
  timestamp: string;
}

export interface SpawnAgentConfig {
  task: string;
  model: string;
  cwd: string;
  branch?: string;
  permissionMode: string;
  maxBudgetUsd?: number;
  parentAgentId?: string;
}

/** Metrics aggregated from all agents. */
export interface FleetMetrics {
  active: number;
  idle: number;
  errored: number;
  completed: number;
  totalTokens: number;
  totalCostUsd: number;
}

/** The full store state synced from main → renderer. */
export interface StoreState {
  agents: Agent[];
  messages: Record<string, Message[]>; // keyed by agentId
  approvals: Approval[];
  contextRefs: Record<string, ContextRef[]>; // keyed by agentId
  events: AgentEvent[];
  metrics: FleetMetrics;
}

/** IPC channel names. */
export const IPC_CHANNELS = {
  AGENT_SPAWN: "agent:spawn",
  AGENT_KILL: "agent:kill",
  AGENT_MESSAGE: "agent:message",
  AGENT_INTERRUPT: "agent:interrupt",
  AGENT_STREAM: "agent:stream",
  APPROVAL_REQUEST: "agent:approval-request",
  APPROVAL_RESPONSE: "agent:approval-response",
  STORE_SYNC: "store:sync",
} as const;
