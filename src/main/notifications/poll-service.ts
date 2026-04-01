import { app, BrowserWindow } from "electron";
import { askBridge, isBridgeReady, restartBridge, addDebugEntry } from "../mcp-bridge";
import { getConfig } from "../config";
import { getPlan } from "./work-dispatcher";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DeckConfig } from "../../shared/config-types";
import { normalizePriority, extractKey as extractKeyUtil, STAGE_ORDER, CONFIDENCE_THRESHOLD, sanitizeUrl, cadenceToMs, setSlackWorkspace, getSlackBaseUrl } from "../../shared/task-utils";
import { loadSkills, loadSkillTemplate } from "../../shared/skill-loader";
import { computeLookbackHours, migrateCacheFormat, buildCachePayload } from "../../shared/poll-cache";
import { createProject, addTaskToProject, detectProjectFromSource, findProjectByName, getAllProjects, loadProjects, saveProjects } from "../../shared/project-model";

export interface PollNotification {
  id: string;
  source: "slack" | "linear" | "github" | "notion" | "email" | "manual";
  priority: "critical" | "high" | "medium" | "low" | "backlog";
  status: "new" | "in_progress" | "done" | "dismissed";
  title: string;
  summary: string;
  url?: string;
  links?: Array<{ type: string; label: string; url: string }>;
  taskType?: "implementation" | "review" | "response" | "investigation" | "planning" | "meeting_prep";
  author?: string;
  confidence?: number;
  actionNeeded?: string;
  createdAt: string;
  stage?: string;
  estimatedMinutes?: number;
  timeline?: Array<{ timestamp: string; event: string }>;
  completedAt?: string;
  pollCycle?: number; // Incremented each poll — used to detect new/modified items
  sessionId?: string;
  repoPath?: string;
  branch?: string;
  workSlug?: string;
  projectId?: string;
  parentTaskId?: string;     // if this is a subtask, points to parent
  subtaskIds?: string[];     // if this is a parent, lists child task IDs
}

// normalizePriority, extractKey, STAGE_ORDER, CONFIDENCE_THRESHOLD imported from shared/task-utils

const POLL_LOG = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "poll.log");

