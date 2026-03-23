/**
 * Work Dispatcher — orchestrates the notification → plan → work flow.
 *
 * NO hardcoded logic. The Manager (via MCP bridge) does all the thinking:
 * - Analyzes the notification context
 * - Proposes a plan
 * - Iterates on the plan based on user feedback
 * - Composes the work agent prompt when approved
 */

import { askBridge, isBridgeReady } from "../mcp-bridge";
import { spawn, ChildProcess, execFile } from "node:child_process";
import { getClaudeCodePath } from "../claude-path";
import { BrowserWindow } from "electron";
import { registerAgent, recordAgentEvent, unregisterAgent } from "./agent-monitor";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** Pre-fetch GitHub context using gh CLI for any GitHub URLs in the links. */
async function fetchGitHubContext(links?: Array<{ type: string; label: string; url: string }>): Promise<string> {
  if (!links?.length) return "";
  const ghLinks = links.filter(l => l.url?.includes("github.com"));
  if (ghLinks.length === 0) return "";

  const results: string[] = [];
  for (const link of ghLinks) {
    try {
      const prMatch = link.url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
      const issueMatch = link.url.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);

      if (prMatch) {
        const [, repo, num] = prMatch;
        const pr = await ghCmd(`pr view ${num} --repo ${repo} --json title,body,state,author,reviews,files,comments`);
        results.push(`## GitHub PR #${num} (${repo})\n${pr}`);
      } else if (issueMatch) {
        const [, repo, num] = issueMatch;
        const issue = await ghCmd(`issue view ${num} --repo ${repo} --json title,body,state,author,comments`);
        results.push(`## GitHub Issue #${num} (${repo})\n${issue}`);
      }
    } catch (err) {
      results.push(`## GitHub ${link.label}\nFailed to fetch: ${String(err).slice(0, 100)}`);
    }
  }
  return results.join("\n\n");
}

function ghCmd(args: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("gh", args.split(" "), { timeout: 15000, maxBuffer: 512 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.slice(0, 5000));
    });
  });
}

const LOG_PATH = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "dispatcher.log");

const activeWorkAgents = new Map<string, { process: ChildProcess; title: string; startedAt: number }>();

