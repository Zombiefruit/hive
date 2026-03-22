import {
  getAllAgents,
  getAgent,
  getMessages,
  getEvents,
  getPendingApprovals,
  getAllContextRefs,
  addContextRef,
  addMessage,
} from "../db/database";
import {
  spawnAgent,
  sendMessage,
  interruptAgent,
  killAgent,
  getActiveAgentIds,
} from "../agents/agent-manager";
import { handleApprovalResponse } from "../agents/approval-handler";
import type { SpawnAgentConfig, FleetMetrics } from "../../shared/types";

/**
 * Tool definitions in Claude function-calling format.
 * These are injected into the Manager AI's system prompt.
 */
export const MANAGER_TOOL_SCHEMAS = [
  {
    name: "spawn_agent",
    description:
      "Spawn a new Claude Code agent to work on a task. Choose an appropriate model based on task complexity: Haiku for simple fixes, Sonnet for features/refactors, Opus for complex architecture/debugging.",
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string", description: "Task description for the agent" },
        model: {
          type: "string",
          enum: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
          description: "Model to use. Default: claude-sonnet-4-6",
        },
        cwd: { type: "string", description: "Working directory (full path)" },
        branch: { type: "string", description: "Git branch name (optional)" },
        permissionMode: {
          type: "string",
          enum: ["default", "acceptEdits", "bypassPermissions"],
          description: "Permission mode. Default: default (require approval)",
        },
        maxBudgetUsd: { type: "number", description: "Max budget in USD. Default: 1" },
      },
      required: ["task", "cwd"],
    },
  },
  {
    name: "list_agents",
    description: "List all agents with their status, task summary, model, cost, and tokens.",
    input_schema: {
      type: "object" as const,
      properties: {
        status_filter: {
          type: "string",
          enum: ["active", "idle", "errored", "completed"],
          description: "Filter by status (optional)",
        },
      },
    },
  },
  {
    name: "get_agent_status",
    description: "Get detailed status for a specific agent including recent messages, events, context refs, and pending approvals.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "Agent ID" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "send_message_to_agent",
    description: "Send a follow-up instruction to a running agent. Use this to course-correct, provide context, or ask questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "Agent ID" },
        message: { type: "string", description: "Message to send" },
      },
      required: ["agentId", "message"],
    },
  },
  {
    name: "interrupt_agent",
    description: "Gracefully interrupt a running agent.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "Agent ID" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "kill_agent",
    description: "Force-kill a running agent. Use as last resort.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "Agent ID" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "approve_command",
    description: "Approve or reject a pending permission request from a sub-agent. Include your reasoning.",
    input_schema: {
      type: "object" as const,
      properties: {
        approvalId: { type: "string", description: "Approval ID" },
        approved: { type: "boolean", description: "true to approve, false to reject" },
        reason: { type: "string", description: "Brief explanation of your decision" },
      },
      required: ["approvalId", "approved"],
    },
  },
  {
    name: "list_pending_approvals",
    description: "Get all pending approval requests across all agents.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "add_context_to_agent",
    description: "Attach a context reference (Linear ticket, Slack thread, Notion page, GitHub repo) to an agent.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "Agent ID" },
        type: {
          type: "string",
          enum: ["linear", "slack", "notion", "github"],
          description: "Type of context reference",
        },
        resourceId: { type: "string", description: "Resource identifier (ticket ID, channel ID, etc.)" },
        title: { type: "string", description: "Human-readable title" },
        url: { type: "string", description: "URL to the resource (optional)" },
      },
      required: ["agentId", "type", "resourceId", "title"],
    },
  },
  {
    name: "get_fleet_metrics",
    description: "Get aggregate fleet metrics: agent counts by status, total tokens, total cost.",
    input_schema: { type: "object" as const, properties: {} },
  },
];

/**
 * Execute a Manager tool call and return the result.
 */
export async function executeManagerTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case "spawn_agent": {
      const config: SpawnAgentConfig = {
        task: String(input.task),
        model: String(input.model ?? "claude-sonnet-4-6"),
        cwd: String(input.cwd),
        branch: input.branch ? String(input.branch) : undefined,
        permissionMode: String(input.permissionMode ?? "default"),
        maxBudgetUsd: input.maxBudgetUsd ? Number(input.maxBudgetUsd) : 1,
      };
      const agentId = await spawnAgent(config);
      return JSON.stringify({ success: true, agentId, config });
    }

    case "list_agents": {
      let agents = getAllAgents();
      if (input.status_filter) {
        agents = agents.filter((a) => a.status === input.status_filter);
      }
      return JSON.stringify(
        agents.map((a) => ({
          id: a.id,
          status: a.status,
          task: a.task,
          model: a.model,
          cwd: a.cwd,
          branch: a.branch,
          costUsd: a.costUsd,
          tokens: a.inputTokens + a.outputTokens,
          source: a.source,
        }))
      );
    }

    case "get_agent_status": {
      const agent = getAgent(String(input.agentId));
      if (!agent) return JSON.stringify({ error: "Agent not found" });
      const messages = getMessages(agent.id).slice(-10); // Last 10 messages
      const events = getEvents(agent.id).slice(-10);
      const approvals = getPendingApprovals().filter((a) => a.agentId === agent.id);
      const contextRefs = getAllContextRefs().filter((r) => r.agentId === agent.id);
      return JSON.stringify({ agent, recentMessages: messages, recentEvents: events, pendingApprovals: approvals, contextRefs });
    }

    case "send_message_to_agent": {
      // Record in DB with manager origin so UI can distinguish
      addMessage(String(input.agentId), "user", String(input.message), { origin: "manager" });
      sendMessage(String(input.agentId), String(input.message));
      return JSON.stringify({ success: true });
    }

    case "interrupt_agent": {
      await interruptAgent(String(input.agentId));
      return JSON.stringify({ success: true });
    }

    case "kill_agent": {
      killAgent(String(input.agentId));
      return JSON.stringify({ success: true });
    }

    case "approve_command": {
      handleApprovalResponse(String(input.approvalId), Boolean(input.approved));
      return JSON.stringify({
        success: true,
        action: input.approved ? "approved" : "rejected",
        reason: input.reason ?? "",
      });
    }

    case "list_pending_approvals": {
      const approvals = getPendingApprovals();
      return JSON.stringify(approvals);
    }

    case "add_context_to_agent": {
      addContextRef(
        String(input.agentId),
        String(input.type) as "linear" | "slack" | "notion" | "github",
        String(input.resourceId),
        String(input.title),
        input.url ? String(input.url) : undefined
      );
      return JSON.stringify({ success: true });
    }

    case "get_fleet_metrics": {
      const agents = getAllAgents();
      const metrics: FleetMetrics = {
        active: agents.filter((a) => a.status === "active").length,
        idle: agents.filter((a) => a.status === "idle").length,
        errored: agents.filter((a) => a.status === "errored").length,
        completed: agents.filter((a) => a.status === "completed").length,
        totalTokens: agents.reduce((sum, a) => sum + a.inputTokens + a.outputTokens, 0),
        totalCostUsd: agents.reduce((sum, a) => sum + a.costUsd, 0),
      };
      return JSON.stringify(metrics);
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
