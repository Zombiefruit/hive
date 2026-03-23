import { broadcastApprovalRequest } from "../ipc/bridge";
import { createApproval, resolveApproval } from "../db/database";
import { notifyApprovalNeeded } from "../native-notifications";
import type { RiskLevel } from "../../shared/types";

/** Map of pending approval promises: approvalId → resolve function */
const pendingResolvers = new Map<
  string,
  (result: { behavior: "allow" } | { behavior: "deny"; message: string }) => void
>();

/** Low-risk tools that can be auto-approved without user interaction. */
const LOW_RISK_TOOLS = new Set([
  "Read", "Glob", "Grep", "ToolSearch", "WebSearch", "WebFetch", "LSP",
]);

/** Classify risk level based on tool name and input. */
function classifyRisk(toolName: string, input: Record<string, unknown>): RiskLevel {
  // Low risk: reads, searches, file listing
  if (LOW_RISK_TOOLS.has(toolName)) return "low";

  // MCP tools: low risk unless they mutate (save/create/delete/send/update)
  if (
    toolName.startsWith("mcp__") &&
    !toolName.includes("save") &&
    !toolName.includes("create") &&
    !toolName.includes("delete") &&
    !toolName.includes("send") &&
    !toolName.includes("update")
  ) {
    return "low";
  }

  // High risk: destructive bash, git push, force operations
  if (toolName === "Bash") {
    const cmd = String(input.command ?? "");
    if (/rm\s+-rf|git\s+push|git\s+reset\s+--hard|force|--no-verify/.test(cmd)) return "high";
    return "medium";
  }

  // Medium: writes, edits
  if (["Write", "Edit", "NotebookEdit"].includes(toolName)) return "medium";

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

    // Auto-approve low risk tools without user interaction
    if (riskLevel === "low") {
      const approval = createApproval(agentId, toolName, JSON.stringify(input), description, riskLevel);
      resolveApproval(approval.id, "approved");
      return { behavior: "allow" };
    }

    // Store in DB for medium/high risk
    const approval = createApproval(
      agentId,
      toolName,
      JSON.stringify(input),
      description,
      riskLevel
    );

    // Broadcast to renderer UI
    broadcastApprovalRequest(approval);

    // Native macOS notification when app is not focused
    notifyApprovalNeeded(description);

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
