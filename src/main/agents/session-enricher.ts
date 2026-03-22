import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { getAllAgents, getMessages, addMessage, addEvent, updateAgentTask } from "../db/database";
import { broadcastStoreUpdate } from "../ipc/bridge";

const enrichedSessionIds = new Set<string>();
const CLAUDE_DIR = path.join(os.homedir(), ".claude");

/**
 * Encode a cwd path the same way Claude does for project directories.
 * /Users/kieranwilliams → -Users-kieranwilliams
 */
function encodeCwd(cwd: string): string {
  return cwd.replace(/\//g, "-");
}

/**
 * Find the JSONL file for a session by checking project directories.
 */
function findSessionJsonl(sessionId: string, cwd: string): string | null {
  // Try the exact encoded cwd first
  const encoded = encodeCwd(cwd);
  const projectDir = path.join(CLAUDE_DIR, "projects", encoded);
  const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);

  if (fs.existsSync(jsonlPath)) return jsonlPath;

  // Search all project directories for this session
  const projectsDir = path.join(CLAUDE_DIR, "projects");
  if (!fs.existsSync(projectsDir)) return null;

  for (const dir of fs.readdirSync(projectsDir)) {
    const candidate = path.join(projectsDir, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

interface JsonlMessage {
  type: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string; name?: string; input?: unknown }>;
  };
  timestamp?: string;
  slug?: string;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: { type: string; text?: string }) => b.type === "text" && b.text)
      .map((b: { text: string }) => b.text)
      .join("\n");
  }
  return "";
}

/**
 * Read a session JSONL file and extract messages.
 */
async function readSessionMessages(
  filePath: string,
  limit = 50
): Promise<Array<{ role: "user" | "assistant"; content: string; timestamp?: string }>> {
  const messages: Array<{ role: "user" | "assistant"; content: string; timestamp?: string }> = [];

  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (messages.length >= limit) break;
    try {
      const data: JsonlMessage = JSON.parse(line);
      if (data.type === "user" || data.type === "assistant") {
        const content = extractText(data.message?.content);
        if (content && content.length > 0) {
          messages.push({
            role: data.type as "user" | "assistant",
            content,
            timestamp: data.timestamp,
          });
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return messages;
}

/**
 * Get the first user message as a summary/title for the session.
 */
function extractTitle(messages: Array<{ role: string; content: string }>): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  // Clean Claude XML tags for display
  let title = firstUser.content
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return title.slice(0, 120) || null;
}

/**
 * Enrich external agents by reading their session JSONL files directly.
 * This bypasses the Agent SDK (which has Vite bundling issues) and reads
 * the raw session data from ~/.claude/projects/.
 */
export async function enrichExternalAgents(): Promise<void> {
  const agents = getAllAgents().filter(
    (a) => a.source === "external" && a.sessionId && !enrichedSessionIds.has(a.sessionId)
  );
  if (agents.length === 0) return;

  for (const agent of agents) {
    if (!agent.sessionId) continue;
    enrichedSessionIds.add(agent.sessionId);

    // Find the session JSONL file
    const jsonlPath = findSessionJsonl(agent.sessionId, agent.cwd);
    if (!jsonlPath) {
      addEvent(agent.id, "error", "Session file not found");
      continue;
    }

    // Read messages
    const existingMsgs = getMessages(agent.id);
    if (existingMsgs.length > 0) continue; // Already enriched

    try {
      const messages = await readSessionMessages(jsonlPath, 50);

      // Update task name from first user message
      const title = extractTitle(messages);
      if (title) {
        updateAgentTask(agent.id, title);
      }

      // Store messages
      for (const msg of messages) {
        addMessage(agent.id, msg.role, msg.content.slice(0, 10000), { origin: "system" });
      }

      if (messages.length > 0) {
        addEvent(agent.id, "task_start", `Loaded ${messages.length} messages from session`);
      }
    } catch (err) {
      addEvent(agent.id, "error", `Failed to read session: ${String(err).slice(0, 100)}`);
    }
  }

  broadcastStoreUpdate();
}