function logPoll(msg: string): void {
  try {
    const dir = path.dirname(POLL_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(POLL_LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

let pollInterval: ReturnType<typeof setInterval> | null = null;
const notifications: PollNotification[] = [];
let isPolling = false;
let hasCompletedFirstPoll = false;
let currentPollCycle = 0;

export function hasPolledOnce(): boolean {
  return hasCompletedFirstPoll;
}

let startPollTimeout: ReturnType<typeof setTimeout> | null = null;

export function startPolling(): void {
  if (pollInterval) return;
  logPoll("startPolling called");
  loadCachedNotifications();
  loadProjects();
  loadCachedSkipped();
  // Immediately re-save to ensure cache file exists (may have been deleted)
  saveCacheToFile();
  broadcastNotifications();

  // Cancel any pending poll from a previous startPolling call
  if (startPollTimeout) clearTimeout(startPollTimeout);

  const config = getConfig() as DeckConfig | null;
  if (config?.slackWorkspace) setSlackWorkspace(config.slackWorkspace);
  const cadence = config?.fetchCadence ?? "manual";
  const intervalMs = cadenceToMs(cadence);

  // Initial poll after bridge initializes, then schedule recurring AFTER it completes
  startPollTimeout = setTimeout(async () => {
    await poll();
    // Start recurring interval only after first poll finishes
    if (intervalMs && !pollInterval) {
      logPoll(`Setting up poll interval: ${cadence} (${intervalMs / 60000}min) — starting after first poll`);
      pollInterval = setInterval(() => poll(), intervalMs);
    }
  }, 20000);

  if (!intervalMs) {
    logPoll("Poll cadence: manual — no auto-polling");
  }
}

export function stopPolling(): void {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

let lastSkippedItems: Array<{ source?: string; title?: string; reason?: string; url?: string }> = [];

function getSkippedCachePath(): string {
  return path.join(os.homedir(), "Library", "Application Support", "claude-deck", "skipped-cache.json");
}

function loadCachedSkipped(): void {
  try {
    const raw = fs.readFileSync(getSkippedCachePath(), "utf-8");
    lastSkippedItems = JSON.parse(raw);
  } catch {}
}

function saveCachedSkipped(): void {
  try { fs.writeFileSync(getSkippedCachePath(), JSON.stringify(lastSkippedItems)); } catch {}
}

export function getNotifications(): PollNotification[] {
  // Never hide anything — all items are always visible, just in different stages
  return notifications;
}

export function getSkippedItems(): Array<{ source?: string; title?: string; reason?: string; url?: string }> {
  return lastSkippedItems;
}

export function clearAllNotifications(): void {
  notifications.length = 0;
  saveCacheToFile();
  broadcastNotifications();
}

let nextLookbackHours = 168;
let lastPollTimestamp: string | null = null;

let pendingRefresh = false;

export function forcePoll(lookbackHours?: number): void {
  if (lookbackHours) nextLookbackHours = lookbackHours;
  if (isPolling) {
    pendingRefresh = true;
    logPoll("Refresh queued — poll already in progress");
    return;
  }
  poll();
}

export function updateNotificationByTitle(titleSubstring: string, changes: Record<string, unknown>): boolean {
  const n = notifications.find(n => n.title.toLowerCase().includes(titleSubstring.toLowerCase()));
  if (!n) return false;
  Object.assign(n, changes);
  saveCacheToFile();
  broadcastNotifications();
  logPoll(`Updated "${n.title.slice(0, 40)}" with: ${JSON.stringify(changes)}`);
  return true;
}

/**
 * Upsert a notification — if it exists, update it. If not, create it.
 * Used when skipped items (client-only IDs) are moved to a stage.
 */
export function upsertNotification(data: Record<string, unknown>): boolean {
  const id = String(data.id ?? "");
  if (!id) return false;
  const existing = notifications.find(n => n.id === id);
  if (existing) {
    Object.assign(existing, data);
  } else {
    notifications.push(data as unknown as PollNotification);
  }
  saveCacheToFile();
  broadcastNotifications();
  logPoll(`Upserted [${id.slice(0, 20)}] stage=${data.stage}`);
  return true;
}

export function createManualNotification(data: {
  title: string;
  summary: string;
  taskType: string;
  priority: string;
  estimatedMinutes?: number;
}): PollNotification {
  const notification: PollNotification = {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: "manual",
    priority: data.priority as PollNotification["priority"],
    status: "new",
    title: data.title,
    summary: data.summary,
    taskType: data.taskType as PollNotification["taskType"],
    createdAt: new Date().toISOString(),
    stage: "new",
    estimatedMinutes: data.estimatedMinutes,
  };
  notifications.unshift(notification);
  saveCacheToFile();
  broadcastNotifications();
  logPoll(`Manual notification created: "${data.title.slice(0, 40)}"`);
  return notification;
}

export function updateNotificationById(id: string, changes: Record<string, unknown>): boolean {
  logPoll(`updateNotificationById called: id=${id.slice(0, 20)}, changes=${JSON.stringify(changes)}, total notifications=${notifications.length}`);
  const n = notifications.find(n => n.id === id);
  if (!n) {
    logPoll(`  NOT FOUND! Available IDs: ${notifications.map(n => n.id.slice(0, 20)).join(", ")}`);
    return false;
  }
  // Track stage changes in timeline
  if (changes.stage && changes.stage !== n.stage) {
    if (!n.timeline) n.timeline = [];
    n.timeline.push({ timestamp: new Date().toISOString(), event: `Stage: ${n.stage ?? "new"} → ${changes.stage}` });
    // Record completion timestamp
    if (changes.stage === "done" && !n.completedAt) {
      n.completedAt = new Date().toISOString();
    }
  }
  Object.assign(n, changes);
  saveCacheToFile();
  broadcastNotifications();
  logPoll(`  Updated "${n.title.slice(0, 40)}" stage=${n.stage}`);
  return true;
}

export function dismissNotification(id: string): void {
  const n = notifications.find(n => n.id === id);
  if (n) n.status = "dismissed";
  saveCacheToFile();
  broadcastNotifications();
}

export function startWorkOnNotification(id: string): void {
  const n = notifications.find(n => n.id === id);
  if (n) n.status = "in_progress";
  saveCacheToFile();
  broadcastNotifications();
}

// Debounced broadcast — coalesces rapid updates into one IPC message per 100ms
let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
function broadcastNotifications(): void {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const active = getNotifications();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("notifications:update", active);
      }
    }
  }, 100);
}

function getCachePath(): string {
  return path.join(os.homedir(), "Library", "Application Support", "claude-deck", "notifications-cache.json");
}

function loadCachedNotifications(): void {
  try {
    const raw = fs.readFileSync(getCachePath(), "utf-8");
    const { notifications: cachedRaw, lastPollTimestamp: lpt } = migrateCacheFormat(raw);
    lastPollTimestamp = lpt;
    const cached = cachedRaw as PollNotification[];
    for (const n of cached) {
      // Normalize legacy values on load
      n.priority = normalizePriority(n.priority);
      // Fix follow_up → response (follow_up merged into response). Cast needed for legacy cached data.
      if ((n.taskType as string) === "follow_up") n.taskType = "response" as PollNotification["taskType"];
      if (n.stage === "follow_up") n.stage = "new";
      // Fix response/meeting_prep tasks stuck in agent-only stages
      if ((n.taskType === "response" || n.taskType === "meeting_prep") && n.stage === "start_work") n.stage = "preparing";
      // Sanitize URLs on load (fix cached broken URLs like "https://slack//channel/...")
      if (n.url) n.url = sanitizeUrl(n.url);
      if (n.links) n.links = n.links.filter(l => sanitizeUrl(l.url) !== undefined).map(l => ({ ...l, url: sanitizeUrl(l.url)! }));
      // Ensure all tasks have a timeline (seed if missing)
      if (!n.timeline) {
        n.timeline = [{ timestamp: n.createdAt ?? new Date().toISOString(), event: `Created from ${n.source}` }];
      }
      if (!notifications.some(e => e.id === n.id)) notifications.push(n);
    }
    // Reset orphaned planning tasks — but preserve stage if a completed plan exists
    let orphaned = 0;
    let preserved = 0;
    for (const n of notifications) {
      if (n.stage === "planning") {
        const plan = getPlan(n.id);
        if (plan && plan.conversationHistory?.length > 0) {
          // Plan exists — keep in planning stage (user can view/iterate the plan)
          preserved++;
        } else {
          // No plan — reset to inbox so user can re-trigger planning
          n.stage = "new";
          if (!n.timeline) n.timeline = [];
          n.timeline.push({ timestamp: new Date().toISOString(), event: "Reset from planning (app restarted)" });
          orphaned++;
        }
      }
    }
    if (orphaned > 0) logPoll(`Reset ${orphaned} orphaned planning tasks to inbox`);
    if (preserved > 0) logPoll(`Preserved ${preserved} planning tasks with existing plans`);

    logPoll(`Loaded ${cached.length} cached notifications`);
  } catch {}
}

// Debounced file write — coalesces rapid mutations into one write per 500ms
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveCacheToFile(): void {
  if (saveTimer) return; // Already scheduled
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(getCachePath(), buildCachePayload(notifications, lastPollTimestamp));
    } catch {}
  }, 500);
}

