/**
 * Notification polling service.
 * Periodically checks Slack, Linear, GitHub, Notion for new items
 * relevant to Kieran, using Claude Code's MCP connections.
 *
 * For now, this is a stub that produces mock notifications.
 * Real implementation will spawn lightweight Haiku agents to:
 * 1. Query each service via MCP tools
 * 2. Classify items as actionable/fyi/noise
 * 3. Store notifications in SQLite
 */

import { BrowserWindow } from "electron";

export interface PollNotification {
  id: string;
  source: "slack" | "linear" | "github" | "notion" | "email";
  priority: "actionable" | "fyi" | "noise";
  status: "new" | "in_progress" | "done" | "dismissed";
  title: string;
  summary: string;
  url?: string;
  createdAt: string;
}

let pollInterval: ReturnType<typeof setInterval> | null = null;
const notifications: PollNotification[] = [];

/**
 * Start the notification polling service.
 * Polls each source at different intervals.
 */
export function startPolling(): void {
  if (pollInterval) return;

  // Initial poll after 5 seconds
  setTimeout(() => poll(), 5000);

  // Then every 60 seconds
  pollInterval = setInterval(() => poll(), 60000);
}

export function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

export function getNotifications(): PollNotification[] {
  return notifications;
}

export function dismissNotification(id: string): void {
  const n = notifications.find(n => n.id === id);
  if (n) n.status = "dismissed";
  broadcastNotifications();
}

export function startWorkOnNotification(id: string): void {
  const n = notifications.find(n => n.id === id);
  if (n) n.status = "in_progress";
  broadcastNotifications();
}

function broadcastNotifications(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("notifications:update", notifications.filter(n => n.status !== "dismissed" && n.status !== "done"));
    }
  }
}

async function poll(): Promise<void> {
  // TODO: Replace with real MCP tool calls
  // For now, this is a stub. In production:
  // 1. Spawn a Haiku agent with MCP tools
  // 2. Ask it to check Slack mentions, Linear tickets, GitHub PRs
  // 3. Classify each item
  // 4. Store in notifications array
  // 5. Broadcast to renderer

  // Mock: occasionally add a notification
  if (Math.random() < 0.3 && notifications.length < 10) {
    const sources = ["slack", "linear", "github", "notion", "email"] as const;
    const source = sources[Math.floor(Math.random() * sources.length)];
    const n: PollNotification = {
      id: `poll-${Date.now()}`,
      source,
      priority: Math.random() < 0.4 ? "actionable" : "fyi",
      status: "new",
      title: `[${source}] New activity detected`,
      summary: `Polling service detected new ${source} activity.`,
      createdAt: new Date().toISOString(),
    };
    notifications.unshift(n);
    broadcastNotifications();
  }
}
