import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getAllAgents, getMessages, addMessage, addEvent, updateAgentTask } from "../db/database";
import { broadcastStoreUpdate } from "../ipc/bridge";

const enrichedSessionIds = new Set<string>();
const CLAUDE_DIR = path.join(os.homedir(), ".claude");

function logEnricher(msg: string): void {
  try {
    const logDir = path.join(os.homedir(), "Library", "Application Support", "claude-deck");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, "enricher.log"), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

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

interface ParsedMessage {
  role: "user" | "assistant" | "tool_use";
  content: string;
}

function parseLine(line: string): ParsedMessage | null {
  let data: { type?: string; message?: { content?: unknown } };
  try { data = JSON.parse(line); } catch { return null; }

  if (data.type === "user") {
    const content = extractUserContent(data.message?.content);
    if (content) return { role: "user", content };
  }

  if (data.type === "assistant") {
    const blocks = data.message?.content;
    if (!Array.isArray(blocks)) return null;

    const parts: string[] = [];
    for (const block of blocks as Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>) {
      if (block.type === "text" && block.text) {
        parts.push(block.text);
      } else if (block.type === "tool_use" && block.name) {
        parts.push(summarizeToolCall(block.name, block.input ?? {}));
      }
    }

    const content = parts.join("\n\n");
    if (content.trim()) return { role: "assistant", content };
  }

  return null;
}

function extractUserContent(content: unknown): string | null {
  if (typeof content === "string") {
    const cleaned = content
      .replace(/<command-message>[^<]*<\/command-message>\s*/g, "")
      .replace(/<command-name>([^<]*)<\/command-name>\s*/g, "Used skill: $1\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    return cleaned || null;
  }
  if (Array.isArray(content)) {
    const texts = (content as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!);
    return texts.join("\n") || null;
  }
  return null;
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
    case "ToolSearch": return `Loading tools: ${input.query ?? ""}`;
    case "ExitPlanMode": return `Exited plan mode`;
    default:
      if (name.startsWith("mcp__")) {
        return name.replace(/^mcp__claude_ai_/, "").replace(/__/g, ".");
      }
      return name;
  }
}

function extractTitle(messages: ParsedMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  let title = firstUser.content.replace(/\s+/g, " ").trim();
  if (title.startsWith("Used skill:")) {
    const nextUser = messages.filter((m) => m.role === "user")[1];
    if (nextUser) title = nextUser.content.replace(/\s+/g, " ").trim();
  }
  return title.slice(0, 120) || null;
}

function readSessionMessages(filePath: string, limit = 100): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  const raw = fs.readFileSync(filePath, "utf-8");
  for (const line of raw.split("\n")) {
    if (messages.length >= limit) break;
    if (!line.trim()) continue;
    const msg = parseLine(line);
    if (msg) messages.push(msg);
  }
  return messages;
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
    logEnricher(`Agent ${agent.id.slice(0, 8)}: cwd=${agent.cwd} jsonl=${jsonlPath ?? "NOT FOUND"}`);
    if (!jsonlPath) {
      addEvent(agent.id, "error", "Session file not found — may be the current active session");
      continue;
    }

    if (getMessages(agent.id).length > 0) continue;

    try {
      const messages = readSessionMessages(jsonlPath, 100);
      logEnricher(`Agent ${agent.id.slice(0, 8)}: parsed ${messages.length} messages`);

      const title = extractTitle(messages);
      if (title) {
        updateAgentTask(agent.id, title);
      }

      for (const msg of messages) {
        addMessage(agent.id, msg.role === "tool_use" ? "tool_use" : msg.role, msg.content.slice(0, 10000), { origin: "system" });
      }

      if (messages.length > 0) {
        addEvent(agent.id, "task_start", `Loaded ${messages.length} messages`);
      }
    } catch (err) {
      logEnricher(`Agent ${agent.id.slice(0, 8)}: ERROR ${String(err)}`);
      addEvent(agent.id, "error", `Failed: ${String(err).slice(0, 80)}`);
    }
  }

  broadcastStoreUpdate();
  logEnricher("done");
}
