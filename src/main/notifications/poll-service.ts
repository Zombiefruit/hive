import { BrowserWindow } from "electron";
import { askBridge, isBridgeReady, restartBridge } from "../mcp-bridge";
import { getAllAgents, getAllContextRefs } from "../db/database";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface PollNotification {
  id: string;
  source: "slack" | "linear" | "github" | "notion" | "email";
  priority: "actionable" | "fyi" | "noise" | "urgent" | "today" | "low";
  status: "new" | "in_progress" | "done" | "dismissed";
  title: string;
  summary: string;
  url?: string;
  links?: Array<{ type: string; label: string; url: string }>;
  taskType?: "implementation" | "review" | "response" | "investigation" | "planning";
  author?: string;
  confidence?: number;
  actionNeeded?: string;
  createdAt: string;
  stage?: string;
}

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

export function hasPolledOnce(): boolean {
  return hasCompletedFirstPoll;
}

export function startPolling(): void {
  if (pollInterval) return;
  logPoll("startPolling called");
  loadCachedNotifications();
  broadcastNotifications();

  // Single poll on startup after bridge initializes (no automatic interval)
  setTimeout(() => poll(), 20000);
}

export function stopPolling(): void {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

let lastSkippedItems: Array<{ source?: string; title?: string; reason?: string }> = [];

export function getNotifications(): PollNotification[] {
  return notifications.filter(n => n.status !== "dismissed" && n.status !== "done");
}

export function getSkippedItems(): Array<{ source?: string; title?: string; reason?: string }> {
  return lastSkippedItems;
}

export function clearAllNotifications(): void {
  notifications.length = 0;
  saveCacheToFile();
  broadcastNotifications();
}

let nextLookbackHours = 168;

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

function broadcastNotifications(): void {
  const active = getNotifications();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("notifications:update", active);
    }
  }
}

function getCachePath(): string {
  return path.join(os.homedir(), "Library", "Application Support", "claude-deck", "notifications-cache.json");
}

function loadCachedNotifications(): void {
  try {
    const raw = fs.readFileSync(getCachePath(), "utf-8");
    const cached = JSON.parse(raw) as PollNotification[];
    for (const n of cached) {
      if (!notifications.some(e => e.id === n.id)) notifications.push(n);
    }
    logPoll(`Loaded ${cached.length} cached notifications`);
  } catch {}
}

function saveCacheToFile(): void {
  try {
    fs.writeFileSync(getCachePath(), JSON.stringify(notifications.filter(n => n.status !== "dismissed")));
  } catch {}
}