export function getActiveWorkAgents(): Array<{ agentId: string; title: string; elapsedMs: number }> {
  return Array.from(activeWorkAgents.entries()).map(([id, a]) => ({
    agentId: id,
    title: a.title,
    elapsedMs: Date.now() - a.startedAt,
  }));
}
function log(msg: string): void {
  try { fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`); } catch {}
}

export interface WorkPlan {
  notificationId: string;
  title: string;
  context: string;
  plan: string;
  estimatedModel: string;
  estimatedCost: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}

// Persist plans so they survive page refreshes
const plans = new Map<string, WorkPlan>();

function getPlanCachePath(): string {
  return path.join(os.homedir(), "Library", "Application Support", "claude-deck", "plans-cache.json");
}

function savePlans(): void {
  try {
    const data = Object.fromEntries(plans);
    fs.writeFileSync(getPlanCachePath(), JSON.stringify(data));
  } catch {}
}

function loadPlans(): void {
  try {
    const raw = fs.readFileSync(getPlanCachePath(), "utf-8");
    const data = JSON.parse(raw) as Record<string, WorkPlan>;
    for (const [k, v] of Object.entries(data)) plans.set(k, v);
  } catch {}
}

// Load on module init
loadPlans();

export function getPlan(notificationId: string): WorkPlan | null {
  return plans.get(notificationId) ?? null;
}

export function getAllPlans(): Record<string, WorkPlan> {
  return Object.fromEntries(plans);
}

/**
 * Ask the Manager to analyze a notification and propose a plan.
 * The Manager uses the bridge to fetch full context and think about it.
 */
export async function prepareWorkPlan(notification: {
  id: string;
  source: string;
  title: string;
  summary: string;
  url?: string;
  taskType?: string;
  links?: Array<{ type: string; label: string; url: string }>;
}): Promise<WorkPlan> {
  log(`prepareWorkPlan: ${notification.title}`);

  if (!isBridgeReady()) {
    return {
      notificationId: notification.id,
      title: notification.title,
      context: notification.summary,
      plan: "MCP Bridge not ready — try again in a few seconds.",
      estimatedModel: "",
      estimatedCost: "",
      conversationHistory: [],
    };
  }

  const taskType = notification.taskType ?? "implementation";
  const linksText = notification.links?.map(l => `- [${l.type}] ${l.label}: ${l.url}`).join("\n") ?? "";

  // Load the relevant skill prompt
  let skillPrompt = "";
  try {
    const skillPath = path.join(process.cwd(), ".claude", "skills", `parse-${taskType}`, "SKILL.md");
    if (fs.existsSync(skillPath)) {
      const raw = fs.readFileSync(skillPath, "utf-8");
      // Strip frontmatter
      const bodyMatch = raw.match(/---[\s\S]*?---\s*([\s\S]*)/);
      skillPrompt = bodyMatch ? bodyMatch[1].trim() : raw;
    }
  } catch {}

  // Pre-fetch GitHub context (gh CLI) before sending to bridge
  const ghContext = await fetchGitHubContext(notification.links);

  // Build explicit MCP fetch instructions based on available links
  const fetchSteps: string[] = [];
  for (const link of (notification.links ?? [])) {
    if (link.type === "linear" || link.url?.includes("linear.app")) {
      const idMatch = link.url?.match(/([A-Z]+-\d+)/) ?? link.label.match(/([A-Z]+-\d+)/);
      if (idMatch) fetchSteps.push(`Use mcp__claude_ai_Linear__get_issue to fetch full details for ${idMatch[1]}`);
    }
    if (link.type === "slack" || link.url?.includes("slack.com")) {
      const chanMatch = link.url?.match(/archives\/([A-Z0-9]+)/);
      if (chanMatch) fetchSteps.push(`Use mcp__claude_ai_Slack__slack_read_channel with channel_id "${chanMatch[1]}" limit 20 to get the conversation`);
      const threadMatch = link.url?.match(/archives\/([A-Z0-9]+)\/p(\d+)/);
      if (threadMatch) fetchSteps.push(`Use mcp__claude_ai_Slack__slack_read_thread with channel_id "${threadMatch[1]}" and thread_ts derived from "${threadMatch[2]}" to get the full thread`);
    }
    if (link.type === "notion" || link.url?.includes("notion.so")) {
      fetchSteps.push(`Use mcp__claude_ai_Notion__notion-fetch to get the Notion page at ${link.url}`);
    }
  }

  const fetchInstructions = fetchSteps.length > 0
    ? `## MANDATORY: Fetch Context First\nYou MUST execute these MCP calls before creating a plan. Do NOT skip any.\n${fetchSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`
    : "";

  // Different prompts for agent-actionable vs human-only tasks
  const isHumanOnly = taskType === "meeting_prep" || taskType === "response" || taskType === "follow_up";

  const fetchSection = `## STEP 1: FETCH ALL CONTEXT (do this FIRST)

${fetchSteps.length > 0 ? fetchSteps.map((s, i) => `${i + 1}. ${s}`).join("\n") : "No specific links — use the summary below."}
${notification.source === "linear" ? `\nAlso: Search Linear for related issues.` : ""}
${notification.source === "slack" ? `\nAlso: Read the full Slack thread.` : ""}`;

  const workItem = `## Work Item
- **Type**: ${taskType}
- **Title**: ${notification.title}
- **Summary**: ${notification.summary}
${notification.url ? `- **URL**: ${notification.url}` : ""}
${linksText ? `\n**Links:**\n${linksText}` : ""}
${ghContext ? `\n**GitHub:**\n${ghContext}` : ""}`;

  let prompt: string;

  if (isHumanOnly && taskType === "meeting_prep") {
    prompt = `You are briefing Kieran Williams for a meeting. Fetch all available context, then prepare a concise briefing.

${fetchSection}

${workItem}

## STEP 2: MEETING BRIEFING (after fetching context)

Write a SHORT briefing (max 15 lines):
1. **What's this meeting about** — topic, purpose
2. **Key people** — who's attending and their roles/context
3. **What to expect** — likely discussion topics, any decisions needed
4. **Talking points for Kieran** — things he should bring up or be ready for
5. **Recent context** — any Slack threads, tickets, or PRs relevant to the discussion

Do NOT ask questions. Use what you fetched.`;
  } else if (isHumanOnly && taskType === "response") {
    prompt = `You are helping Kieran Williams draft a response. Fetch all available context, then prepare a draft.

${fetchSection}

${workItem}

## STEP 2: DRAFT RESPONSE (after fetching context)

Write:
1. **Context summary** — what's being asked and by whom (2-3 sentences)
2. **Suggested response** — a draft Kieran can edit and send
3. **Key points to address** — what the person is looking for

Keep the draft concise and in Kieran's voice (direct, technical, helpful).
Do NOT ask questions. Use what you fetched.`;
  } else {
    prompt = `You are planning work for Kieran Williams, Senior Frontend Engineer at Monte Carlo Data (Vector team). Main codebase: ~/Documents/GitHub/frontend (React + TypeScript + Mantine).

${fetchSection}

${workItem}

## STEP 2: CONCISE WORK PLAN (after fetching context)

Write a SHORT plan (max 10 lines):
1. What needs to be done (reference specifics from context)
2. Key files/components to modify
3. Estimated complexity (simple/moderate/complex)
4. Any blockers or dependencies

Do NOT ask questions. Use what you have and what you can fetch via MCP tools.`;
  }

  const response = await askBridge(prompt, 90000);
  log(`Plan response: ${response.length} chars`);

  const plan: WorkPlan = {
    notificationId: notification.id,
    title: notification.title,
    context: response,
    plan: response,
    estimatedModel: "", // Let the AI decide in its response
    estimatedCost: "",
    conversationHistory: [
      { role: "user", content: `Prepare a plan for: ${notification.title}` },
      { role: "assistant", content: response },
    ],
  };

  plans.set(notification.id, plan);
  savePlans();
  return plan;
}

/**
 * Send feedback on a plan — the user pushes back or asks for changes.
 * The Manager iterates on the plan based on the feedback.
 */
export async function iteratePlan(notificationId: string, userFeedback: string): Promise<WorkPlan> {
  const existing = plans.get(notificationId);
  if (!existing) throw new Error("No plan found for this notification");

  log(`iteratePlan: ${notificationId} feedback: ${userFeedback.slice(0, 100)}`);

  // Build conversation context
  const historyText = existing.conversationHistory
    .map(m => `${m.role === "user" ? "User" : "Manager"}: ${m.content}`)
    .join("\n\n---\n\n");

  const prompt = `We've been discussing a work plan. Here's the conversation so far:

${historyText}

---

User's feedback: ${userFeedback}

Please update your plan based on this feedback. Address the user's concerns and provide a revised plan.`;

  const response = await askBridge(prompt, 90000);

  existing.plan = response;
  existing.context = response;
  existing.conversationHistory.push(
    { role: "user", content: userFeedback },
    { role: "assistant", content: response },
  );

  savePlans();
  return existing;
}

/**
 * Start a work agent for an approved plan.
 * The Manager composes the full prompt — no hardcoded templates.
 */
export async function startWorkAgent(notificationId: string): Promise<string> {
  const plan = plans.get(notificationId);
  if (!plan) throw new Error("No plan found");

  log(`startWorkAgent: ${plan.title}`);

  // Load the execution skill for this task type
  let executeSkill = "";
  try {
    const taskType = plan.conversationHistory?.[0]?.content?.includes("review") ? "review" : "implementation";
    const skillPath = path.join(process.cwd(), ".claude", "skills", `execute-${taskType}`, "SKILL.md");
    if (fs.existsSync(skillPath)) {
      const raw = fs.readFileSync(skillPath, "utf-8");
      const bodyMatch = raw.match(/---[\s\S]*?---\s*([\s\S]*)/);
      executeSkill = bodyMatch ? bodyMatch[1].trim() : "";
    }
  } catch {}

  // Ask the Manager to compose the actual work prompt
  const promptComposition = `Based on this approved plan, compose a complete prompt for a Claude Code agent that will execute this work. The agent has access to all MCP tools (Slack, Linear, GitHub, Notion) and standard code tools (Read, Write, Edit, Bash, etc.).

## The approved plan:
${plan.plan}

${executeSkill ? `## Execution skill instructions:\n${executeSkill}\n` : ""}

## What to include in the prompt:
- Clear task description
- All relevant context the agent needs
- Step-by-step instructions from the plan
- Which repository and branch to work in
- What to do when done (create draft PR, update Linear ticket, etc.)
- Any constraints or things to avoid

Write the prompt as if you're giving instructions to a skilled developer. Be thorough but clear.`;

  const workPrompt = await askBridge(promptComposition, 60000);
  log(`Work prompt composed: ${workPrompt.length} chars`);

  // Spawn the work agent
  const claudePath = getClaudeCodePath();
  const agentId = `work-${Date.now()}`;

  const proc = spawn(claudePath, [
    "--output-format", "stream-json",
    "--verbose",
    "--input-format", "stream-json",
    "--no-chrome",
    "--model", "claude-sonnet-4-6",
    "--permission-mode", "default",
  ], {
    cwd: os.homedir(),
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Send the composed prompt
  const message = JSON.stringify({
    type: "user",
    message: { role: "user", content: workPrompt },
    parent_tool_use_id: null,
    uuid: agentId,
    session_id: "",
  });
  proc.stdin?.write(message + "\n");
  activeWorkAgents.set(agentId, { process: proc, title: plan.title, startedAt: Date.now() });
  registerAgent(agentId, plan.title);

  // Parse agent output and broadcast events to the UI
  let outputBuffer = "";
  proc.stdout?.on("data", (chunk: Buffer) => {
    outputBuffer += chunk.toString("utf-8");
    const lines = outputBuffer.split("\n");
    outputBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const event = parseAgentEvent(msg);
        if (event) {
          recordAgentEvent(agentId);
          broadcastTaskEvent(agentId, event);
        }
      } catch {}
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    broadcastTaskEvent(agentId, {
      timestamp: new Date().toISOString(),
      type: "error",
      content: chunk.toString("utf-8").slice(0, 200),
    });
  });

  proc.on("exit", (code) => {
    log(`Work agent ${agentId} exited: ${code}`);
    activeWorkAgents.delete(agentId);
    unregisterAgent(agentId);
    broadcastTaskEvent(agentId, {
      timestamp: new Date().toISOString(),
      type: "completed",
      content: `Agent finished with exit code ${code}`,
    });
  });

  return agentId;
}

interface TaskEvent {
  timestamp: string;
  type: "started" | "progress" | "tool_use" | "error" | "completed" | "escalation" | "text";
  content: string;
}

function parseAgentEvent(msg: { type?: string; message?: { content?: unknown }; subtype?: string; result?: string }): TaskEvent | null {
  const now = new Date().toISOString();

  if (msg.type === "system" && msg.subtype === "init") {
    return { timestamp: now, type: "started", content: "Agent initialized" };
  }

  if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
    const blocks = msg.message!.content as Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
    for (const block of blocks) {
      if (block.type === "text" && block.text?.trim()) {
        return { timestamp: now, type: "text", content: block.text };
      }
      if (block.type === "tool_use" && block.name) {
        const input = block.input ?? {};
        let detail = block.name;
        if (block.name === "Bash") detail = `Run: ${String(input.command ?? "").slice(0, 80)}`;
        else if (block.name === "Read") detail = `Read: ${input.file_path}`;
        else if (block.name === "Write") detail = `Write: ${input.file_path}`;
        else if (block.name === "Edit") detail = `Edit: ${input.file_path}`;
        return { timestamp: now, type: "tool_use", content: detail };
      }
    }
  }

  if (msg.type === "result") {
    return { timestamp: now, type: "completed", content: String(msg.result ?? "Agent finished").slice(0, 500) };
  }

  return null;
}

function broadcastTaskEvent(agentId: string, event: TaskEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("task:event", { agentId, event });
    }
  }
}
