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
    const prompt = `Check the following and return a JSON array of notifications for Kieran Williams (kwilliams, Slack ID U02PKBZSB9Q):

1. Search Slack for recent messages mentioning <@U02PKBZSB9Q> or DMs to me in the last 2 hours
2. List Linear issues assigned to "kwilliams" that were updated in the last 24 hours
3. Check for any GitHub PR review requests

For each item, classify priority as "actionable" (needs me to do something) or "fyi" (just informational).

Return ONLY a JSON array like this, no other text:
[{"source":"slack","priority":"actionable","title":"#team-vector: Yael asked about deployment","summary":"Thread about deployment timeline","url":"https://montecarlodata.slack.com/archives/C0AMSV2SK4Z"}]

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
      source: string; priority: string; title: string; summary: string; url?: string;
    }>;

    logPoll(`Parsed ${items.length} notifications`);

    let added = 0;
    for (const item of items) {
      if (notifications.some(n => n.title === item.title)) continue;
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
