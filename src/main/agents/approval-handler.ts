import { broadcastApprovalRequest } from "../ipc/bridge";
import { createApproval, resolveApproval } from "../db/database";
import type { RiskLevel } from "../../shared/types";

/** Map of pending approval promises: approvalId → resolve function */
const pendingResolvers = new Map<
  string,
  (result: { behavior: "allow" } | { behavior: "deny"; message: string }) => void
>();

/** Classify risk level based on tool name and input. */
function classifyRisk(toolName: string, input: Record<string, unknown>): RiskLevel {
  if (toolName === "Bash") {
    const command = String(input.command ?? "");
    const highRiskPatterns = [
      /\brm\s+-rf\b/,
      /--force/,
      /--hard/,
      /--no-verify/,
      /\bdrop\b/i,
      /\bdelete\b/i,
      /--accept-data-loss/,
      /\bgit\s+push\b.*--force/,
      /\bgit\s+reset\b/,
    ];
    if (highRiskPatterns.some((p) => p.test(command))) return "high";
    return "medium";
  }
  if (toolName === "Write" || toolName === "Edit") return "medium";
  if (toolName === "Read" || toolName === "Glob" || toolName === "Grep") return "low";
  return "medium";
}

/** Build a human-readable description for a tool call. */
function describeToolCall(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "Bash") return `Run command: ${String(input.command ?? "").slice(0, 200)}`;
  if (toolName === "Write") return `Write file: ${input.file_path}`;
  if (toolName === "Edit") return `Edit file: ${input.file_path}`;
  if (toolName === "Read") return `Read file: ${input.file_path}`;
  return `${toolName}: ${JSON.stringify(input).slice(0, 150)}`;
}

/**
 * canUseTool callback for the Claude Agent SDK.
 * Creates an approval in the DB, broadcasts it to the renderer,
 * and waits for the user's response.
 */
export function createCanUseTool(agentId: string) {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    _options: {
      signal: AbortSignal;
      toolUseID: string;
      agentID?: string;
      title?: string;
      displayName?: string;
      description?: string;
      suggestions?: unknown[];
    }
  ): Promise<
    | { behavior: "allow"; updatedInput?: Record<string, unknown> }
    | { behavior: "deny"; message: string }
  > => {
    const riskLevel = classifyRisk(toolName, input);
    const description = _options.description ?? describeToolCall(toolName, input);

    // Store in DB
    const approval = createApproval(
      agentId,
      toolName,
      JSON.stringify(input),
      description,
      riskLevel
    );

    // Broadcast to renderer UI
    broadcastApprovalRequest(approval);

    // Wait for user response
    return new Promise((resolve) => {
      pendingResolvers.set(approval.id, resolve);

      // If the agent is aborted while waiting, auto-deny
      _options.signal.addEventListener("abort", () => {
        if (pendingResolvers.has(approval.id)) {
          pendingResolvers.delete(approval.id);
          resolve({ behavior: "deny", message: "Agent was interrupted" });
        }
      });
    });
  };
}

/**
 * Called from IPC when the user approves or rejects an approval.
 */
export function handleApprovalResponse(
  approvalId: string,
  approved: boolean
): void {
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

/** Check if there are any pending approvals waiting. */
export function hasPendingApprovals(): boolean {
  return pendingResolvers.size > 0;
}
