/**
 * Planning contract — prompt construction for planning agents.
 *
 * All prompts are loaded from skill files via loadSkillTemplate.
 * TypeScript handles link processing and variable substitution.
 *
 * LEGACY (kept for backward compat): 3-step orchestration functions.
 */

import { loadSkillTemplate } from "./skill-loader";

// ── Types ──

export interface ContextRequest {
  type: "linear-issue" | "slack-thread" | "slack-channel" | "notion-page" | "github-pr";
  [key: string]: string | number | undefined;
}

export interface ContextResponse {
  type: string;
  label: string;
  data: string;
}

// ── Step 1: Parse context requests from ephemeral planner output ──

export function parseContextRequests(raw: string): ContextRequest[] {
  let cleaned = raw;
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) cleaned = codeBlock[1];

  const jsonMatch = cleaned.match(/\{[\s\S]*"context_requests"[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed.context_requests) ? parsed.context_requests : [];
  } catch {
    return [];
  }
}

// ── Step 2: Map each request to an askBridge prompt ──

/** Validate a Slack channel/DM ID — must be C/D/G followed by 8+ alphanumeric chars. */
function isValidSlackId(id: string | undefined): boolean {
  if (!id) return false;
  return /^[CDG][A-Z0-9]{8,}$/i.test(id);
}

export function mapRequestToBridgePrompt(req: ContextRequest): string {
  switch (req.type) {
    case "linear-issue":
      if (!req.id || !/^[A-Z]+-\d+$/.test(String(req.id))) return `Invalid Linear issue ID: ${req.id}`;
      return `Use mcp__claude_ai_Linear__get_issue to fetch full details for issue ${req.id}. Return title, description, status, priority, assignee, comments. Plain text only.`;
    case "slack-thread":
      if (!isValidSlackId(String(req.channel))) return `Invalid Slack channel ID: ${req.channel}`;
      return `Use mcp__claude_ai_Slack__slack_read_thread with channel_id "${req.channel}" and thread_ts "${req.thread_ts}". Return all messages with authors and timestamps. Plain text only.`;
    case "slack-channel":
      if (!isValidSlackId(String(req.channel))) return `Invalid Slack channel ID: ${req.channel}`;
      return `Use mcp__claude_ai_Slack__slack_read_channel with channel_id "${req.channel}" limit ${req.limit ?? 20}. Return recent messages. Plain text only.`;
    case "notion-page":
      return `Use mcp__claude_ai_Notion__notion-fetch to get the page at ${req.url}. Return title and content. Plain text only.`;
    case "github-pr":
      return `gh:${req.repo}:${req.number}`;
    default:
      return `Unknown request type: ${req.type}`;
  }
}

// ── Step 3: Build the final plan prompt with all context ──

export function buildPlanPrompt(
  task: { title: string; summary: string; taskType: string; url?: string },
  context: ContextResponse[],
): string {
  const contextSections = context.map(c =>
    `### ${c.label}\n${c.data}`
  ).join("\n\n");

  return `Here is the task and ALL fetched context:

## Task
- **Title**: ${task.title}
- **Summary**: ${task.summary}
- **Type**: ${task.taskType}
${task.url ? `- **URL**: ${task.url}` : ""}

## Context (fetched by the system)

${contextSections || "No additional context available."}

## Instructions
Create a work plan. Structure your response as:

**SECTION 1 (TL;DR)** — max 3-4 lines. Executive summary: what this is, what needs to happen, complexity.

---

**SECTION 2 (Details)** — full breakdown with specific files, steps, risks.

The "---" separator on its own line is REQUIRED.
Do NOT try to fetch any data — all context is provided above. Just analyze and plan.`;
}

// ═══════════════════════════════════════════════════════════════
// NEW: Single MCP-enabled planning prompt
// ═══════════════════════════════════════════════════════════════

/**
 * Build a prompt for an MCP-enabled planning agent.
 * The agent has full MCP tool access (Slack, Linear, Notion, GitHub)
 * and fetches its own context before producing a plan.
 */
