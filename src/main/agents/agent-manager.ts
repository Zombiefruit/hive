import { getClaudeCodePath } from "../claude-path";

// Dynamic import to avoid Vite bundling issues with import.meta.url
let sdkQuery: typeof import("@anthropic-ai/claude-agent-sdk").query | null = null;
async function getSdkQuery() {
  if (!sdkQuery) {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    sdkQuery = sdk.query;
  }
  return sdkQuery;
}
import type { SpawnAgentConfig } from "../../shared/types";
import {
  createAgent,
  updateAgent,
  addMessage,
  addEvent,
} from "../db/database";
import { broadcastAgentStream, broadcastStoreUpdate } from "../ipc/bridge";
import { createCanUseTool } from "./approval-handler";
import { trackContextFromMessage } from "./context-tracker";

interface ActiveAgent {
  id: string;
  query: any;
  abortController: AbortController;
  messageQueue: Array<{ role: "user"; content: string }>;
  resolveNextMessage: (() => void) | null;
}

const activeAgents = new Map<string, ActiveAgent>();

/**
 * Creates an async generator that yields user messages.
 * First yields the initial prompt, then waits for follow-up messages
 * pushed via sendMessage().
 */
function createMessageStream(
  initialPrompt: string,
  agent: ActiveAgent
) {
  return async function* () {
    // Yield the initial prompt
    yield {
      type: "user" as const,
      message: { role: "user" as const, content: initialPrompt },
      parent_tool_use_id: null,
      uuid: crypto.randomUUID(),
      session_id: "",
    };

    // Wait for follow-up messages
    while (true) {
      if (agent.messageQueue.length > 0) {
        const msg = agent.messageQueue.shift()!;
        yield {
          type: "user" as const,
          message: { role: "user" as const, content: msg.content },
          parent_tool_use_id: null,
          uuid: crypto.randomUUID(),
          session_id: "",
        };
      } else {
        // Wait until a message is queued
        await new Promise<void>((resolve) => {
          agent.resolveNextMessage = resolve;
        });
        agent.resolveNextMessage = null;
      }
    }
  };
}

/**
 * Spawn a new Claude Code agent.
 */
export async function spawnAgent(config: SpawnAgentConfig): Promise<string> {
  // Create agent record in DB
  const agent = createAgent(config);
  const agentId = agent.id;

  addEvent(agentId, "task_start", `Started: ${config.task}`);

  const abortController = new AbortController();

  const activeAgent: ActiveAgent = {
    id: agentId,
    query: null!,
    abortController,
    messageQueue: [],
    resolveNextMessage: null,
  };

  // Create the SDK query with streaming input
  const messageStream = createMessageStream(config.task, activeAgent);

  const query = await getSdkQuery();
  const q = query({
    prompt: messageStream(),
    options: {
      pathToClaudeCodeExecutable: getClaudeCodePath(),
      cwd: config.cwd,
      model: config.model,
      permissionMode: config.permissionMode as "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk",
      maxBudgetUsd: config.maxBudgetUsd,
      canUseTool: createCanUseTool(agentId),
      includePartialMessages: true,
      abortController,
    },
  });

  activeAgent.query = q;
  activeAgents.set(agentId, activeAgent);

  // Process the stream in the background
  processAgentStream(agentId, q).catch((err) => {
    console.error(`[AgentManager] Agent ${agentId} stream error:`, err);
    updateAgent(agentId, { status: "errored" });
    addEvent(agentId, "error", `Stream error: ${String(err)}`);
    broadcastStoreUpdate();
  });

  broadcastStoreUpdate();
  return agentId;
}

/**
 * Process the async message stream from an agent.
 */
