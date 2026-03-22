import { broadcastApprovalRequest, broadcastStoreUpdate } from "../ipc/bridge";
import { createApproval, resolveApproval, addEvent } from "../db/database";
import type { RiskLevel } from "../../shared/types";

/**
 * Approval delegation through the Manager AI.
 * Low/medium risk → auto-approve with logging.
 * High risk → escalate to user via UI.
 */

const pendingResolvers = new Map<
  string,
  (result: { behavior: "allow" } | { behavior: "deny"; message: string }) => void
>();

function classifyRisk(toolName: string, input: Record<string, unknown>): RiskLevel {
  if (toolName === "Bash") {
    const command = String(input.command ?? "");
    const highRiskPatterns = [
      /\brm\s+-rf\b/,
      /--force/,
      /--hard/,
      /--no-verify/,
      /\bdrop\b/i,
      /--accept-data-loss/,
      /\bgit\s+push\b.*--force/,
      /\bgit\s+reset\b/,
      /\bgit\s+checkout\s+--\b/,
      /\bgit\s+clean\b/,
    ];
    if (highRiskPatterns.some((p) => p.test(command))) return "high";

    // Medium risk bash commands
    const mediumRiskPatterns = [
      /\bgit\s+push\b/,
      /\bgit\s+commit\b/,
      /\bnpm\s+publish\b/,
      /\bpnpm\s+publish\b/,
    ];
    if (mediumRiskPatterns.some((p) => p.test(command))) return "medium";

    return "low";
  }
  if (toolName === "Write") return "medium";
  if (toolName === "Edit") return "medium";
  if (toolName === "Read" || toolName === "Glob" || toolName === "Grep" || toolName === "LS") return "low";
  return "medium";
}

function describeToolCall(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "Bash") return `Run: ${String(input.command ?? "").slice(0, 200)}`;
  if (toolName === "Write") return `Write: ${input.file_path}`;
  if (toolName === "Edit") return `Edit: ${input.file_path}`;
  if (toolName === "Read") return `Read: ${input.file_path}`;
  return `${toolName}: ${JSON.stringify(input).slice(0, 150)}`;
}

/**
 * Smart approval handler that auto-approves safe operations.
 * Only escalates high-risk operations to the user.
 */
export function createSmartCanUseTool(agentId: string) {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: {
      signal: AbortSignal;
      toolUseID: string;
      agentID?: string;
      description?: string;
    }
  ): Promise<
    | { behavior: "allow"; updatedInput?: Record<string, unknown> }
    | { behavior: "deny"; message: string }
  > => {
    const riskLevel = classifyRisk(toolName, input);
    const description = options.description ?? describeToolCall(toolName, input);

    // Auto-approve low risk (reads, searches)
    if (riskLevel === "low") {
      addEvent(agentId, "approval", `Auto-approved (low risk): ${description.slice(0, 80)}`);
      return { behavior: "allow" };
    }

    // Auto-approve medium risk with logging
    if (riskLevel === "medium") {
      addEvent(agentId, "approval", `Auto-approved (medium risk): ${description.slice(0, 80)}`);
      broadcastStoreUpdate();
      return { behavior: "allow" };
    }

    // High risk → escalate to user
    const approval = createApproval(agentId, toolName, JSON.stringify(input), description, riskLevel);
    addEvent(agentId, "approval", `Escalated to user (high risk): ${description.slice(0, 80)}`);
    broadcastApprovalRequest(approval);
    broadcastStoreUpdate();

    return new Promise((resolve) => {
      pendingResolvers.set(approval.id, resolve);
      options.signal.addEventListener("abort", () => {
        if (pendingResolvers.has(approval.id)) {
          pendingResolvers.delete(approval.id);
          resolve({ behavior: "deny", message: "Agent was interrupted" });
        }
      });
    });
  };
}

export function handleSmartApprovalResponse(approvalId: string, approved: boolean): void {
  const resolver = pendingResolvers.get(approvalId);
  if (!resolver) return;
  pendingResolvers.delete(approvalId);
  resolveApproval(approvalId, approved ? "approved" : "rejected");
  if (approved) {
    resolver({ behavior: "allow" });
  } else {
    resolver({ behavior: "deny", message: "User rejected this action" });
  }
}
