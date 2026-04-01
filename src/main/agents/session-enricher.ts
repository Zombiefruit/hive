import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getAllAgents, getMessages, addMessage, addEvent, updateAgentTask, updateAgentSummary, addContextRef } from "../db/database";
import { broadcastStoreUpdate } from "../ipc/bridge";
import { parseSessionToDisplayMessages, detectContextFromLines } from "./message-parser";

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
      addEvent(agent.id, "error", "Session file not found — close the session and reopen the app");
      continue;
    }

    if (getMessages(agent.id).length > 0) continue;

    try {
      const raw = fs.readFileSync(jsonlPath, "utf-8");
      const lines = raw.split("\n");
      const displayMessages = parseSessionToDisplayMessages(lines, 150);

      logEnricher(`Agent ${agent.id.slice(0, 8)}: parsed ${displayMessages.length} display messages`);

      // Extract a clean title from the conversation — try multiple strategies
      let title = "";
      let summary = "";

      // Strategy 1: Look for ticket IDs (VEC-44, DAR-123) in user messages
      for (const msg of displayMessages.filter(m => m.role === "user")) {
        const ticketMatch = msg.content.match(/\b([A-Z]+-\d+)\b/);
        if (ticketMatch) {
          // Use the ticket + any text after it as the title
          const afterTicket = msg.content.slice(msg.content.indexOf(ticketMatch[0])).replace(/\s+/g, " ").trim();
          title = afterTicket.length > ticketMatch[0].length + 2 ? afterTicket.slice(0, 80) : ticketMatch[0];
          break;
        }
      }

      // Strategy 2: Look for skill invocations — use the skill name + args
      if (!title) {
        const skillMsg = displayMessages.find(m => m.role === "skill");
        const firstUser = displayMessages.find(m => m.role === "user");
        if (skillMsg) {
          const skillName = skillMsg.content.replace(/^\//, "");
          // Try to combine skill name with the user's context
          if (firstUser && firstUser.content.length > 5) {
            const userText = firstUser.content.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
            title = userText.length > 10 ? userText.slice(0, 70) : `${skillName} session`;
          } else {
            title = `${skillName} session`;
          }
        }
      }

      // Strategy 3: Use first meaningful user message (>15 chars, not just a URL)
      if (!title) {
        for (const msg of displayMessages.filter(m => m.role === "user")) {
          const cleaned = msg.content
            .replace(/https?:\/\/\S+/g, (url) => {
              const prMatch = url.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
              if (prMatch) return `PR #${prMatch[1]}`;
              const linMatch = url.match(/\/issue\/([A-Z]+-\d+)/);
              if (linMatch) return linMatch[1];
              return "";
            })
            .replace(/\s+/g, " ")
            .trim();
          if (cleaned.length > 15) {
            title = cleaned.slice(0, 80);
            break;
          }
        }
      }

      // Strategy 4: Use first assistant response as title if it starts with a clear summary
      if (!title) {
        const firstAssistant = displayMessages.find(m => m.role === "assistant");
        if (firstAssistant) {
          const firstLine = firstAssistant.content.split("\n")[0].replace(/^#+\s*/, "").trim();
          if (firstLine.length > 10 && firstLine.length < 100) {
            title = firstLine.slice(0, 80);
          }
        }
      }

      // Fallback: use the cwd folder name
      if (!title) {
        title = `Session in ${agent.cwd.split("/").pop() ?? agent.cwd}`;
      }

      updateAgentTask(agent.id, title);

      // Generate a summary from the first assistant response
      const firstAssistant = displayMessages.find(m => m.role === "assistant");
      if (firstAssistant) {
        // Take the first 2-3 sentences or first 200 chars
        const text = firstAssistant.content.replace(/^#+\s*/gm, "").trim();
        const sentences = text.split(/(?<=[.!?])\s+/);
        summary = sentences.slice(0, 3).join(" ");
        if (summary.length > 200) summary = summary.slice(0, 197) + "...";
        if (summary) updateAgentSummary(agent.id, summary);
      }

      // Store messages — tool_group/skill/agent_group get stored as special roles
      for (const msg of displayMessages) {
        const dbRole = msg.role === "skill" ? "system"
          : msg.role === "tool_group" || msg.role === "agent_group" ? "tool_use"
          : msg.role;

        const content = msg.items
          ? `${msg.content}\n${msg.items.join("\n")}`
          : msg.content;

        addMessage(agent.id, dbRole as "user" | "assistant" | "system" | "tool_use", content.slice(0, 10000), {
          origin: "system",
          toolCallsJson: msg.items ? JSON.stringify(msg.items) : undefined,
        });
      }

      // Detect context references (Linear tickets, Slack channels, GitHub PRs, etc.)
      const contexts = detectContextFromLines(lines);
      for (const ctx of contexts) {
        addContextRef(agent.id, ctx.type, ctx.resourceId, ctx.title, ctx.url);
      }
      logEnricher(`Agent ${agent.id.slice(0, 8)}: detected ${contexts.length} context refs`);

      // Create meaningful timeline events
      const userCount = displayMessages.filter(m => m.role === "user").length;
      const assistantCount = displayMessages.filter(m => m.role === "assistant").length;
      const skillCount = displayMessages.filter(m => m.role === "skill").length;
      const agentCount = displayMessages.filter(m => m.role === "agent_group").length;

      if (displayMessages.length > 0) {
        addEvent(agent.id, "task_start", `Session with ${userCount} exchanges, ${assistantCount} responses`);
      }
      if (skillCount > 0) {
        const skills = displayMessages.filter(m => m.role === "skill").map(m => m.content);
        addEvent(agent.id, "tool_use", `Used skills: ${skills.join(", ")}`);
      }
      if (agentCount > 0) {
        addEvent(agent.id, "tool_use", `Spawned sub-agents for parallel work`);
      }
      if (contexts.length > 0) {
        addEvent(agent.id, "context_detected", `Linked ${contexts.length} resources: ${contexts.map(c => c.title).join(", ").slice(0, 80)}`);
      }
    } catch (err) {
      logEnricher(`Agent ${agent.id.slice(0, 8)}: ERROR ${String(err)}`);
      addEvent(agent.id, "error", `Failed: ${String(err).slice(0, 80)}`);
    }
  }

  broadcastStoreUpdate();
  logEnricher("done");
}
