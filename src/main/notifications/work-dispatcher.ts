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
import { recordUsage } from "../usage-ledger";
import { buildMcpPlanningPrompt, buildResponsePrompt, buildMeetingPrepPrompt } from "../../shared/planning-contract";
import { spawn, ChildProcess, execFile } from "node:child_process";
import { getClaudeCodePath } from "../claude-path";
import { trackProcess, untrackProcess } from "../process-monitor";
import { BrowserWindow } from "electron";
import { registerAgent, recordAgentEvent, unregisterAgent } from "./agent-monitor";
import { buildSlackArchiveUrl } from "../../shared/task-utils";
import { hasConfig, getConfig } from "../config";
import { judgePlan, judgeWork } from "../judge-bridge";
import type { PlanVerdict, WorkVerdict } from "../../shared/judge-types";
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

/** Tracks which notifications currently have a planning agent running.
 *  Prevents spawning duplicate planners for the same notification. */
const activePlanningIds = new Set<string>();

/** Check if planning is already in progress for a notification. */
export function isPlanningActive(notificationId: string): boolean {
  return activePlanningIds.has(notificationId);
}

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
  /** Verdict from the planning judge (if verification ran) */
  verdict?: PlanVerdict;
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

export function setPlan(notificationId: string, plan: WorkPlan): void {
  plans.set(notificationId, plan);
  savePlans();
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
  // Guard: prevent concurrent planning for the same notification
  if (activePlanningIds.has(notification.id)) {
    log(`prepareWorkPlan: SKIPPED — already planning "${notification.title}" (${notification.id})`);
    const existing = plans.get(notification.id);
    if (existing) return existing;
    throw new Error(`Planning already in progress for ${notification.id}`);
  }

  activePlanningIds.add(notification.id);
  log(`prepareWorkPlan: ${notification.title}`);

  // ═══ SINGLE MCP AGENT — fetches context and produces plan ═══
  // One agent with full MCP tool access. No intermediate steps.
  // ~60s MCP init is expected — agent fetches Slack/Linear/Notion directly.

  addDebugEntry("in", `📋 [PLANNING] Starting MCP planning agent: ${notification.title}`, "planning");

  // Collect all events for context storage + broadcast to renderer + persist to disk
  const collectedEvents: Array<{ type: string; content: string; timestamp: string }> = [];
  const eventCachePath = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "planning-events-cache.json");

  // ── Batched event cache I/O ──
  // Instead of reading+parsing+writing the full cache file on every event (~200+ per session),
  // keep an in-memory cache and debounce disk writes to at most once every 500ms.
  let inMemoryEventCache: Record<string, Array<{ type: string; content: string; timestamp: string }>> | null = null;
  let eventCacheDirty = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const loadEventCache = (): Record<string, Array<{ type: string; content: string; timestamp: string }>> => {
    if (inMemoryEventCache) return inMemoryEventCache;
    try { inMemoryEventCache = JSON.parse(fs.readFileSync(eventCachePath, "utf-8")); } catch { inMemoryEventCache = {}; }
    return inMemoryEventCache!;
  };

  const flushEventCache = () => {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!eventCacheDirty || !inMemoryEventCache) return;
    eventCacheDirty = false;
    fs.writeFile(eventCachePath, JSON.stringify(inMemoryEventCache), () => {});
  };

  const scheduleFlush = () => {
    if (flushTimer) return; // already scheduled
    eventCacheDirty = true;
    flushTimer = setTimeout(flushEventCache, 500);
  };

  const broadcastEvent = (event: PlanningEvent) => {
    const entry = { type: event.type, content: event.content, timestamp: event.timestamp };
    collectedEvents.push(entry);
    // Update in-memory cache (no disk I/O here)
    const cache = loadEventCache();
    if (!cache[notification.id]) cache[notification.id] = [];
    cache[notification.id].push(entry);
    // Keep only last 100 events per notification
    if (cache[notification.id].length > 100) cache[notification.id] = cache[notification.id].slice(-100);
    scheduleFlush();

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("planning:event", { notificationId: notification.id, event });
      }
    }
  };

  // ═══ MCP PLANNING AGENT — fetches context via tools and produces plan ═══
  // MCP init takes ~10s (confirmed by timing test). The agent has full read access
  // to Slack, Linear, Notion, Gmail, Calendar via MCP tools.

  // Pre-fetch GitHub context via gh CLI (faster than MCP for GH)
  const ghContext = await fetchGitHubContext(notification.links);

  const taskType = notification.taskType ?? "implementation";
  const cfg = hasConfig() ? getConfig() : null;
  let prompt: string;
  if (taskType === "response") {
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

  if (ghContext) {
    prompt += `\n\n## Pre-fetched GitHub Context\n${ghContext}\n\n(This GitHub data was already fetched — do not re-fetch it.)`;
  }

  const startTime = Date.now();
  let response: string;
  try {
    response = await askMcpPlanningAgent(prompt, undefined, broadcastEvent);
  } catch (err) {
    activePlanningIds.delete(notification.id);
    throw err;
  }
  const elapsed = Math.round((Date.now() - startTime) / 1000);

  // If agent became unresponsive (inactivity timeout) or exited without result
  if (response.includes("unresponsive") || response.includes("timed out") || response.includes("not ready") || response.includes("exited without")) {
    log(`Plan failed after ${elapsed}s: ${response.slice(0, 100)}`);
    addDebugEntry("out", `⏱️ [PLANNING] Failed after ${elapsed}s: ${response.slice(0, 80)}`, "planning");
    broadcastEvent({ type: "error", content: `Planning failed after ${elapsed}s. Click "Re-plan" to try again.`, timestamp: new Date().toISOString() });
    activePlanningIds.delete(notification.id);
    const errorPlan: WorkPlan = {
      notificationId: notification.id,
      title: notification.title,
      context: "",
      plan: `Planning failed after ${elapsed}s: ${response}\n\nClick "Re-plan" to try again.`,
      estimatedModel: "",
      estimatedCost: "",
      conversationHistory: [],
    };
    plans.set(notification.id, errorPlan);
    savePlans();
    return errorPlan;
  }

  // Flush any remaining buffered events to disk now that the agent is done
  flushEventCache();

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

  // Run planning judge to verify the plan
  const planVerdict = await judgePlan(
    { title: notification.title, summary: notification.summary, taskType: notification.taskType },
    response,
    collectedEvents.filter(e => e.type === "text" || e.type === "tool_use"),
  ).catch(err => {
    log(`Plan judge error: ${String(err).slice(0, 100)}`);
    return null;
  });

  if (planVerdict) {
    plan.verdict = planVerdict;
    addDebugEntry("out", `⚖️ [PLANNING] Judge verdict: ${planVerdict.status} (${planVerdict.confidence}/10, ${planVerdict.durationMs}ms)`, "planning");

    // If rejected, auto-iterate once with judge concerns as feedback
    if (planVerdict.status === "rejected" && planVerdict.concerns.length > 0) {
      const judgeFeedback = `The planning judge has rejected this plan. Address these concerns:\n\n${planVerdict.concerns.map(c => `- [${c.severity}] ${c.description}${c.suggestion ? ` → ${c.suggestion}` : ""}`).join("\n")}${planVerdict.missingSteps.length > 0 ? `\n\nMissing steps:\n${planVerdict.missingSteps.map(s => `- ${s}`).join("\n")}` : ""}`;
      addDebugEntry("in", `⚖️ [PLANNING] Auto-iterating based on judge rejection`, "planning");

      try {
        const iteratedPlan = await askEphemeralProcess(
          `You previously produced this plan:\n\n${response}\n\n---\n\nFeedback from reviewer:\n${judgeFeedback}\n\nPlease revise the plan to address all concerns. Return ONLY the revised plan.`,
          120000,
          "claude-sonnet-4-6",
        );
        if (iteratedPlan && iteratedPlan.length > response.length * 0.3) {
          plan.plan = iteratedPlan;
          plan.conversationHistory.push(
            { role: "user", content: judgeFeedback },
            { role: "assistant", content: iteratedPlan },
          );
          // Re-judge the iterated plan
          const secondVerdict = await judgePlan(
            { title: notification.title, summary: notification.summary, taskType: notification.taskType },
            iteratedPlan,
            collectedEvents.filter(e => e.type === "text" || e.type === "tool_use"),
          ).catch(() => null);
          if (secondVerdict) plan.verdict = secondVerdict;
          addDebugEntry("out", `⚖️ [PLANNING] Re-judge after iteration: ${secondVerdict?.status ?? "skipped"}`, "planning");
        }
      } catch (err) {
        log(`Plan auto-iteration error: ${String(err).slice(0, 100)}`);
      }
    }
  }

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
      // Only add if we haven't already seen this ticket ID in discovered links
      const ticketId = linearMatch[1].toUpperCase();
      if (!discoveredLinks.some(l => l.label.toUpperCase() === ticketId)) {
        discoveredLinks.push({ type: "linear", label: ticketId, url: `https://linear.app/issue/${ticketId}` });
      }
    }
  }
  // Merge with existing links — dedup by URL AND by ticket/PR identifier
  if (discoveredLinks.length > 0) {
    const existingUrls = new Set((notification.links ?? []).map(l => l.url));
    // Also extract ticket IDs from existing link URLs to catch format variants
    // e.g. "linear.app/montecarlodata/issue/VEC-44/..." vs "linear.app/issue/VEC-44"
    const existingTicketIds = new Set<string>();
    for (const l of (notification.links ?? [])) {
      const m = l.url?.match(/([A-Z]+-\d+)/);
      if (m) existingTicketIds.add(m[1].toUpperCase());
    }
    const newLinks = discoveredLinks.filter(l => {
      if (existingUrls.has(l.url)) return false;
      // For Linear links, also check ticket ID
      if (l.type === "linear") {
        const m = l.label?.match(/([A-Z]+-\d+)/i);
        if (m && existingTicketIds.has(m[1].toUpperCase())) return false;
      }
      return true;
    });
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

  activePlanningIds.delete(notification.id);
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
  const response = await askEphemeralProcess(prompt, 180000, "claude-sonnet-4-6");

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
  const workPrompt = await askEphemeralProcess(promptComposition, 120000, "claude-sonnet-4-6");
  log(`Work prompt composed: ${workPrompt.length} chars`);

  // Spawn the work agent — use git worktree if repo is configured
  const claudePath = getClaudeCodePath();
  const agentId = `work-${Date.now()}`;

  // Look up repo path from the notification
  let effectiveCwd = os.homedir();
  let worktreePath: string | null = null;
  try {
    const { getNotifications } = await import("./poll-service");
    const notification2 = getNotifications().find(n => n.id === notificationId);
    if (notification2?.repoPath) {
      const { createWorktree } = await import("../skill-runner");
      const branch = notification2.branch ?? `relay-work-${Date.now()}`;
      try {
        worktreePath = createWorktree(notification2.repoPath, branch);
        effectiveCwd = worktreePath;
        log(`Work agent using worktree: ${worktreePath}`);
      } catch {
        effectiveCwd = notification2.repoPath;
        log(`Worktree failed, using repo directly: ${effectiveCwd}`);
      }
    }
  } catch {}

  const proc = spawn(claudePath, [
    "--output-format", "stream-json",
    "--verbose",
    "--input-format", "stream-json",
    "--no-chrome",
    "--model", "claude-sonnet-4-6",
    "--permission-mode", "default",
  ], {
    cwd: effectiveCwd,
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
  let resultText = "";
  const collectedWorkEvents: Array<{ type: string; content: string; timestamp: string }> = [];

  proc.stdout?.on("data", (chunk: Buffer) => {
    outputBuffer += chunk.toString("utf-8");
    const lines = outputBuffer.split("\n");
    outputBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        // Capture final result text for work judge
        if (msg.type === "result") {
          resultText = String(msg.result ?? "");
          try {
            const agentEntry = activeWorkAgents.get(agentId);
            recordUsage({
              timestamp: new Date().toISOString(),
              source: "work-agent",
              model: "claude-sonnet-4-6",
              inputTokens: msg.usage?.input_tokens ?? 0,
              outputTokens: msg.usage?.output_tokens ?? 0,
              costUsd: msg.total_cost_usd ?? 0,
              durationMs: agentEntry ? Date.now() - agentEntry.startedAt : 0,
              label: plan.title,
              notificationId,
            });
          } catch {}
        }
        const event = parseAgentEvent(msg);
        if (event) {
          recordAgentEvent(agentId);
          collectedWorkEvents.push(event);
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

    // Clean up worktree if one was created
    if (worktreePath) {
      import("../skill-runner").then(({ cleanupWorktree }) => {
        try {
          const n2 = plan.notificationId;
          import("./poll-service").then(({ getNotifications }) => {
            const notif = getNotifications().find(n => n.id === n2);
            if (notif?.repoPath) cleanupWorktree(notif.repoPath, worktreePath!);
          });
        } catch {}
      }).catch(() => {});
    }
    activeWorkAgents.delete(agentId);
    unregisterAgent(agentId);
    broadcastTaskEvent(agentId, {
      timestamp: new Date().toISOString(),
      type: "completed",
      content: `Agent finished with exit code ${code}`,
    });

    // Run work judge asynchronously (non-blocking — does not delay the completed event)
    judgeWork(plan.plan, collectedWorkEvents, resultText)
      .then(verdict => {
        if (verdict) {
          log(`Work judge ${agentId}: ${verdict.status} (confidence ${verdict.confidence}/10, ${verdict.durationMs}ms)`);
          broadcastTaskEvent(agentId, {
            timestamp: new Date().toISOString(),
            type: "verdict" as TaskEvent["type"],
            content: JSON.stringify(verdict),
          });
          // If rejected, broadcast escalation so UI can hold the stage
          if (verdict.status === "rejected") {
            broadcastTaskEvent(agentId, {
              timestamp: new Date().toISOString(),
              type: "escalation",
              content: `Work judge rejected: ${verdict.summary}`,
            });
          }
        }
      })
      .catch(err => log(`Work judge error: ${String(err).slice(0, 100)}`));
  });

  return agentId;
}

interface TaskEvent {
  timestamp: string;
  type: "started" | "progress" | "tool_use" | "error" | "completed" | "escalation" | "text" | "verdict";
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
