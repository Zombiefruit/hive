import { addContextRef, addEvent } from "../db/database";
import { broadcastStoreUpdate } from "../ipc/bridge";
import type { ContextRefType } from "../../shared/types";

/**
 * MCP tool name patterns mapped to context ref types and extraction logic.
 */
const MCP_PATTERNS: Array<{
  pattern: RegExp;
  type: ContextRefType;
  extract: (toolName: string, input: Record<string, unknown>) => { resourceId: string; title: string; url?: string } | null;
}> = [
  // Linear
  {
    pattern: /^mcp__claude_ai_Linear__/,
    type: "linear",
    extract: (_toolName, input) => {
      const id = String(input.issueId ?? input.id ?? input.identifier ?? "");
      if (!id) return null;
      return {
        resourceId: id,
        title: String(input.title ?? id),
        url: `https://linear.app/issue/${id}`,
      };
    },
  },
  // Slack
  {
    pattern: /^mcp__claude_ai_Slack__/,
    type: "slack",
    extract: (toolName, input) => {
      const channel = String(input.channel_id ?? input.channel ?? "");
      const threadTs = input.thread_ts ? String(input.thread_ts) : undefined;
      if (!channel) return null;
      return {
        resourceId: threadTs ? `${channel}/${threadTs}` : channel,
        title: String(input.channel_name ?? input.channel ?? channel),
        url: threadTs
          ? `https://slack.com/archives/${channel}/p${threadTs.replace(".", "")}`
          : `https://slack.com/archives/${channel}`,
      };
    },
  },
  // Notion
  {
    pattern: /^mcp__claude_ai_Notion__/,
    type: "notion",
    extract: (_toolName, input) => {
      const pageId = String(input.page_id ?? input.pageId ?? input.id ?? "");
      if (!pageId) return null;
      return {
        resourceId: pageId,
        title: String(input.title ?? pageId),
        url: `https://notion.so/${pageId.replace(/-/g, "")}`,
      };
    },
  },
  // GitHub (via git commands or GitHub MCP)
  {
    pattern: /^mcp__.*GitHub__/i,
    type: "github",
    extract: (_toolName, input) => {
      const repo = String(input.repo ?? input.repository ?? "");
      const pr = input.pr_number ?? input.pull_number;
      if (repo && pr) {
        return {
          resourceId: `${repo}#${pr}`,
          title: `PR #${pr} on ${repo}`,
          url: `https://github.com/${repo}/pull/${pr}`,
        };
      }
      if (repo) {
        return {
          resourceId: repo,
          title: repo,
          url: `https://github.com/${repo}`,
        };
      }
      return null;
    },
  },
];

/**
 * URL regex patterns for manual context addition.
 */
const URL_PATTERNS: Array<{
  pattern: RegExp;
  type: ContextRefType;
  extract: (match: RegExpMatchArray) => { resourceId: string; title: string };
}> = [
  {
    pattern: /linear\.app\/.*\/issue\/([A-Z]+-\d+)/i,
    type: "linear",
    extract: (match) => ({
      resourceId: match[1],
      title: match[1],
    }),
  },
  {
    pattern: /slack\.com\/archives\/([A-Z0-9]+)(?:\/p(\d+))?/i,
    type: "slack",
    extract: (match) => ({
      resourceId: match[2] ? `${match[1]}/${match[2]}` : match[1],
      title: match[2] ? `Thread in ${match[1]}` : `Channel ${match[1]}`,
    }),
  },
  {
    pattern: /notion\.so\/(?:.*-)?([a-f0-9]{32})/i,
    type: "notion",
    extract: (match) => ({
      resourceId: match[1],
      title: `Notion page ${match[1].slice(0, 8)}...`,
    }),
  },
  {
    pattern: /github\.com\/([^/]+\/[^/]+)\/(?:pull|issues)\/(\d+)/,
    type: "github",
    extract: (match) => ({
      resourceId: `${match[1]}#${match[2]}`,
      title: `${match[1]}#${match[2]}`,
    }),
  },
  {
    pattern: /github\.com\/([^/]+\/[^/]+)\/?$/,
    type: "github",
    extract: (match) => ({
      resourceId: match[1],
      title: match[1],
    }),
  },
];

/**
 * Process an SDK message to detect context references from MCP tool calls.
 */
export function trackContextFromMessage(
  agentId: string,
  message: { type: string; message?: { content?: unknown } }
): void {
  if (message.type !== "assistant") return;

  const content = message.message?.content;
  if (!Array.isArray(content)) return;

  for (const block of content as Array<{ type: string; name?: string; input?: Record<string, unknown> }>) {
    if (block.type !== "tool_use" || !block.name) continue;

    for (const mcpPattern of MCP_PATTERNS) {
      if (mcpPattern.pattern.test(block.name)) {
        const extracted = mcpPattern.extract(block.name, block.input ?? {});
        if (extracted) {
          const ref = addContextRef(
            agentId,
            mcpPattern.type,
            extracted.resourceId,
            extracted.title,
            extracted.url
          );
          if (ref) {
            addEvent(agentId, "context_detected", `Detected ${mcpPattern.type}: ${extracted.title}`);
            broadcastStoreUpdate();
          }
        }
        break;
      }
    }
  }
}

/**
 * Parse a URL and add it as a manual context reference.
 * Returns the created ref or null if the URL doesn't match any pattern.
 */
export function addContextFromUrl(
  agentId: string,
  url: string
): { type: ContextRefType; resourceId: string; title: string } | null {
  for (const urlPattern of URL_PATTERNS) {
    const match = url.match(urlPattern.pattern);
    if (match) {
      const extracted = urlPattern.extract(match);
      addContextRef(agentId, urlPattern.type, extracted.resourceId, extracted.title, url);
      addEvent(agentId, "context_added", `Added ${urlPattern.type}: ${extracted.title}`);
      broadcastStoreUpdate();
      return { type: urlPattern.type, ...extracted };
    }
  }
  return null;
}
