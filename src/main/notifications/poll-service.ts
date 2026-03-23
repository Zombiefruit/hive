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
    logPoll("Bridge not ready, skipping poll");
    isPolling = false;
    return;
  }

  try {
    // Ask the bridge to check for notifications using natural language
    const prompt = `Check the following for Kieran Williams (kwilliams, Slack ID U02PKBZSB9Q, Linear user kwilliams, team Vector):

1. **Slack**: Search for messages mentioning <@U02PKBZSB9Q> or DMs to me in the last 2 hours. For each mention, include WHO said it and WHAT they said (quote the key part).
2. **Linear**: List issues assigned to "kwilliams" updated in the last 24 hours. Include status and any recent comments.
3. **GitHub**: Check for PR review requests directed at me.

For each item, include rich detail:
- "source": "slack" | "linear" | "github"
- "priority": "actionable" (I need to DO something) | "fyi" (just informational)
- "title": Short descriptive title
- "summary": 2-3 sentences with context. WHO is involved, WHAT they need, and WHY it matters. Include quotes from messages where relevant.
- "url": Direct link to the item
- "author": Who created/sent this (name if available)

Return ONLY a JSON array, no other text:
[{"source":"slack","priority":"actionable","title":"#team-vector: Yael asked about retry logic","summary":"Yael Chemla asked: 'Hey Kieran, what's the status on the retry logic? We need it for the Thursday deploy.' This is in the deployment planning thread.","url":"https://montecarlodata.slack.com/archives/C0AMSV2SK4Z","author":"Yael Chemla"}]

If nothing found, return: []`;

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
      source: string; priority: string; title: string; summary: string; url?: string; author?: string;
    }>;

    logPoll(`Parsed ${items.length} notifications`);

    // Dedup by source + URL (most reliable), then source + title
    const existingKeys = new Set(notifications.map(n => `${n.source}:${n.url ?? n.title}`));

    let added = 0;
    for (const item of items) {
      const key = `${item.source}:${item.url ?? item.title}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      notifications.unshift({
        id: `poll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: item.source as PollNotification["source"],
        priority: item.priority as PollNotification["priority"],
        status: "new",
        title: item.title,
        summary: item.summary,
        url: item.url,
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
