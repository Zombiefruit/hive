import { BrowserWindow } from "electron";
import { askBridge, isBridgeReady } from "../mcp-bridge";
import { getAllAgents, getAllContextRefs } from "../db/database";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface PollNotification {
  id: string;
  source: "slack" | "linear" | "github" | "notion" | "email";
  priority: "actionable" | "fyi" | "noise";
  status: "new" | "in_progress" | "done" | "dismissed";
  title: string;
  summary: string;
  url?: string;
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

export function startPolling(): void {
  if (pollInterval) return;
  logPoll("startPolling called");
  loadCachedNotifications();
  broadcastNotifications();

  // First poll after 20s (give MCP Bridge time to initialize)
  setTimeout(() => poll(), 20000);
  // Then every 2 minutes
  pollInterval = setInterval(() => poll(), 120000);
}

export function stopPolling(): void {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

export function getNotifications(): PollNotification[] {
  return notifications.filter(n => n.status !== "dismissed" && n.status !== "done");
}

export function clearAllNotifications(): void {
  notifications.length = 0;
  saveCacheToFile();
  broadcastNotifications();
}

export function forcePoll(): void {
  poll();
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

  if (!isBridgeReady()) {
    logPoll("Bridge not ready, waiting...");
    isPolling = false;
    return;
  }

  // Don't seed from context refs — only use real triage results

  try {
    // Ask the bridge to check for notifications using natural language
    const prompt = `You are a smart notification triage agent for Kieran Williams (kwilliams, Slack U02PKBZSB9Q, Linear kwilliams, team Vector at Monte Carlo Data).

Your job is to find things that GENUINELY NEED Kieran's attention. Not everything — only actionable items.

## What to check
1. **Slack**: Search for DMs and @mentions of <@U02PKBZSB9Q> in the last 4 hours
2. **Linear**: Issues assigned to kwilliams — ONLY "In Progress", "Todo", or "Backlog" status. SKIP anything marked Done/Completed/Cancelled.
3. **GitHub**: Open PR review requests where Kieran is a reviewer
4. **Gmail**: Check for unread emails in the last 4 hours
5. **Notion**: Check for recent mentions or page updates

## What counts as ACTIONABLE (include these)
- Someone directly asked Kieran a question and is waiting for a reply
- A PR needs Kieran's review and hasn't been reviewed yet
- A Linear ticket is assigned to Kieran and is In Progress or Todo (NOT Done)
- An important email that needs a response
- A Slack DM that needs a reply

## What to SKIP (do NOT include)
- Completed/Done/Cancelled tickets — Kieran already knows about these
- General channel announcements where Kieran was mentioned but not asked to do anything
- Automated messages, bot messages, CI notifications
- Threads where Kieran was mentioned but the conversation moved on without needing his input
- FYI-only information with no required action

## Confidence score
Rate each notification 1-10:
- 9-10: Definitely needs attention NOW (someone waiting, deadline soon)
- 7-8: Should look at today
- 5-6: Nice to know, might need action
- Below 5: Don't include it

## Output format
Return ONLY a JSON array, NOTHING else:
[{
  "source": "slack",
  "priority": "actionable",
  "confidence": 9,
  "title": "DM from Yael: deployment timeline question",
  "summary": "Yael Chemla DM'd you: 'Hey, what's the ETA on the retry logic? We're planning the Thursday deploy and need to know if it'll be ready.' She sent this 30 minutes ago and is waiting for a reply.",
  "url": "https://montecarlodata.slack.com/archives/D043DJB30DB",
  "author": "Yael Chemla",
  "action_needed": "Reply to Yael with an ETA"
}]

If nothing genuinely actionable, return: []`;

    logPoll("Asking bridge for notifications");
    const response = await askBridge(prompt, 90000);
    logPoll(`Bridge response (first 300): ${response.slice(0, 300)}`);

    // Parse JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logPoll("No JSON array in response");
      isPolling = false;
      return;
    }

    const items = JSON.parse(jsonMatch[0]) as Array<{
      source: string; priority: string; title: string; summary: string;
      url?: string; author?: string; confidence?: number; action_needed?: string;
    }>;

    logPoll(`Parsed ${items.length} notifications`);

    // Dedup by extracting a stable resource key from each notification
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
        url: item.url,
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
  }
}