/** Force an immediate cache write (e.g., before app quit). */
export function flushCache(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { fs.writeFileSync(getCachePath(), buildCachePayload(notifications, lastPollTimestamp)); } catch {}
}

async function poll(): Promise<void> {
  if (isPolling) return;
  isPolling = true;
  currentPollCycle++;
  logPoll(`poll starting (cycle ${currentPollCycle})`);

  // Broadcast that polling started so UI shows loading
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("notifications:polling-started");
  }

  if (!isBridgeReady()) {
    logPoll("Bridge not ready, waiting up to 60s...");
    const waitStart = Date.now();
    while (!isBridgeReady() && Date.now() - waitStart < 60000) {
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!isBridgeReady()) {
      logPoll("Bridge still not ready after 60s — restarting bridge and retrying");
      try {
        await restartBridge();
        // Wait another 60s for the restarted bridge
        const retryStart = Date.now();
        while (!isBridgeReady() && Date.now() - retryStart < 60000) {
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err) {
        logPoll(`Bridge restart failed: ${String(err)}`);
      }
      if (!isBridgeReady()) {
        logPoll("Bridge still not ready after restart — aborting poll");
        isPolling = false;
        return;
      }
      logPoll("Bridge recovered after restart");
    }
    logPoll("Bridge became ready after waiting");
  }

  // Don't seed from context refs — only use real triage results

  try {
    let hours: number;
    if (nextLookbackHours !== 168) {
      hours = nextLookbackHours;
      nextLookbackHours = 168;
    } else {
      hours = computeLookbackHours(lastPollTimestamp);
    }
    logPoll(`Polling (lookback: ${hours}h)`);

    // Compute date cutoff for search queries
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const cutoffStr = cutoffDate.toISOString().split("T")[0]; // YYYY-MM-DD
    const slackAfter = cutoffStr; // Slack search supports "after:YYYY-MM-DD"

    // Load user config — all source prompts are built from this
    const config = getConfig() as DeckConfig | null;
    const userName = config?.name ?? "User";
    const userSlackId = config?.slackUserId ?? "";
    const linearUser = config?.linearUsername ?? "";
    const managerName = config?.managerName ?? "";
    const teamName = config?.teamName ?? "";
    const tz = config?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const channels = config?.slackChannels ?? [];
    const integrations = config?.integrations ?? { slack: true, linear: true, gmail: false, calendar: false, notion: false, github: true };
    const coworkers = config?.coworkers ?? [];

    // Build manager Slack search if we know the manager's Slack ID
    const managerCoworker = coworkers.find(c => c.role === "manager");
    const managerSlackId = managerCoworker?.slackUserId ?? "";

    // Build coworker priority rules for triage
    const coworkerRules = [
      ...(managerName ? [`- ${managerName} (manager) direct ask = critical priority, confidence 10`] : []),
      ...coworkers
        .filter(c => c.role !== "manager")
        .map(c => `- ${c.name} (${c.role}) direct ask = ${c.role === "lead" ? "critical" : c.role === "pm" ? "high" : "high"} priority`),
    ].join("\n");

    // PASS 1: Fetch ALL sources in a SINGLE prompt.
    // Claude Code parallelizes tool calls within a turn — one prompt fires off
    // Slack, Linear, Calendar, Gmail, Notion calls simultaneously.
    logPoll("Pass 1: Fetching all sources (single prompt, model parallelizes tools)");

    // Build the combined fetch prompt from enabled integrations
    const fetchSections: string[] = [];
    const enabledSourceNames: string[] = [];

    if (integrations.slack && userSlackId) {
      enabledSourceNames.push("Slack");
      const slackLimit = 100;
      const channelList = channels.map(ch => `- slack_read_channel: channel_id "${ch.id}" (${ch.name}), limit ${slackLimit}`).join("\n");
      const slackSearches = [
        `- slack_search_public_and_private: query "<@${userSlackId}> after:${slackAfter}"`,
        `- slack_search_public_and_private: query "to:${userSlackId} after:${slackAfter}"`,
        ...(managerSlackId ? [`- slack_search_public_and_private: query "from:<@${managerSlackId}> after:${slackAfter}" (messages from ${managerName || "manager"})`] : []),
      ].join("\n");
      const slackSkill = loadSkillTemplate("fetch-slack", {
        SLACK_LIMIT: String(slackLimit),
        USER_NAME: userName,
        USER_SLACK_ID: userSlackId,
        CHANNEL_LIST: channelList,
        SLACK_BASE_URL: getSlackBaseUrl(),
      });
      fetchSections.push(`## SLACK\n${slackSearches}\n${channelList}\n${slackSkill}`);
    }

    if (integrations.linear && linearUser) {
      enabledSourceNames.push("Linear");
      const linearLimit = hours > 48 ? 250 : 100;
      const linearSkill = loadSkillTemplate("fetch-linear", {
        LINEAR_USER: linearUser,
        LINEAR_LIMIT: String(linearLimit),
        TEAM_NAME: config?.teamName ?? "Vector",
        LINEAR_TEAM_LIMIT: String(Math.round(linearLimit / 2)),
      });
      fetchSections.push(`## LINEAR\n${linearSkill}`);
    }

    if (integrations.calendar) {
      enabledSourceNames.push("Calendar");
      const calSkill = loadSkillTemplate("fetch-calendar", {
        CURRENT_TIME: new Date().toISOString(),
      });
      fetchSections.push(`## CALENDAR\n${calSkill}`);
    }

    if (integrations.gmail) {
      enabledSourceNames.push("Gmail");
      const gmailLimit = hours > 48 ? 50 : 30;
      const gmailSkill = loadSkillTemplate("fetch-gmail", {
        GMAIL_NEWER: hours <= 24 ? "1d" : hours <= 48 ? "2d" : "7d",
        GMAIL_LIMIT: String(gmailLimit),
      });
      fetchSections.push(`## GMAIL\n${gmailSkill}`);
    }

    if (integrations.notion) {
      enabledSourceNames.push("Notion");
      const notionSkill = loadSkillTemplate("fetch-notion", {
        USER_NAME: userName,
      });
      fetchSections.push(`## NOTION\n${notionSkill}`);
    }

    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) win.webContents.send("notifications:polling-progress", {
          source: `Fetching ${enabledSourceNames.join(", ")}`,
          current: 1,
          total: 2, // fetch + triage
        });
      } catch {}
    }

    const fetchPrompt = `Fetch data from ALL of these sources. Execute all API calls — do not skip any. Call tools in parallel where possible.

${fetchSections.join("\n\n")}

RULES:
- Only include data from after ${cutoffStr}
- Return ALL results as plain text, organized by source with ## headers
- Be thorough and complete — include everything relevant
- NEVER add commentary like "Let me compile..." or "I have enough data..." — return ONLY the data itself`;

    const fetchStart = Date.now();
    logPoll(`  Sending combined fetch prompt for: ${enabledSourceNames.join(", ")}`);
    addDebugEntry("in", `📤 Fetching all: ${enabledSourceNames.join(", ")}`, "fetch");

    let rawData = "";
    try {
      rawData = await askBridge(fetchPrompt); // no timeout — let the agent finish
      logPoll(`  Fetch complete: ${rawData.length} chars`);
      addDebugEntry("out", `✅ All sources: ${rawData.length} chars`, "fetch");
    } catch (err) {
      logPoll(`  Fetch ERROR: ${String(err).slice(0, 100)}`);
      addDebugEntry("out", `❌ Fetch error: ${String(err).slice(0, 100)}`, "fetch");
    }

    const fetchElapsed = Date.now() - fetchStart;
    logPoll(`Pass 1 complete: ${rawData.length} chars in ${(fetchElapsed / 1000).toFixed(1)}s`);

    // No bridge restart needed — triage prompt includes all raw data explicitly.
    // Removing the restart saves 60s per poll cycle.

    logPoll("Pass 2: Triaging raw data");
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("notifications:polling-progress", {
        source: "Triaging",
        current: 2,
        total: 2,
      });
    }

    // Build existing tasks summary for dedup — include IDs, URLs, and links so the AI can match
    const existingOpen = notifications.filter(n => n.stage !== "skipped" && n.stage !== "done");
    const existingTasksSummary = existingOpen
      .slice(0, 30) // Cap at 30 to avoid token overflow
      .map(n => {
        const urls: string[] = [];
        if (n.url) urls.push(n.url);
        if (n.links) for (const l of n.links) { if (l.url && !urls.includes(l.url)) urls.push(l.url); }
        const urlStr = urls.length > 0 ? ` urls=[${urls.join(", ")}]` : "";
        const lastTimeline = n.timeline?.length ? ` last_update="${n.timeline[n.timeline.length - 1].event}"` : "";
        return `- ID="${n.id}" [${n.source}] "${n.title}" (${n.priority}, stage: ${n.stage ?? "new"})${urlStr}${lastTimeline}`;
      })
      .join("\n");

    const now = new Date();
    const localTime = now.toLocaleString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    // Load triage skills from .claude/skills/
    const triageSkills = loadSkills(["triage-rules", "triage-output-format", "triage-linking"]);

    const triagePrompt = `You are ${userName}'s personal assistant. Current time: ${now.toISOString()} (${localTime} ${tz}).

${userName}'s timezone is ${tz}. All meeting times must be evaluated relative to this timezone. If a meeting has ALREADY PASSED in ${tz}, do NOT flag it as needing prep.
${managerName ? `${userName}'s manager is ${managerName}. Direct asks from ${managerName} = critical priority.` : ""}