async function processAgentStream(
  agentId: string,
  q: any
): Promise<void> {
  try {
    for await (const message of q) {
      // Forward raw message to renderer for real-time display
      broadcastAgentStream(agentId, message);

      // Track context references from MCP tool calls
      trackContextFromMessage(agentId, message as { type: string; message?: { content?: unknown } });

      switch (message.type) {
        case "assistant": {
          const content = extractTextContent(message.message);
          if (content) {
            addMessage(agentId, "assistant", content);
          }

          // Check for tool_use blocks
          if (message.message?.content) {
            for (const block of message.message.content as Array<{ type: string; name?: string; input?: unknown }>) {
              if (block.type === "tool_use") {
                addMessage(agentId, "tool_use", block.name ?? "unknown", {
                  toolCallsJson: JSON.stringify(block),
                });
                addEvent(agentId, "tool_use", `Used tool: ${block.name}`);
              }
            }
          }

          // Update session ID from first assistant message
          if (message.session_id) {
            updateAgent(agentId, { sessionId: message.session_id });
          }
          break;
        }

        case "user": {
          const content = extractTextContent(message.message);
          if (content) {
            addMessage(agentId, "user", content);
          }
          break;
        }

        case "result": {
          const result = message as {
            type: "result";
            subtype: string;
            duration_ms?: number;
            total_cost_usd?: number;
            usage?: { input_tokens?: number; output_tokens?: number };
            result?: string;
          };

          const isSuccess = result.subtype === "success";
          updateAgent(agentId, {
            status: isSuccess ? "completed" : "errored",
            costUsd: result.total_cost_usd ?? 0,
            inputTokens: result.usage?.input_tokens ?? 0,
            outputTokens: result.usage?.output_tokens ?? 0,
          });

          addEvent(
            agentId,
            isSuccess ? "completed" : "error",
            isSuccess
              ? `Completed in ${(result.duration_ms ?? 0) / 1000}s`
              : `Error: ${result.subtype}`
          );

          // Clean up
          activeAgents.delete(agentId);
          break;
        }

        // Streaming partial messages — just forward to renderer, don't persist
        case "stream_event":
          break;

        default:
          // Skip internal events (rate_limit, system init, etc.) — they clutter the timeline
          break;
      }

      broadcastStoreUpdate();
    }
  } finally {
    // If we exit the loop without a result, mark as idle
    if (activeAgents.has(agentId)) {
      updateAgent(agentId, { status: "idle" });
      activeAgents.delete(agentId);
      broadcastStoreUpdate();
    }
  }
}

/** Extract text content from a message parameter. */
function extractTextContent(message: unknown): string {
  if (!message) return "";
  const msg = message as { content?: unknown; role?: string };
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return (msg.content as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
  }
  return "";
}

/**
 * Send a follow-up message to a running agent.
 */
export function sendMessage(agentId: string, message: string): void {
  const agent = activeAgents.get(agentId);
  if (!agent) throw new Error(`Agent ${agentId} is not active`);

  agent.messageQueue.push({ role: "user", content: message });
  // Wake up the message stream generator
  if (agent.resolveNextMessage) {
    agent.resolveNextMessage();
  }
}

/**
 * Interrupt a running agent.
 */
export async function interruptAgent(agentId: string): Promise<void> {
  const agent = activeAgents.get(agentId);
  if (!agent) return;

  await agent.query.interrupt();
  addEvent(agentId, "interrupted", "Agent was interrupted by user");
  broadcastStoreUpdate();
}

/**
 * Kill an agent (force abort).
 */
export function killAgent(agentId: string): void {
  const agent = activeAgents.get(agentId);
  if (!agent) return;

  agent.abortController.abort();
  agent.query.close();
  activeAgents.delete(agentId);
  updateAgent(agentId, { status: "errored" });
  addEvent(agentId, "killed", "Agent was killed by user");
  broadcastStoreUpdate();
}

/**
 * Resume an external session — attach to it and make it interactive.
 * The agent becomes a deck-managed agent with full chat capability.
 */
export async function resumeSession(agentId: string, sessionId: string, cwd: string): Promise<void> {
  const abortController = new AbortController();

  const activeAgent: ActiveAgent = {
    id: agentId,
    query: null!,
    abortController,
    messageQueue: [],
    resolveNextMessage: null,
  };

  // Use the Agent SDK's resume option to continue an existing session
  const query = await getSdkQuery();
  const q = query({
    prompt: "Continue where you left off. What's the current status?",
    options: {
      pathToClaudeCodeExecutable: getClaudeCodePath(),
      cwd,
      resume: sessionId,
      permissionMode: "default",
      canUseTool: createCanUseTool(agentId),
      includePartialMessages: true,
      abortController,
    },
  });

  activeAgent.query = q;
  activeAgents.set(agentId, activeAgent);

  // Update agent to deck-managed (enables chat input)
  updateAgent(agentId, { status: "active", source: "deck" as "deck" });
  addEvent(agentId, "task_start", "Resumed session — now interactive");

  processAgentStream(agentId, q).catch((err) => {
    console.error(`[AgentManager] Resume ${agentId} stream error:`, err);
    updateAgent(agentId, { status: "errored" });
    addEvent(agentId, "error", `Resume error: ${String(err)}`);
    broadcastStoreUpdate();
  });

  broadcastStoreUpdate();
}

/**
 * Get the list of currently active agent IDs.
 */
export function getActiveAgentIds(): string[] {
  return Array.from(activeAgents.keys());
}
