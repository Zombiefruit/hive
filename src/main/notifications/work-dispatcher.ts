/**
 * Work Dispatcher — orchestrates the notification → plan → work flow.
 *
 * NO hardcoded logic. The Manager (via MCP bridge) does all the thinking:
 * - Analyzes the notification context
 * - Proposes a plan
 * - Iterates on the plan based on user feedback
 * - Composes the work agent prompt when approved
 */

import { addDebugEntry, askEphemeralProcess, askMcpPlanningAgent, type PlanningEvent } from "../mcp-bridge";
import { buildMcpPlanningPrompt, buildResponsePrompt, buildMeetingPrepPrompt } from "../../shared/planning-contract";
import { spawn, ChildProcess, execFile } from "node:child_process";
import { getClaudeCodePath } from "../claude-path";
import { trackProcess, untrackProcess } from "../process-monitor";
import { BrowserWindow } from "electron";
import { registerAgent, recordAgentEvent, unregisterAgent } from "./agent-monitor";
import { buildSlackArchiveUrl } from "../../shared/task-utils";
import { hasConfig, getConfig } from "../config";
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
  /** Raw context fetched by the planning agent — Slack messages, Linear details, etc. */
  fetchedContext?: Array<{ type: string; content: string; timestamp: string }>;
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

export function clearPlan(notificationId: string): void {
  plans.delete(notificationId);
  savePlans();
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

  // ═══ SINGLE MCP AGENT — fetches context and produces plan ═══
  // One agent with full MCP tool access. No intermediate steps.
  // ~60s MCP init is expected — agent fetches Slack/Linear/Notion directly.

  addDebugEntry("in", `📋 [PLANNING] Starting MCP planning agent: ${notification.title}`, "planning");

  // Collect all events for context storage + broadcast to renderer + persist to disk
  const collectedEvents: Array<{ type: string; content: string; timestamp: string }> = [];
  const eventCachePath = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "planning-events-cache.json");

  // Load any existing events for this notification (in case of resume)
  const loadEventCache = (): Record<string, Array<{ type: string; content: string; timestamp: string }>> => {
    try { return JSON.parse(fs.readFileSync(eventCachePath, "utf-8")); } catch { return {}; }
  };
  const saveEventCache = (cache: Record<string, unknown>) => {
    try { fs.writeFileSync(eventCachePath, JSON.stringify(cache)); } catch {}
  };

  const broadcastEvent = (event: PlanningEvent) => {
    const entry = { type: event.type, content: event.content, timestamp: event.timestamp };
    collectedEvents.push(entry);
    // Persist to disk immediately so events survive page navigation
    const cache = loadEventCache();
    if (!cache[notification.id]) cache[notification.id] = [];
    cache[notification.id].push(entry);
    // Keep only last 100 events per notification
    if (cache[notification.id].length > 100) cache[notification.id] = cache[notification.id].slice(-100);
    saveEventCache(cache);

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("planning:event", { notificationId: notification.id, event });
      }
    }
  };

  // Pre-fetch GitHub context via gh CLI (faster than MCP agent for GH)
  const ghContext = await fetchGitHubContext(notification.links);

  // Build task-type-specific prompt
  const taskType = notification.taskType ?? "implementation";
  let prompt: string;
  if (taskType === "response") {
    const cfg = hasConfig() ? getConfig() : null;
    prompt = buildResponsePrompt({
      title: notification.title,
      summary: notification.summary,
      url: notification.url,
      links: notification.links,
      userSlackId: cfg?.slackUserId,
    });
  } else if (taskType === "meeting_prep") {
    prompt = buildMeetingPrepPrompt({
      title: notification.title,
      summary: notification.summary,
      url: notification.url,
      links: notification.links,
    });
  } else {
    prompt = buildMcpPlanningPrompt({
      title: notification.title,
      summary: notification.summary,
      taskType,
      url: notification.url,
      links: notification.links,
    });
  }

  // Append pre-fetched GitHub context if available
  if (ghContext) {
    prompt += `\n\n## Pre-fetched GitHub Context\n${ghContext}\n\n(This GitHub data was already fetched — do not re-fetch it.)`;
  }

  const startTime = Date.now();
  let response = await askMcpPlanningAgent(prompt, 300000, broadcastEvent); // 5 min timeout
  const elapsed = Math.round((Date.now() - startTime) / 1000);

  // Auto-retry once on timeout
  if (response.includes("timed out") || response.includes("not ready")) {
    log(`Plan timed out after ${elapsed}s — retrying once`);
    addDebugEntry("out", `⏱️ [PLANNING] Timed out after ${elapsed}s, retrying...`, "planning");
    response = await askMcpPlanningAgent(prompt, 300000, broadcastEvent);
  }

  addDebugEntry("out", `📋 [PLANNING] Plan ready: ${response.length} chars (${elapsed}s)`, "planning");
  log(`Plan ready — ${response.length} chars (${elapsed}s)`);

  const plan: WorkPlan = {
    notificationId: notification.id,
    title: notification.title,
    context: ghContext ? `GitHub context: ${ghContext.slice(0, 200)}` : "",
    plan: response,
    estimatedModel: "",
    estimatedCost: "",
    conversationHistory: [
      { role: "user", content: `**${notification.title}**\n\n${notification.summary}${notification.url ? `\n\n[Source](${notification.url})` : ""}${notification.links?.length ? `\n\nLinks:\n${notification.links.map(l => `- ${l.label}: ${l.url}`).join("\n")}` : ""}` },
      { role: "assistant", content: response },
    ],
    fetchedContext: collectedEvents.filter(e => e.type === "text" || e.type === "tool_use" || e.type === "init"),
  };

  plans.set(notification.id, plan);
  savePlans();

  // Extract resource links from tool_use events and update notification links
  const discoveredLinks: Array<{ type: string; label: string; url: string }> = [];
  for (const evt of collectedEvents.filter(e => e.type === "tool_use")) {
    const c = evt.content;
    const slackChMatch = c.match(/channel_id["\s:]+([CDG][A-Z0-9]{8,})/i);
    const slackTsMatch = c.match(/thread_ts["\s:]+(\d+\.\d+)/);
    if (slackChMatch) {
      const chId = slackChMatch[1];
      // Resolve channel ID to human name from existing links
      const knownLink = (notification.links ?? []).find(l => l.url?.includes(chId));
      const chName = knownLink?.label || `#${chId}`;
      if (slackTsMatch) {
        discoveredLinks.push({ type: "slack_thread", label: `Thread in ${chName}`, url: buildSlackArchiveUrl(chId, slackTsMatch[1]) });
      }
      // Don't add bare channel links — they're noise and cause duplicates
    }
    const linearMatch = c.match(/get_issue.*?([A-Z]+-\d+)/i) || c.match(/issue["\s:]+([A-Z]+-\d+)/i);
    if (linearMatch) {
      discoveredLinks.push({ type: "linear", label: linearMatch[1], url: `https://linear.app/issue/${linearMatch[1]}` });
    }
  }
  // Merge with existing links (dedup by URL)
  if (discoveredLinks.length > 0) {
    const existingUrls = new Set((notification.links ?? []).map(l => l.url));
    const newLinks = discoveredLinks.filter(l => !existingUrls.has(l.url));
    if (newLinks.length > 0) {
      const mergedLinks = [...(notification.links ?? []), ...newLinks];
      // Update notification via IPC-style direct import
      try {
        const { updateNotificationById } = await import("./poll-service");
        updateNotificationById(notification.id, { links: mergedLinks });
        log(`Added ${newLinks.length} discovered links to notification`);
      } catch {}
    }
  }

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

  // Ephemeral process — isolated from fetch bridge, full conversation in prompt
  const response = await askEphemeralProcess(prompt, 180000);

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

  // Ephemeral process — self-contained prompt, no bridge context needed
  const workPrompt = await askEphemeralProcess(promptComposition, 120000);
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

  if (proc.pid) trackProcess(proc.pid, "work", plan.title.slice(0, 40));

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
    if (proc.pid) untrackProcess(proc.pid);
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
