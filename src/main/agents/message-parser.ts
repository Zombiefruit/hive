import { buildSlackArchiveUrl } from "../../shared/task-utils";

/**
 * Parse raw JSONL lines into grouped, display-ready messages.
 * Collapses sequential tool calls into summary groups.
 */

export interface DisplayMessage {
  role: "user" | "assistant" | "tool_group" | "skill" | "agent_group";
  content: string;
  /** For tool_group/agent_group: the individual items */
  items?: string[];
}

export interface DetectedContext {
  type: "linear" | "slack" | "notion" | "github";
  resourceId: string;
  title: string;
  url?: string;
}

interface RawLine {
  type: string;
  message?: { content?: unknown };
}

export function parseSessionToDisplayMessages(lines: string[], limit = 150): DisplayMessage[] {
  const messages: DisplayMessage[] = [];
  const pendingTools: string[] = [];
  const pendingTasks: string[] = [];
  const pendingAgents: string[] = [];
  const pendingSetup: string[] = [];

  function flushPending() {
    if (pendingSetup.length > 0) {
      messages.push({
        role: "tool_group",
        content: `Setting up ${pendingSetup.length} tool${pendingSetup.length > 1 ? "s" : ""}`,
        items: [...pendingSetup],
      });
      pendingSetup.length = 0;
    }
    if (pendingTasks.length > 0) {
      messages.push({
        role: "tool_group",
        content: `${pendingTasks.length} task operation${pendingTasks.length > 1 ? "s" : ""}`,
        items: [...pendingTasks],
      });
      pendingTasks.length = 0;
    }
    if (pendingAgents.length > 0) {
      messages.push({
        role: "agent_group",
        content: `Spawned ${pendingAgents.length} sub-agent${pendingAgents.length > 1 ? "s" : ""}`,
        items: [...pendingAgents],
      });
      pendingAgents.length = 0;
    }
    if (pendingTools.length > 0) {
      messages.push({
        role: "tool_group",
        content: `${pendingTools.length} tool call${pendingTools.length > 1 ? "s" : ""}`,
        items: [...pendingTools],
      });
      pendingTools.length = 0;
    }
  }

  for (const line of lines) {
    if (messages.length >= limit) break;
    if (!line.trim()) continue;

    let data: RawLine;
    try { data = JSON.parse(line); } catch { continue; }

    // Skip non-message types
    if (!data.type || !["user", "assistant"].includes(data.type)) continue;

    const content = data.message?.content;

    // User messages
    if (data.type === "user") {
      // Skip tool_result blocks (internal responses to tool calls)
      if (Array.isArray(content)) {
        const hasToolResult = (content as Array<{ type: string }>).some(b => b.type === "tool_result");
        if (hasToolResult) continue;

        // Extract text from array content
        const texts = (content as Array<{ type: string; text?: string }>)
          .filter(b => b.type === "text" && b.text)
          .map(b => b.text!);
        if (texts.length > 0) {
          flushPending();
          messages.push({ role: "user", content: texts.join("\n") });
        }
        continue;
      }

      // String content — actual user message
      if (typeof content === "string" && content.trim()) {
        // Clean skill invocation tags
        const cleaned = content
          .replace(/<command-message>[^<]*<\/command-message>\s*/g, "")
          .replace(/<command-name>([^<]*)<\/command-name>\s*/g, "")
          .replace(/<[^>]+>/g, "")
          .trim();
        if (cleaned) {
          flushPending();
          messages.push({ role: "user", content: cleaned });
        }
      }
      continue;
    }

    // Assistant messages
    if (data.type === "assistant" && Array.isArray(content)) {
      for (const block of content as Array<{ type: string; text?: string; thinking?: string; name?: string; input?: Record<string, unknown> }>) {
        if (block.type === "text" && block.text?.trim()) {
          flushPending();
          messages.push({ role: "assistant", content: block.text });
        } else if (block.type === "tool_use" && block.name) {
          const name = block.name;
          const input = block.input ?? {};

          if (name === "Skill") {
            flushPending();
            messages.push({ role: "skill", content: String(input.skill ?? "unknown") });
          } else if (name === "ToolSearch") {
            pendingSetup.push(String(input.query ?? "tools"));
          } else if (name === "TaskCreate") {
            pendingTasks.push(`Create: ${input.subject ?? "task"}`);
          } else if (name === "TaskUpdate") {
            pendingTasks.push(`Update: ${input.status ?? input.subject ?? "task"}`);
          } else if (name === "Agent") {
            pendingAgents.push(String(input.description ?? input.prompt ?? "sub-agent").slice(0, 80));
          } else if (name === "Read") {
            pendingTools.push(`Read ${input.file_path ?? "file"}`);
          } else if (name === "Write") {
            pendingTools.push(`Write ${input.file_path ?? "file"}`);
          } else if (name === "Edit") {
            pendingTools.push(`Edit ${input.file_path ?? "file"}`);
          } else if (name === "Bash") {
            pendingTools.push(`Run \`${String(input.command ?? "").slice(0, 60)}\``);
          } else if (name === "Glob" || name === "Grep") {
            pendingTools.push(`${name}: ${input.pattern ?? ""}`);
          } else if (name.startsWith("mcp__")) {
            const short = name.replace(/^mcp__claude_ai_/, "").replace(/__/g, ".");
            pendingTools.push(short);
          } else {
            pendingTools.push(name);
          }
        }
        // Skip thinking blocks entirely
      }
    }
  }

  flushPending();
  return messages;
}

