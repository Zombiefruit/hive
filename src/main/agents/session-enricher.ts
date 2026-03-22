import { listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import { getAllAgents, getMessages, addMessage, addEvent, updateAgentTask } from "../db/database";
import { getClaudeCodePath } from "../claude-path";
import { broadcastStoreUpdate } from "../ipc/bridge";

const enrichedSessionIds = new Set<string>();

/**
 * Enrich external agents with session metadata and conversation history.
 * Uses the Agent SDK's session reading functions.
 */
export async function enrichExternalAgents(): Promise<void> {
  const agents = getAllAgents().filter(
    (a) => a.source === "external" && a.sessionId && !enrichedSessionIds.has(a.sessionId)
  );
  if (agents.length === 0) return;

  // Set the path so the SDK can find the CLI
  process.env.CLAUDE_CODE_PATH = getClaudeCodePath();

  let sessions;
  try {
    sessions = await listSessions();
  } catch (err) {
    console.error("[Enricher] listSessions failed:", err);
    return;
  }

  const sessionMap = new Map(sessions.map((s) => [s.sessionId, s]));

  for (const agent of agents) {
    if (!agent.sessionId) continue;
    enrichedSessionIds.add(agent.sessionId);

    const info = sessionMap.get(agent.sessionId);

    // Update agent task with better info from session metadata
    if (info) {
      const betterTask =
        info.customTitle ??
        info.summary ??
        (info.firstPrompt ? info.firstPrompt.slice(0, 120) : null);

      if (betterTask) {
        updateAgentTask(
          agent.id,
          betterTask,
          info.gitBranch && info.gitBranch !== "HEAD" ? info.gitBranch : undefined
        );
      }
    }

    // Load conversation messages if we don't have any
    const existingMsgs = getMessages(agent.id);
    if (existingMsgs.length === 0) {
      try {
        const messages = await getSessionMessages(agent.sessionId, { limit: 50 });

        for (const msg of messages) {
          const role = msg.type === "user" ? ("user" as const) : ("assistant" as const);
          const content = extractContent(msg.message);
          if (content) {
            addMessage(agent.id, role, content.slice(0, 10000));
          }
        }

        if (messages.length > 0) {
          addEvent(agent.id, "task_start", `Loaded ${messages.length} messages from session`);
        }
      } catch (err) {
        addEvent(agent.id, "error", "Could not load session history");
      }
    }
  }

  broadcastStoreUpdate();
}

function extractContent(message: unknown): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  const msg = message as { content?: unknown };
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return (msg.content as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
  }
  return "";
}
