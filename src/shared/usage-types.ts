/** Usage tracking types — persistent token and cost accounting. */

/** All places that can trigger Claude API usage. */
export type UsageSource =
  | "agent"           // SDK agents via agent-manager
  | "poll-bridge"     // MCP bridge for fetch+triage
  | "planning-agent"  // askMcpPlanningAgent
  | "ephemeral"       // askEphemeralProcess (generic)
  | "judge"           // askJudgeProcess (triage/plan/work/context)
  | "skill-runner"    // runSkill (start-work, hack, ship, etc.)
  | "work-agent"      // Work dispatcher spawned agents
  | "memory-extract"  // Memory extractor (haiku)
  | "reflect"         // Reflect/coach LLM (haiku)
  | "setup-agent"     // Auto-discovery setup agent
  | "manager"         // Manager AI conversations
  | "insights"        // Insights extraction
  | "poll-fetch"      // Poll fetch step (haiku)
  | "poll-triage";    // Poll triage step

/** A single recorded usage event. */
export interface UsageEntry {
  id: string;
  timestamp: string;
  source: UsageSource;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  label: string;
  agentId?: string;
  notificationId?: string;
}

/** Daily aggregation. */
export interface DailyUsage {
  date: string; // YYYY-MM-DD
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
  bySource: Partial<Record<UsageSource, { costUsd: number; callCount: number }>>;
  byModel: Record<string, { costUsd: number; callCount: number; inputTokens: number; outputTokens: number }>;
}

/** Summary for the UI. */
export interface UsageSummary {
  today: DailyUsage;
  last7Days: DailyUsage[];
  last30Days: DailyUsage[];
  allTimeCostUsd: number;
  allTimeCallCount: number;
}