/** Process links — detect bad Slack URLs and convert to search instructions */
function processLinks(links?: Array<{ type: string; label: string; url: string }>): string {
  const processed: string[] = [];
  for (const l of links ?? []) {
    const hasFakeSlackId = /slack\.com\/client\/T\/[A-Z]_/.test(l.url) || /slack\.com\/archives\/[A-Z]_/.test(l.url);
    if (hasFakeSlackId) {
      const channelName = l.label.replace(/^#/, "");
      processed.push(`- **${l.label}**: SEARCH for this channel by name "${channelName}" using \`mcp__claude_ai_Slack__slack_search_channels\` with query "${channelName}", then read the channel with the real ID`);
    } else {
      processed.push(`- **${l.label}**: ${l.url}`);
    }
  }
  return processed.join("\n");
}

function processUrl(url?: string): string {
  if (!url) return "";
  const hasFakeUrl = /slack\.com\/client\/T\/[A-Z]_/.test(url);
  return hasFakeUrl ? "" : `- **URL**: ${url}`;
}

export function buildMcpPlanningPrompt(notification: {
  title: string;
  summary: string;
  taskType: string;
  url?: string;
  links?: Array<{ type: string; label: string; url: string }>;
}): string {
  const linksList = processLinks(notification.links);
  const urlLine = processUrl(notification.url);

  return loadSkillTemplate("parse-implementation", {
    TITLE: notification.title,
    SUMMARY: notification.summary,
    TASK_TYPE: notification.taskType,
    URL_LINE: urlLine,
    LINKS_SECTION: linksList ? `## Links to fetch\n${linksList}` : "",
  });
}

/**
 * Build a prompt for response tasks — loads from parse-response skill.
 */
export function buildResponsePrompt(notification: {
  title: string;
  summary: string;
  url?: string;
  links?: Array<{ type: string; label: string; url: string }>;
  userSlackId?: string;
}): string {
  const linksList = (notification.links ?? []).map(l => `- **${l.label}**: ${l.url}`).join("\n");
  const urlLine = notification.url ? `- **URL**: ${notification.url}` : "";

  return loadSkillTemplate("parse-response", {
    TITLE: notification.title,
    SUMMARY: notification.summary,
    URL_LINE: urlLine,
    LINKS_SECTION: linksList ? `## Links to fetch\n${linksList}` : "",
    USER_SLACK_ID: notification.userSlackId ?? "the user",
  });
}

/**
 * Build a prompt for meeting prep tasks — loads from parse-meeting-prep skill.
 */
export function buildMeetingPrepPrompt(notification: {
  title: string;
  summary: string;
  url?: string;
  links?: Array<{ type: string; label: string; url: string }>;
}): string {
  const linksList = (notification.links ?? []).map(l => `- **${l.label}**: ${l.url}`).join("\n");
  const urlLine = notification.url ? `- **URL**: ${notification.url}` : "";

  return loadSkillTemplate("parse-meeting-prep", {
    TITLE: notification.title,
    SUMMARY: notification.summary,
    URL_LINE: urlLine,
    LINKS_SECTION: linksList ? `## Links to fetch\n${linksList}` : "",
  });
}

// ═══════════════════════════════════════════════════════════════
// LEGACY: 3-step orchestration (kept for backward compat)
// ═══════════════════════════════════════════════════════════════

// ── Step 1: Build the analyze prompt ──

export function buildAnalyzePrompt(notification: {
  title: string; summary: string; taskType?: string;
  links?: Array<{ type: string; label?: string; url: string }>;
}): string {
  const linksList = (notification.links ?? [])
    .map(l => `- [${l.type}] ${l.url}`)
    .join("\n");

  return `Analyze this task and tell me what context you need to create a work plan.

## Task
- **Title**: ${notification.title}
- **Summary**: ${notification.summary}
- **Type**: ${notification.taskType ?? "unknown"}
${linksList ? `\n## Available Links\n${linksList}` : ""}

## Instructions
Return a JSON object listing the context you need. Use this EXACT format:

\`\`\`json
{
  "context_requests": [
    {"type": "linear-issue", "id": "VEC-20"},
    {"type": "slack-thread", "channel": "C0AMSV2SK4Z", "thread_ts": "1711234567.890"},
    {"type": "slack-channel", "channel": "C0AMSV2SK4Z", "limit": 20},
    {"type": "notion-page", "url": "https://notion.so/..."},
    {"type": "github-pr", "repo": "owner/repo", "number": "123"}
  ]
}
\`\`\`

Valid types: linear-issue, slack-thread, slack-channel, notion-page, github-pr.
Extract IDs and channel IDs from the links above.
If no links or no context needed, return empty context_requests: [].
Return ONLY the JSON — no commentary.`;
}
