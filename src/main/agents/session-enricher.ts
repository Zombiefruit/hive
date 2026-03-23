import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getAllAgents, getMessages, addMessage, addEvent, updateAgentTask } from "../db/database";
import { broadcastStoreUpdate } from "../ipc/bridge";

const enrichedSessionIds = new Set<string>();
const CLAUDE_DIR = path.join(os.homedir(), ".claude");

function logEnricher(msg: string): void {
  try {
    const logPath = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "enricher.log");
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

function encodeCwd(cwd: string): string {
  return cwd.replace(/\//g, "-");
}

function findSessionJsonl(sessionId: string, cwd: string): string | null {
  const encoded = encodeCwd(cwd);
  const jsonlPath = path.join(CLAUDE_DIR, "projects", encoded, `${sessionId}.jsonl`);
  if (fs.existsSync(jsonlPath)) return jsonlPath;

  // Search all project directories
  const projectsDir = path.join(CLAUDE_DIR, "projects");
  if (!fs.existsSync(projectsDir)) return null;
  for (const dir of fs.readdirSync(projectsDir)) {
    const candidate = path.join(projectsDir, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
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
 * Read a session JSONL file synchronously and extract messages.
 * Uses readFileSync to avoid async/stream issues in Electron.
 */
function readSessionMessages(filePath: string, limit = 50): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");

  for (const line of lines) {
    if (messages.length >= limit) break;
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      if (data.type === "user" || data.type === "assistant") {
        const content = extractText(data.message?.content);
        if (content && content.length > 0) {
          messages.push({ role: data.type, content });
        }
      }
    } catch {}
  }

  return messages;
}

function extractTitle(messages: Array<{ role: string; content: string }>): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  let title = firstUser.content.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return title.slice(0, 120) || null;
}

export function enrichExternalAgents(): void {
  logEnricher("enrichExternalAgents called");

  const agents = getAllAgents().filter(
    (a) => a.source === "external" && a.sessionId && !enrichedSessionIds.has(a.sessionId)
  );
  logEnricher(`Found ${agents.length} agents to enrich`);
  if (agents.length === 0) return;

  for (const agent of agents) {
    if (!agent.sessionId) continue;
    enrichedSessionIds.add(agent.sessionId);

    const jsonlPath = findSessionJsonl(agent.sessionId, agent.cwd);
    logEnricher(`Agent ${agent.id.slice(0, 8)}: jsonl=${jsonlPath ?? "NOT FOUND"}`);
    if (!jsonlPath) {
      addEvent(agent.id, "error", "Session file not found");
      continue;
    }

    const existingMsgs = getMessages(agent.id);
    if (existingMsgs.length > 0) continue;

    try {
      const messages = readSessionMessages(jsonlPath, 50);
      logEnricher(`Agent ${agent.id.slice(0, 8)}: read ${messages.length} messages`);

      const title = extractTitle(messages);
      if (title) {
        updateAgentTask(agent.id, title);
        logEnricher(`Agent ${agent.id.slice(0, 8)}: title="${title.slice(0, 60)}"`);
      }

      for (const msg of messages) {
        addMessage(agent.id, msg.role, msg.content.slice(0, 10000), { origin: "system" });
      }

      if (messages.length > 0) {
        addEvent(agent.id, "task_start", `Loaded ${messages.length} messages from session`);
      }
    } catch (err) {
      logEnricher(`Agent ${agent.id.slice(0, 8)}: ERROR ${String(err)}`);
      addEvent(agent.id, "error", `Failed to read session: ${String(err).slice(0, 100)}`);
    }
  }

  broadcastStoreUpdate();
  logEnricher("enrichExternalAgents done");
}
