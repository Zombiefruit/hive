import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getAllAgents, getAgent, addMessage, addEvent } from "../db/database";
import { broadcastStoreUpdate } from "../ipc/bridge";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const activeWatchers = new Map<string, { watcher: fs.FSWatcher; bytesRead: number; filePath: string }>();

function encodeCwd(cwd: string): string {
  return cwd.replace(/\//g, "-");
}

function findSessionJsonl(sessionId: string, cwd: string): string | null {
  const encoded = encodeCwd(cwd);
  const exact = path.join(CLAUDE_DIR, "projects", encoded, `${sessionId}.jsonl`);
  if (fs.existsSync(exact)) return exact;

  const projectsDir = path.join(CLAUDE_DIR, "projects");
  if (!fs.existsSync(projectsDir)) return null;
  try {
    for (const dir of fs.readdirSync(projectsDir)) {
      const candidate = path.join(projectsDir, dir, `${sessionId}.jsonl`);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {}
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

function summarizeToolCall(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Read": return `Read \`${input.file_path ?? "file"}\``;
    case "Write": return `Write \`${input.file_path ?? "file"}\``;
    case "Edit": return `Edit \`${input.file_path ?? "file"}\``;
    case "Bash": return `Run \`${String(input.command ?? "").slice(0, 80)}\``;
    case "Glob": return `Search files: \`${input.pattern ?? ""}\``;
    case "Grep": return `Search: \`${input.pattern ?? ""}\``;
    case "Agent": return `Spawned sub-agent`;
    case "Skill": return `Used skill: ${input.skill ?? "unknown"}`;
    default:
      if (name.startsWith("mcp__")) return name.replace(/^mcp__claude_ai_/, "").replace(/__/g, ".");
      return name;
  }
}

function parseNewLines(newData: string, agentId: string): void {
  const lines = newData.split("\n");
  let added = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    let data: { type?: string; message?: { content?: unknown } };
    try { data = JSON.parse(line); } catch { continue; }

    if (data.type === "user") {
      const content = typeof data.message?.content === "string"
        ? data.message.content
            .replace(/<command-message>[^<]*<\/command-message>\s*/g, "")
            .replace(/<command-name>([^<]*)<\/command-name>\s*/g, "Used skill: $1\n")
            .replace(/<[^>]+>/g, "").trim()
        : extractText(data.message?.content);
      if (content) {
        addMessage(agentId, "user", content.slice(0, 10000), { origin: "system" });
        added++;
      }
    }

    if (data.type === "assistant") {
      const blocks = data.message?.content;
      if (!Array.isArray(blocks)) continue;
      const parts: string[] = [];
      for (const block of blocks as Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>) {
        if (block.type === "text" && block.text) parts.push(block.text);
        else if (block.type === "tool_use" && block.name) parts.push(summarizeToolCall(block.name, block.input ?? {}));
      }
      const content = parts.join("\n\n");
      if (content.trim()) {
        addMessage(agentId, "assistant", content.slice(0, 10000), { origin: "system" });
        added++;
      }
    }
  }

  if (added > 0) {
    broadcastStoreUpdate();
  }
}

/**
 * Start tailing the JSONL file for an agent.
 * Reads new data appended to the file in real-time.
 */
function startTailing(agentId: string, sessionId: string, cwd: string): void {
  if (activeWatchers.has(agentId)) return;

  const filePath = findSessionJsonl(sessionId, cwd);
  if (!filePath) return;

  // Start from current file size (don't re-read existing data)
  let bytesRead = 0;
  try {
    bytesRead = fs.statSync(filePath).size;
  } catch { return; }

  const watcher = fs.watch(filePath, () => {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size <= bytesRead) return;

      // Read only the new bytes
      const fd = fs.openSync(filePath, "r");
      const newSize = stats.size - bytesRead;
      const buffer = Buffer.alloc(newSize);
      fs.readSync(fd, buffer, 0, newSize, bytesRead);
      fs.closeSync(fd);

      bytesRead = stats.size;
      const newData = buffer.toString("utf-8");
      parseNewLines(newData, agentId);
    } catch {}
  });

  activeWatchers.set(agentId, { watcher, bytesRead, filePath });
}

/**
 * Start tailing all active external agents.
 * Call after session discovery populates the DB.
 */
export function startSessionTailing(): void {
  const agents = getAllAgents().filter((a) => a.source === "external" && a.status === "active" && a.sessionId);
  for (const agent of agents) {
    if (agent.sessionId) {
      startTailing(agent.id, agent.sessionId, agent.cwd);
    }
  }
}

/**
 * Stop all active tailers.
 */
export function stopSessionTailing(): void {
  for (const [, { watcher }] of activeWatchers) {
    watcher.close();
  }
  activeWatchers.clear();
}