async function poll(): Promise<void> {
  if (isPolling) return;
  isPolling = true;
  logPoll("poll starting");

  // Broadcast that polling started so UI shows loading
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("notifications:polling-started");
  }

  if (!isBridgeReady()) {
    logPoll("Bridge not ready, waiting...");
    isPolling = false;
    return;
  }

  // Don't seed from context refs — only use real triage results

  try {
    const hours = nextLookbackHours;
    nextLookbackHours = 168; // Reset to default after use
    logPoll(`Polling (lookback: ${hours}h)`);
    const timeDesc = hours <= 6 ? `the last ${hours} hours` : hours <= 24 ? `the last ${hours} hours` : hours <= 48 ? "the last 2 days" : "the last week";

    // Single combined prompt: gather data AND triage in one request
    const triagePrompt = `You are Kieran Williams's personal assistant (kwilliams, Slack U02PKBZSB9Q, Linear kwilliams, team Vector at Monte Carlo Data).

## Step 1: Gather data
Use your MCP tools to fetch from ALL these sources for ${timeDesc}:
- **Slack**: @mentions of <@U02PKBZSB9Q>, DMs, thread replies in threads where Kieran was mentioned, AND mentions of @frontend (team handle). Also check channels #team-vector (C0AMSV2SK4Z) and #team-vector-standup (C0AMT1AGN7K) for recent messages directed at Kieran or the frontend team
- **Linear**: Issues assigned to kwilliams (all statuses)
- **GitHub**: Open PRs where Kieran is reviewer or author (VERIFY actual state — don't include merged/closed)
- **Gmail**: Unread emails
- **Notion**: Recent mentions or spec updates
- **Google Calendar**: Events in the next 24 hours

## Step 2: Triage
After gathering all data, process it like Kieran would going through his inbox.

## CRITICAL RULES — read carefully

1. **VERIFY before including**: If a PR is mentioned, CHECK its actual status. If it's already merged/closed/approved, DO NOT include it. If a ticket is Done/Cancelled, DO NOT include it. Don't trust mentions — verify the actual state.

2. **Direct asks from managers/leads = highest priority**: If Yael Chemla (Kieran's manager) or a team lead directly asks Kieran to do something, that's confidence 10.

3. **Consolidate aggressively**: A Slack mention about a Linear ticket is ONE item, not two. A PR review request and a Slack message about the same PR is ONE item.

4. **Include ALL relevant links**: Every ticket, PR, Slack thread, and Notion doc related to the item must be listed in the "links" field. Not just one URL — ALL of them.

5. **Only OPEN/ACTIONABLE items**: If it's done, merged, closed, resolved — skip it completely.

6. **Classify task type**: Each item must have a "task_type" field:
   - "implementation" — code work needed (new feature, bug fix, ticket implementation)
   - "review" — PR needs review
   - "response" — someone messaged Kieran and expects a reply
   - "investigation" — "look into this" type request
   - "planning" — needs a plan/RFC before any work
   - "meeting_prep" — upcoming meeting that needs preparation

Return ONLY a JSON array, nothing else:
[{
  "source": "linear",
  "priority": "urgent",
  "confidence": 10,
  "task_type": "implementation",
  "title": "VEC-10: Add Fig Intelligence UI (from Yael)",
  "summary": "Your manager Yael Chemla assigned this to you today. Port the Figs and Fig Intelligence dashboard from agent-hub to the frontend app using Mantine components. Status: In Progress. She mentioned this in #team-vector as a priority for this sprint.",
  "links": [
    {"type": "linear", "label": "VEC-10", "url": "https://linear.app/issue/VEC-10"},
    {"type": "slack", "label": "#team-vector thread", "url": "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z"},
    {"type": "github", "label": "Related PR #12441", "url": "https://github.com/monte-carlo-data/frontend/pull/12441"}
  ],
  "author": "Yael Chemla",
  "action_needed": "Start implementing the Fig Intelligence UI in the frontend repo"
}]

Rules:
- VERIFY status of every PR and ticket before including — no hallucinating about open PRs that are actually merged
- Manager/lead asks = confidence 10
- Product manager (Mor Ofir) asks = confidence 9
- Include ALL related links (tickets, PRs, threads, docs) in the "links" array
- Consolidate related items into single actions
- Sort by confidence (highest first)

IMPORTANT — return TWO arrays in a JSON object:
{
  "actionable": [... items that need action ...],
  "skipped": [... items you considered but skipped, with WHY you skipped them ...]
}

The "skipped" array helps Kieran understand what you looked at. Each skipped item:
{"source": "slack", "title": "Short description", "reason": "Why it was skipped — e.g., 'Already responded', 'Ticket is Done', 'Bot message', 'No action needed'"}

Include EVERYTHING you looked at in either actionable or skipped. Nothing should be silently dropped.`;

    const response = await askBridge(triagePrompt, 180000); // 3 min — single combined request
    logPoll(`Poll complete: ${response.length} chars`);
    logPoll(`Response (first 300): ${response.slice(0, 300)}`);

    // Strip markdown code blocks if present
    let cleanResponse = response;
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) cleanResponse = codeBlockMatch[1];

    // Try to parse as {actionable, skipped} object first, then fall back to array
    let actionableItems: unknown[] = [];
    let skippedItems: Array<{ source?: string; title?: string; reason?: string }> = [];

    const objMatch = cleanResponse.match(/\{[\s\S]*"actionable"[\s\S]*\}/);
    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]);
        actionableItems = parsed.actionable ?? [];
        skippedItems = parsed.skipped ?? [];
        logPoll(`Parsed object: ${actionableItems.length} actionable, ${skippedItems.length} skipped`);
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
    }>;

    logPoll(`Parsed ${items.length} actionable notifications`);
    lastSkippedItems = skippedItems;

    // Clear existing notifications — each poll is a fresh, complete picture
    notifications.length = 0;

    // Dedup within this batch by extracting a stable resource key
    function extractKey(n: { source: string; title: string; url?: string }): string {
      // Extract IDs from URLs
      if (n.url) {
        const prMatch = n.url.match(/\/pull\/(\d+)/);
        if (prMatch) return `github:pr:${prMatch[1]}`;
        const linearMatch = n.url.match(/\/issue\/([A-Z]+-\d+)/);
        if (linearMatch) return `linear:${linearMatch[1]}`;
        const slackMatch = n.url.match(/archives\/([A-Z0-9]+)/);
        if (slackMatch) return `slack:${slackMatch[1]}`;
      }
      // Extract IDs from titles
      const ticketMatch = n.title.match(/([A-Z]+-\d+)/);
      if (ticketMatch) return `${n.source}:${ticketMatch[1]}`;
      const prTitleMatch = n.title.match(/PR\s*#?(\d+)/i);
      if (prTitleMatch) return `github:pr:${prTitleMatch[1]}`;
      // Fallback to source + normalized title
      return `${n.source}:${n.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
    }

    const existingKeys = new Set(notifications.map(n => extractKey(n)));

    let added = 0;
    for (const item of items) {
      const key = extractKey(item);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      // Only include items with confidence >= 5
      if (item.confidence !== undefined && item.confidence < 5) continue;

      notifications.unshift({
        id: `poll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: item.source as PollNotification["source"],
        priority: item.priority as PollNotification["priority"],
        status: "new",
        title: item.title,
        summary: item.summary,
        url: item.url ?? item.links?.[0]?.url,
        links: item.links,
        taskType: item.task_type as PollNotification["taskType"],
        author: item.author,
        confidence: item.confidence,
        actionNeeded: item.action_needed,
        createdAt: new Date().toISOString(),
      });
      added++;
    }

    if (added > 0) {
      logPoll(`Added ${added} new notifications`);
      saveCacheToFile();
      broadcastNotifications();
    }
  } catch (err) {
    logPoll(`poll ERROR: ${String(err)}`);
  } finally {
    isPolling = false;
    hasCompletedFirstPoll = true;
    broadcastNotifications();

    // Restart the bridge to clear conversation context for next poll
    restartBridge();

    // If a refresh was queued while we were polling, run again
    if (pendingRefresh) {
      pendingRefresh = false;
      logPoll("Running queued refresh");
      setTimeout(() => poll(), 1000);
    }
  }
}
