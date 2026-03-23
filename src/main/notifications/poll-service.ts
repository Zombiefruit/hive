import { BrowserWindow } from "electron";
import { execFile } from "node:child_process";
import { getClaudeCodePath } from "../claude-path";
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
  setTimeout(() => { logPoll("first poll firing"); poll(); }, 10000);
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
  broadcastNotifications();
}

export function startWorkOnNotification(id: string): void {
  const n = notifications.find(n => n.id === id);
  if (n) n.status = "in_progress";
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

async function poll(): Promise<void> {
  if (isPolling) return;
  isPolling = true;
  logPoll("poll starting");

  try {
    const result = await runTriageViaCli();
    logPoll(`poll got ${result.length} notifications`);
    if (result.length > 0) {
      for (const n of result) {
        if (!notifications.some(existing => existing.title === n.title)) {
          notifications.unshift(n);
        }
      }
      broadcastNotifications();
    }
  } catch (err) {
    logPoll(`poll ERROR: ${String(err)}`);
  } finally {
    isPolling = false;
  }
}

/**
 * Run the triage via claude CLI directly (not the SDK which hangs in Electron).
 * Uses `claude -p "prompt" --output-format json --model haiku`
 */
function runTriageViaCli(): Promise<PollNotification[]> {
  return new Promise((resolve) => {
    const claudePath = getClaudeCodePath();
    const prompt = `Check for recent notifications for Kieran Williams (kwilliams, Slack ID U02PKBZSB9Q) from the last 2 hours. Use the available MCP tools to check:
1. Slack: search for messages mentioning <@U02PKBZSB9Q> or DMs
2. Linear: list issues assigned to kwilliams updated recently

Return ONLY a JSON array of notifications, no other text:
[{"source":"slack","priority":"actionable","title":"Short title","summary":"Brief summary","url":"https://..."}]

If nothing found, return: []`;

    logPoll("spawning claude CLI for triage");

    const child = execFile(claudePath, [
      "-p", prompt,
      "--output-format", "json",
      "--model", "claude-haiku-4-5-20251001",
      "--max-turns", "5",
      "--verbose",
    ], {
      timeout: 60000, // 60s max
      maxBuffer: 1024 * 1024,
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      if (error) {
        logPoll(`CLI error: ${error.message}`);
        resolve([]);
        return;
      }

      logPoll(`CLI stdout length: ${stdout.length}`);

      try {
        // The output-format json gives us a result object
        const result = JSON.parse(stdout);
        const text = result.result ?? stdout;

        // Extract JSON array from the response
        const jsonMatch = String(text).match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          logPoll("No JSON array found in response");
          resolve([]);
          return;
        }

        const items = JSON.parse(jsonMatch[0]) as Array<{
          source: string;
          priority: string;
          title: string;
          summary: string;
          url?: string;
        }>;

        logPoll(`Parsed ${items.length} notifications`);

        resolve(items.map(item => ({
          id: `poll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          source: item.source as PollNotification["source"],
          priority: item.priority as PollNotification["priority"],
          status: "new" as const,
          title: item.title,
          summary: item.summary,
          url: item.url,
          createdAt: new Date().toISOString(),
        })));
      } catch (parseErr) {
        logPoll(`Parse error: ${String(parseErr)}`);
        resolve([]);
      }
    });
  });
}
