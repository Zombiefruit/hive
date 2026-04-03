/**
 * Structured escalation protocol — when agents get stuck, they create
 * Escalation objects with context about what was tried and what to do next.
 */

export type EscalationType = "stuck" | "rejected" | "error" | "needs_input" | "conflict";
export type EscalationSeverity = "low" | "medium" | "high";

export interface Escalation {
  id: string;
  taskId: string;
  agentId: string;
  type: EscalationType;
  severity: EscalationSeverity;
  summary: string;
  whatWasTried: string[];
  suggestedActions: string[];
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
}