Here is everything from ${enabledSourceNames.join(", ")}:

---
${rawData}
---
${existingTasksSummary ? `
## EXISTING TASKS (already tracked)
${existingTasksSummary}
` : ""}
${(() => {
      const projects = getAllProjects().filter(p => p.tasks.length > 0);
      if (projects.length === 0) return "";
      const projectsSummary = projects.map(p => `- "${p.name}" (${p.source}, ${p.tasks.length} tasks)`).join("\n");
      return `## EXISTING PROJECTS
${projectsSummary}

IMPORTANT: Assign tasks to these existing projects by name. Do NOT create duplicate projects. If a task fits an existing project, use that project's exact name in the "project" field.
`;
    })()}
Process this like ${userName} would going through their inbox.

${triageSkills}

## Context-Specific Rules
${coworkerRules || "- Manager direct ask = critical priority, confidence 10"}
- Unread thread where ${userName} was tagged = high priority, confidence 8+
- The user's Slack user ID is ${userSlackId ?? "unknown"}.
- ${userName}'s manager is ${managerName || "unknown"}.

## CRITICAL: Task Type Classification
- **response**: Any DM, thread, or message where someone asked ${userName} something and they haven't replied. ANY unanswered message directed at ${userName} = response type. This includes: DMs, @mentions, "could you look at", "when can you", "thoughts on", thread replies asking for input.
- **meeting_prep**: Calendar events happening in the future that ${userName} is attending.
- **review**: PR reviews assigned to or requested from ${userName}. Code review requests.
- **implementation**: Linear tickets assigned to ${userName} that require building/coding.
- **investigation**: Tasks that need research/analysis before building.
- DO NOT classify everything as implementation. A DM asking "can you take a look?" is a RESPONSE, not an implementation task.`;

    const response = await askBridge(triagePrompt); // no timeout — let the agent finish
    logPoll(`Poll complete: ${response.length} chars`);
    logPoll(`Response (first 300): ${response.slice(0, 300)}`);

    // Strip markdown code blocks if present
    let cleanResponse = response;
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) cleanResponse = codeBlockMatch[1];

    // Try to parse as {actionable, skipped} object first, then fall back to array
    let actionableItems: unknown[] = [];
    let followUpItems: unknown[] = [];
    let updateItems: Array<{ existing_id: string; changes: Record<string, unknown>; timeline_event?: string }> = [];
    let skippedItems: Array<{ source?: string; title?: string; reason?: string; url?: string }> = [];
    let triageProjects: Array<{ name: string; source: string; source_id?: string; reason?: string; related_channels?: string[]; related_tickets?: string[] }> = [];

    const objMatch = cleanResponse.match(/\{[\s\S]*"actionable"[\s\S]*\}/);
    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]);
        actionableItems = parsed.actionable ?? [];
        updateItems = parsed.updates ?? [];
        followUpItems = parsed.follow_up ?? [];
        skippedItems = parsed.skipped ?? [];
        triageProjects = parsed.projects ?? [];
        logPoll(`Parsed: ${actionableItems.length} new, ${updateItems.length} updates, ${followUpItems.length} follow-up, ${skippedItems.length} skipped, ${triageProjects.length} projects`);
        for (const s of skippedItems) {
          logPoll(`  SKIPPED: [${s.source}] ${s.title} — ${s.reason}`);
        }
      } catch {}
    }

    // Fallback: try parsing as a plain JSON array
    if (actionableItems.length === 0) {
      const jsonMatch = cleanResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logPoll("No JSON found in response");
        isPolling = false;
        return;
      }
      try {
        actionableItems = JSON.parse(jsonMatch[0]);
      } catch {
        logPoll("Failed to parse JSON array");
        isPolling = false;
        return;
      }
    }

    const items = actionableItems as Array<{
      source: string; priority: string; title: string; summary: string;
      url?: string; links?: Array<{ type: string; label: string; url: string }>;
      task_type?: string; author?: string; confidence?: number; action_needed?: string;
      project?: string; project_source?: string; project_source_id?: string;
      parent_task?: boolean; subtasks?: Array<{ title: string; repo_hint?: string; summary?: string }>;
    }>;

    // Also parse follow-up items with same shape
    const followItems = followUpItems as typeof items;
    logPoll(`Parsed ${items.length} actionable, ${followItems.length} follow-up notifications`);
    lastSkippedItems = skippedItems;
    saveCachedSkipped();

    // APPLY UPDATES to existing notifications (from the "updates" array)
    let updated = 0;
    for (const upd of updateItems) {
      if (!upd.existing_id || !upd.changes) continue;
      const existing = notifications.find(n => n.id === upd.existing_id);
      if (!existing) {
        logPoll(`  UPDATE: id=${upd.existing_id} not found — skipping`);
        continue;
      }
      const changes = upd.changes;
      // Don't downgrade priority when marking done — keep original priority for display
      if (changes.priority && typeof changes.priority === "string") {
        const newPri = normalizePriority(changes.priority);
        const isDoneTransition = changes.stage === "done";
        if (!isDoneTransition) existing.priority = newPri;
      }
      if (changes.stage && typeof changes.stage === "string") {
        const currentOrder = STAGE_ORDER[existing.stage ?? "new"] ?? 0;
        const newOrder = STAGE_ORDER[changes.stage] ?? 0;
        // PROTECT user-initiated stages: triage can only move tasks FORWARD or to done
        // Never regress a task that's already in-progress (preparing, start_work, hack, etc.)
        if (newOrder >= currentOrder || changes.stage === "done") {
          existing.stage = changes.stage;
        } else {
          logPoll(`  BLOCKED stage regression: "${existing.title}" ${existing.stage} → ${changes.stage} (order ${currentOrder} → ${newOrder})`);
        }
      }
      if (changes.summary && typeof changes.summary === "string") existing.summary = changes.summary;
      if (changes.action_needed && typeof changes.action_needed === "string") existing.actionNeeded = changes.action_needed;
      if (changes.confidence && typeof changes.confidence === "number") existing.confidence = changes.confidence;
      if (changes.task_type && typeof changes.task_type === "string") existing.taskType = changes.task_type as PollNotification["taskType"];
      if (changes.url && typeof changes.url === "string") {
        const sanitized = sanitizeUrl(changes.url);
        if (sanitized) existing.url = sanitized;
      }
      if (Array.isArray(changes.links)) {
        const newLinks = (changes.links as Array<{ type: string; label: string; url: string }>)
          .filter(l => l.url && sanitizeUrl(l.url) !== undefined)
          .map(l => ({ ...l, url: sanitizeUrl(l.url)! }));
        if (newLinks.length > 0) existing.links = newLinks;
      }
      // Append timeline event if provided
      if (upd.timeline_event && typeof upd.timeline_event === "string") {
        if (!existing.timeline) existing.timeline = [];
        // Avoid duplicate events
        const lastEvent = existing.timeline[existing.timeline.length - 1];
        if (!lastEvent || lastEvent.event !== upd.timeline_event) {
          existing.timeline.push({ timestamp: new Date().toISOString(), event: upd.timeline_event });
        }
      }
      existing.pollCycle = currentPollCycle; // Mark as modified this cycle
      updated++;
      logPoll(`  UPDATE: "${existing.title}" — ${JSON.stringify(changes)}${upd.timeline_event ? ` | timeline: ${upd.timeline_event}` : ""}`);
    }
    if (updated > 0) {
      logPoll(`Applied ${updated} updates to existing tasks`);
    }

    // Build a set of existing keys to deduplicate new items (using shared extractKey)
    const existingKeys = new Set(notifications.map(n => extractKeyUtil({
      source: n.source,
      title: n.title,
      url: n.url,
      links: n.links,
    })));

    let added = 0;
    // Add actionable items (skip if already exists)
    for (const item of items) {
      const key = extractKeyUtil(item);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      if (item.confidence !== undefined && item.confidence < CONFIDENCE_THRESHOLD) continue;

      // Check for multi-repo parent task with subtasks
      if (item.parent_task && Array.isArray(item.subtasks) && item.subtasks.length > 0) {
        const parentId = `poll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const subtaskIds: string[] = [];

        // Create subtasks first
        for (const sub of item.subtasks as Array<{ title: string; repo_hint?: string; summary?: string }>) {
          const subId = `poll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          subtaskIds.push(subId);
          notifications.unshift({
            id: subId,
            source: item.source as PollNotification["source"],
            priority: normalizePriority(item.priority),
            status: "new",
            title: sub.title,
            summary: sub.summary ?? item.summary,
            url: sanitizeUrl(item.url),
            links: item.links?.filter(l => sanitizeUrl(l.url) !== undefined).map(l => ({ ...l, url: sanitizeUrl(l.url)! })),
            taskType: item.task_type as PollNotification["taskType"],
            author: item.author,
            confidence: item.confidence,
            actionNeeded: item.action_needed,
            createdAt: new Date().toISOString(),
            timeline: [{ timestamp: new Date().toISOString(), event: `Created as subtask of "${item.title}" (repo: ${sub.repo_hint ?? "unset"})` }],
            pollCycle: currentPollCycle,
            parentTaskId: parentId,
            repoPath: undefined, // user confirms via StartWorkModal
          });
          added++;
        }

        // Create parent task
        notifications.unshift({
          id: parentId,
          source: item.source as PollNotification["source"],
          priority: normalizePriority(item.priority),
          status: "new",
          title: item.title,
          summary: item.summary,
          url: sanitizeUrl(item.url ?? item.links?.[0]?.url),
          links: item.links?.filter(l => sanitizeUrl(l.url) !== undefined).map(l => ({ ...l, url: sanitizeUrl(l.url)! })),
          taskType: item.task_type as PollNotification["taskType"],
          author: item.author,
          confidence: item.confidence,
          actionNeeded: item.action_needed,
          createdAt: new Date().toISOString(),
          timeline: [{ timestamp: new Date().toISOString(), event: `Created from ${item.source} with ${subtaskIds.length} subtasks` }],
          pollCycle: currentPollCycle,
          subtaskIds,
        });
        added++;
        logPoll(`  Created parent "${item.title}" with ${subtaskIds.length} subtasks`);
        continue;
      }

      notifications.unshift({
        id: `poll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: item.source as PollNotification["source"],
        priority: normalizePriority(item.priority),
        status: "new",
        title: item.title,
        summary: item.summary,
        url: sanitizeUrl(item.url ?? item.links?.[0]?.url),
        links: item.links?.filter(l => sanitizeUrl(l.url) !== undefined).map(l => ({ ...l, url: sanitizeUrl(l.url)! })),
        taskType: item.task_type as PollNotification["taskType"],
        author: item.author,
        confidence: item.confidence,
        actionNeeded: item.action_needed,
        createdAt: new Date().toISOString(),
        timeline: [{ timestamp: new Date().toISOString(), event: `Created from ${item.source}: ${item.action_needed ?? item.summary?.slice(0, 80) ?? item.title}` }],
        pollCycle: currentPollCycle,
      });
      added++;
    }

    // Add follow-up items — map to "response" type (follow_up is no longer a valid type/stage)
    for (const item of followItems) {
      const key = extractKeyUtil(item);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      // Map follow_up task_type to response (follow_up was merged into response)
      const taskType = (item.task_type === "follow_up" ? "response" : item.task_type) as PollNotification["taskType"];

      notifications.push({
        id: `poll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: item.source as PollNotification["source"],
        priority: normalizePriority(item.priority),
        status: "new",
        title: item.title,
        summary: item.summary,
        url: sanitizeUrl(item.url ?? item.links?.[0]?.url),
        links: item.links?.filter(l => sanitizeUrl(l.url) !== undefined).map(l => ({ ...l, url: sanitizeUrl(l.url)! })),
        taskType: taskType,
        author: item.author,
        confidence: item.confidence,
        actionNeeded: item.action_needed,
        createdAt: new Date().toISOString(),
        stage: "new", // follow_up stage no longer exists — use "new" so it appears in inbox
        timeline: [{ timestamp: new Date().toISOString(), event: `Created from ${item.source} (follow-up)` }],
        pollCycle: currentPollCycle,
      });
      added++;
    }

    // Add skipped items as real notifications with stage "skipped"
    const inferTaskType = (source?: string, title?: string): string => {
      const t = (title ?? "").toLowerCase();
      const src = (source ?? "").toLowerCase();
      if (src === "calendar" || t.includes("meeting") || t.includes("sync") || t.includes("standup")) return "meeting_prep";
      if (t.includes("thread") || t.includes("dm") || t.includes("asked") || t.includes("replied")) return "response";
      if (src === "slack") return "response";
      if (src === "linear") return "implementation";
      if (src === "gmail" || src === "email") return "response";
      return "investigation";
    };

    for (const s of skippedItems) {
      const title = s.title ?? "Unknown";
      const key = `${s.source ?? "unknown"}:${title.toLowerCase().replace(/\s+/g, " ").trim()}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      notifications.push({
        id: `poll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: (s.source ?? "unknown") as PollNotification["source"],
        priority: "backlog" as PollNotification["priority"],
        status: "new",
        title,
        summary: s.reason ?? "",
        url: s.url,
        taskType: inferTaskType(s.source, title) as PollNotification["taskType"],
        actionNeeded: s.reason,
        createdAt: new Date().toISOString(),
        stage: "skipped",
      });
      added++;
    }

    if (added > 0 || updated > 0) {
      logPoll(`Added ${added} new, updated ${updated} existing`);
      // Save immediately after adding/updating — don't wait for consolidation/projects
      // This ensures notifications survive even if later steps fail or the app crashes
      saveCacheToFile();
    }

    // CREATE/UPDATE PROJECTS from triage output
    if (triageProjects.length > 0) {
      for (const tp of triageProjects) {
        // 1. Try exact match by source + sourceId
        let proj = tp.source_id ? detectProjectFromSource(tp.source as "linear" | "slack" | "ai", tp.source_id) : null;
        // 2. Try fuzzy name match (catches "Performance Agent" = "Performance Agent Launch" etc.)
        if (!proj) proj = findProjectByName(tp.name);
        // 3. Only create if truly new
        if (!proj) {
          proj = createProject(tp.name, tp.source as "linear" | "slack" | "ai", tp.source_id, tp.reason);
          logPoll(`Created project: "${tp.name}" (${tp.source})${tp.reason ? ` — ${tp.reason}` : ""}`);
        } else {
          logPoll(`Matched existing project: "${proj.name}" for "${tp.name}"`);
        }

        // Link ALL notifications that match this project's related tickets or channels
        const relatedTickets = new Set(tp.related_tickets ?? []);
        const relatedChannels = new Set(tp.related_channels ?? []);
        let linked = 0;

        for (const n of notifications) {
          if (n.projectId) continue; // already assigned
          if (n.stage === "skipped") continue;

          let matches = false;

          // Match by related ticket IDs in title (e.g., "VEC-24" in "VEC-24: Add chat history")
          for (const ticket of relatedTickets) {
            if (n.title.includes(ticket)) { matches = true; break; }
          }

          // Match by related channel IDs in links
          if (!matches && relatedChannels.size > 0 && n.links) {
            for (const link of n.links) {
              for (const ch of relatedChannels) {
                if (link.url?.includes(ch)) { matches = true; break; }
              }
              if (matches) break;
            }
          }

          // Match by project name in triage actionable items (for new items this cycle)
          if (!matches) {
            const newItem = [...items, ...followItems].find((it: { title?: string; project?: string }) =>
              it.title === n.title && (it as { project?: string }).project === tp.name
            );
            if (newItem) matches = true;
          }

          // Match by title keyword overlap with project name
          if (!matches) {
            const projWords = tp.name.toLowerCase().split(/\s+/);
            const titleLower = n.title.toLowerCase();
            const matchCount = projWords.filter(w => w.length > 3 && titleLower.includes(w)).length;
            if (matchCount >= 2) matches = true;
          }

          if (matches) {
            addTaskToProject(proj.id, n.id);
            n.projectId = proj.id;
            linked++;
          }
        }
        logPoll(`  Project "${tp.name}": linked ${linked} tasks (tickets: ${[...relatedTickets].join(",")}, channels: ${[...relatedChannels].join(",")})`);
      }
      logPoll(`Processed ${triageProjects.length} projects`);
    }

    // Also: auto-group existing ungrouped tasks by AI heuristic
    // Tasks with no projectId that share a Linear ticket prefix get grouped
    const ungrouped = notifications.filter(n => !n.projectId && n.stage !== "skipped" && n.stage !== "done");
    const ticketGroups = new Map<string, string[]>();
    for (const n of ungrouped) {
      const ticketMatch = n.title.match(/^([A-Z]+-\d+)/);
      if (ticketMatch) {
        const ticket = ticketMatch[1];
        if (!ticketGroups.has(ticket)) ticketGroups.set(ticket, []);
        ticketGroups.get(ticket)!.push(n.id);
      }
    }
    // If multiple tasks share a ticket prefix, group them
    for (const [ticket, taskIds] of ticketGroups) {
      if (taskIds.length >= 2) {
        let proj = detectProjectFromSource("linear", ticket);
        if (!proj) {
          proj = createProject(ticket, "ai", undefined, `Auto-grouped ${taskIds.length} tasks sharing the ${ticket} ticket prefix`);
          logPoll(`Auto-grouped ${taskIds.length} tasks under "${ticket}"`);
        }
        for (const taskId of taskIds) {
          addTaskToProject(proj.id, taskId);
          const n = notifications.find(nn => nn.id === taskId);
          if (n) n.projectId = proj.id;
        }
      }
    }

    // Save projects after processing
    if (triageProjects.length > 0 || ticketGroups.size > 0) {
      saveProjects();
    }

    // POST-TRIAGE CONSOLIDATION: merge duplicate notifications that share the same key
    // CRITICAL: Never remove a task that's in an active stage (user has started working on it)
    const PROTECTED_STAGES = new Set(["start_work", "plan_review", "hack", "ship", "code_review", "pr_feedback", "preparing", "ready"]);
    const keyToFirst = new Map<string, number>();
    const toRemove = new Set<number>();
    for (let i = 0; i < notifications.length; i++) {
      const key = extractKeyUtil({
        source: notifications[i].source,
        title: notifications[i].title,
        url: notifications[i].url,
        links: notifications[i].links,
      });
      const firstIdx = keyToFirst.get(key);
      if (firstIdx !== undefined) {
        const first = notifications[firstIdx];
        const dupe = notifications[i];
        const firstProtected = PROTECTED_STAGES.has(first.stage ?? "new");
        const dupeProtected = PROTECTED_STAGES.has(dupe.stage ?? "new");

        // If EITHER task is in a protected stage, keep the protected one, remove the other
        if (firstProtected && !dupeProtected) {
          toRemove.add(i); // remove the new dupe, keep the protected first
          logPoll(`  Consolidation: keeping protected "${first.title}" (${first.stage}), removing dupe`);
          continue;
        }
        if (dupeProtected && !firstProtected) {
          toRemove.add(firstIdx); // remove the old unprotected, keep the protected dupe
          keyToFirst.set(key, i);
          logPoll(`  Consolidation: keeping protected "${dupe.title}" (${dupe.stage}), removing old`);
          continue;
        }
        if (firstProtected && dupeProtected) {
          // Both protected — don't merge, keep both
          logPoll(`  Consolidation: BOTH protected, keeping both: "${first.title}" (${first.stage}) + "${dupe.title}" (${dupe.stage})`);
          continue;
        }

        // Neither protected — safe to merge (existing logic)
        const firstStage = STAGE_ORDER[first.stage ?? "new"] ?? 1;
        const dupeStage = STAGE_ORDER[dupe.stage ?? "new"] ?? 1;
        const [keeper, removed] = dupeStage > firstStage ? [dupe, first] : [first, dupe];
        if (!keeper.links) keeper.links = removed.links;
        else if (removed.links) {
          for (const l of removed.links) {
            if (!keeper.links.some(k => k.url === l.url)) keeper.links.push(l);
          }
        }
        if (!keeper.url && removed.url) keeper.url = removed.url;
        if (!keeper.timeline) keeper.timeline = removed.timeline;
        else if (removed.timeline) {
          for (const t of removed.timeline) {
            if (!keeper.timeline.some(k => k.event === t.event)) keeper.timeline.push(t);
          }
        }
        if (!keeper.confidence && removed.confidence) keeper.confidence = removed.confidence;
        if (!keeper.author && removed.author) keeper.author = removed.author;
        if (dupeStage > firstStage) {
          toRemove.add(firstIdx);
          keyToFirst.set(key, i);
        } else {
          toRemove.add(i);
        }
      } else {
        keyToFirst.set(key, i);
      }
    }
    if (toRemove.size > 0) {
      logPoll(`Consolidation: merged ${toRemove.size} duplicate notifications`);
      // Remove duplicates in reverse order to preserve indices
      const indices = [...toRemove].sort((a, b) => b - a);
      for (const idx of indices) {
        notifications.splice(idx, 1);
      }
    }

    lastPollTimestamp = new Date().toISOString();
    saveCacheToFile();
    broadcastNotifications();
  } catch (err) {
    logPoll(`poll ERROR: ${String(err)}`);
  } finally {
    isPolling = false;
    hasCompletedFirstPoll = true;
    broadcastNotifications();

    // Broadcast that polling is complete so UI can stop loading indicator
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("notifications:polling-finished");
    }

    // Restart the bridge to clear conversation context for next poll
    await restartBridge();

    // If a refresh was queued while we were polling, run again
    if (pendingRefresh) {
      pendingRefresh = false;
      logPoll("Running queued refresh");
      setTimeout(() => poll(), 1000);
    }
  }
}

export function getLastPollTimestamp(): string | null { return lastPollTimestamp; }
