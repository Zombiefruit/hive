/**
 * Notification polling service.
 * Spawns lightweight Haiku agents to query Slack, Linear, GitHub
 * via Claude Code's MCP connections.
 */

import { BrowserWindow } from "electron";
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import { getClaudeCodePath } from "../claude-path";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const POLL_LOG = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "poll.log");

function logPoll(msg: string): void {
  try {
    const dir = path.dirname(POLL_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(POLL_LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

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
let isPolling = false;

export function startPolling(): void {
  if (pollInterval) return;
  logPoll("startPolling called");

  // First poll after 10 seconds (let the app settle)
  setTimeout(() => { logPoll("first poll firing"); poll(); }, 10000);

  // Then every 2 minutes
  pollInterval = setInterval(() => poll(), 120000);
}

export function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
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

  try {
    const result = await runTriageAgent();
    if (result && result.length > 0) {
      for (const n of result) {
        // Deduplicate by title
        if (!notifications.some(existing => existing.title === n.title)) {
          notifications.unshift(n);
        }
      }
      broadcastNotifications();
    }
  } catch (err) {
    logPoll(`ERROR: ${String(err)}`);
  } finally {
    isPolling = false;
  }
}

/**
 * Spawn a Haiku agent to check Slack mentions, Linear assignments,
 * and GitHub review requests. Returns classified notifications.
 */
async function runTriageAgent(): Promise<PollNotification[]> {
  const prompt = `You are a notification triage agent. Check the following and report back ONLY with a JSON array of notifications. No other text.

Check these sources using the available MCP tools:

1. **Slack**: Search for recent messages mentioning @U02PKBZSB9Q (Kieran Williams) in the last 2 hours. Use slack_search_public_and_private with query "to:<@U02PKBZSB9Q>" or "<@U02PKBZSB9Q>".

2. **Linear**: Search for issues assigned to "kwilliams" that were recently updated. Use list_issues with assignee filter.

3. **GitHub**: Check for any PR review requests. Search for PRs where review is requested.

For each item found, classify as:
- "actionable" — needs Kieran to DO something (respond, review, implement)
- "fyi" — worth knowing, no action needed

Return a JSON array (and NOTHING else) like:
[{"source":"slack","priority":"actionable","title":"#team-vector: Yael asked about retry logic","summary":"Thread in #team-vector about deployment timeline","url":"https://montecarlodata.slack.com/archives/C0AMSV2SK4Z"}]

If nothing new is found, return: []`;

  try {
    const q = sdkQuery({
      prompt,
      options: {
        pathToClaudeCodeExecutable: getClaudeCodePath(),
        model: "claude-haiku-4-5-20251001",
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: 5,
        maxBudgetUsd: 0.05, // Keep costs low
      },
    });

    let fullText = "";
    for await (const message of q) {
      if (message.type === "assistant") {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content as Array<{ type: string; text?: string }>) {
            if (block.type === "text" && block.text) {
              fullText += block.text;
            }
          }
        }
      } else if (message.type === "result") {
        const result = (message as { result?: string }).result;
        if (result) fullText = result;
      }
    }

    // Parse the JSON response
    const jsonMatch = fullText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const items = JSON.parse(jsonMatch[0]) as Array<{
      source: string;
      priority: string;
      title: string;
      summary: string;
      url?: string;
    }>;

    return items.map(item => ({
      id: `poll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: item.source as PollNotification["source"],
      priority: item.priority as PollNotification["priority"],
      status: "new" as const,
      title: item.title,
      summary: item.summary,
      url: item.url,
      createdAt: new Date().toISOString(),
    }));
  } catch (err) {
    logPoll(`TRIAGE_ERROR: ${String(err)}`);
    return [];
  }
}