/**
 * Detect context references (Linear/Slack/Notion/GitHub) from JSONL lines.
 * Scans MCP tool calls for service-specific patterns.
 */
// Slack channel names — resolved from config at runtime
const KNOWN_SLACK_CHANNELS: Record<string, string> = {};

/** Populate known channels from config (call at startup). */
export function initSlackChannels(channels: Array<{ id: string; name: string }>): void {
  for (const ch of channels) {
    KNOWN_SLACK_CHANNELS[ch.id] = ch.name;
  }
}

function resolveSlackChannelName(channelId: string): string {
  if (KNOWN_SLACK_CHANNELS[channelId]) return KNOWN_SLACK_CHANNELS[channelId];
  // D = DM, G = group DM
  if (channelId.startsWith("D")) return "Direct Message";
  if (channelId.startsWith("G")) return "Group DM";
  return channelId;
}

export function detectContextFromLines(lines: string[]): DetectedContext[] {
  const contexts: DetectedContext[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    let data: { type?: string; message?: { content?: unknown } };
    try { data = JSON.parse(line); } catch { continue; }
    if (data.type !== "assistant" || !Array.isArray(data.message?.content)) continue;

    for (const block of data.message!.content as Array<{ type: string; name?: string; input?: Record<string, unknown> }>) {
      if (block.type !== "tool_use" || !block.name) continue;
      const name = block.name;
      const input = block.input ?? {};

      // Linear
      if (name.includes("Linear") && name.includes("get_issue")) {
        const id = String(input.issueId ?? input.id ?? input.identifier ?? "");
        if (id && !seen.has(`linear:${id}`)) {
          seen.add(`linear:${id}`);
          contexts.push({ type: "linear", resourceId: id, title: String(input.title ?? id), url: `https://linear.app/issue/${id}` });
        }
      }

      // Slack
      if (name.includes("Slack") && (name.includes("read_channel") || name.includes("read_thread") || name.includes("search"))) {
        const channel = String(input.channel_id ?? input.channel ?? "");
        if (channel && !seen.has(`slack:${channel}`)) {
          seen.add(`slack:${channel}`);
          const channelName = resolveSlackChannelName(channel);
          contexts.push({ type: "slack", resourceId: channel, title: `#${channelName}`, url: buildSlackArchiveUrl(channel) });
        }
      }

      // Notion
      if (name.includes("Notion") && (name.includes("fetch") || name.includes("search"))) {
        const pageId = String(input.page_id ?? input.pageId ?? input.id ?? "");
        if (pageId && !seen.has(`notion:${pageId}`)) {
          seen.add(`notion:${pageId}`);
          contexts.push({ type: "notion", resourceId: pageId, title: String(input.title ?? pageId.slice(0, 12)), url: `https://notion.so/${pageId.replace(/-/g, "")}` });
        }
      }

      // GitHub (via Bash git commands or MCP)
      if (name === "Bash") {
        const cmd = String(input.command ?? "");
        const prMatch = cmd.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
        if (prMatch && !seen.has(`github:${prMatch[1]}#${prMatch[2]}`)) {
          seen.add(`github:${prMatch[1]}#${prMatch[2]}`);
          contexts.push({ type: "github", resourceId: `${prMatch[1]}#${prMatch[2]}`, title: `PR #${prMatch[2]}`, url: `https://github.com/${prMatch[1]}/pull/${prMatch[2]}` });
        }
      }

      // Also check Skill inputs for GitHub URLs
      if (name === "Skill" || name === "WebFetch") {
        const url = String(input.url ?? input.args ?? "");
        const ghMatch = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
        if (ghMatch && !seen.has(`github:${ghMatch[1]}#${ghMatch[2]}`)) {
          seen.add(`github:${ghMatch[1]}#${ghMatch[2]}`);
          contexts.push({ type: "github", resourceId: `${ghMatch[1]}#${ghMatch[2]}`, title: `PR #${ghMatch[2]}`, url: `https://github.com/${ghMatch[1]}/pull/${ghMatch[2]}` });
        }
      }
    }
  }

  // Also scan user messages for URLs
  for (const line of lines) {
    let data: { type?: string; message?: { content?: unknown } };
    try { data = JSON.parse(line); } catch { continue; }
    if (data.type !== "user") continue;
    const content = typeof data.message?.content === "string" ? data.message.content : "";

    // GitHub PR URLs in user messages
    const ghMatches = content.matchAll(/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/g);
    for (const m of ghMatches) {
      const key = `github:${m[1]}#${m[2]}`;
      if (!seen.has(key)) {
        seen.add(key);
        contexts.push({ type: "github", resourceId: `${m[1]}#${m[2]}`, title: `PR #${m[2]} on ${m[1]}`, url: `https://github.com/${m[1]}/pull/${m[2]}` });
      }
    }

    // Linear ticket IDs
    const linMatches = content.matchAll(/\b([A-Z]+-\d+)\b/g);
    for (const m of linMatches) {
      if (!seen.has(`linear:${m[1]}`)) {
        seen.add(`linear:${m[1]}`);
        contexts.push({ type: "linear", resourceId: m[1], title: m[1] });
      }
    }
  }

  return contexts;
}
