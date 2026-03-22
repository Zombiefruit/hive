import { listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import type { SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";
import { getAllAgents, getMessages, addMessage, addEvent } from "../db/database";
import { broadcastStoreUpdate } from "../ipc/bridge";

let enrichedSessionIds = new Set<string>();

/**
 * Enrich external agents with session metadata and conversation history
 * using the Agent SDK's session reading functions.
 */
export async function enrichExternalAgents(): Promise<void> {
  const agents = getAllAgents().filter(
    (a) => a.source === "external" && a.sessionId && !enrichedSessionIds.has(a.sessionId)
  );
  if (agents.length === 0) return;

  let sessions: SDKSessionInfo[] = [];
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

    // Update the agent task with better metadata if available
    if (info) {
      const betterTask =
        info.customTitle ??
        info.summary ??
        (info.firstPrompt ? info.firstPrompt.slice(0, 120) : null);

      if (betterTask && betterTask !== agent.task) {
        // Direct SQL update for the task field
        try {
          const db = require("better-sqlite3");
          // Import won't work here cleanly — use the exported db functions instead
          // We'll update via addEvent to at least record the info
          addEvent(agent.id, "task_start", betterTask);
        } catch {}
      }

      if (info.gitBranch && info.gitBranch !== "HEAD") {
        addEvent(agent.id, "context_detected", `Branch: ${info.gitBranch}`);
      }
    }

    // Load conversation messages
    const existingMsgs = getMessages(agent.id);
    if (existingMsgs.length === 0) {
      try {
        const messages = await getSessionMessages(agent.sessionId, { limit: 30 });

        for (const msg of messages) {
          const role = msg.type === "user" ? "user" as const : "assistant" as const;
          const content = extractContent(msg.message);
          if (content) {
            addMessage(agent.id, role, content.slice(0, 5000));
          }
        }

        if (messages.length > 0) {
          addEvent(agent.id, "task_start", `Loaded ${messages.length} messages from session history`);
        }
      } catch (err) {
        // Some sessions may not be readable
        addEvent(agent.id, "error", `Could not load session history`);
      }
    }
  }

  broadcastStoreUpdate();
}

function extractContent(message: unknown): string {
  if (!message) return "";
  if (typeof message === "string") return message;
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
