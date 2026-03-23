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
    // PASS 1: Gather all raw data from all sources
    logPoll("Pass 1: Gathering raw data from all sources");
    const gatherPrompt = `You are gathering data for Kieran Williams (kwilliams, Slack ID U02PKBZSB9Q, Linear user kwilliams, team Vector at Monte Carlo Data).

Fetch ALL of the following — don't filter anything yet, just gather:

1. **Slack**: All @mentions of <@U02PKBZSB9Q> in the last 6 hours. Also check DMs. For each message, get: who sent it, what they said (exact quote), which channel/thread, and when.

2. **Linear**: ALL issues assigned to kwilliams. For each: title, status, description summary, any recent comments, priority.

3. **GitHub**: Any open PRs where I'm a reviewer or author. Get: title, status, who requested review.

4. **Gmail**: Recent unread emails from the last 6 hours. Subject, sender, preview.

5. **Notion**: Any pages where I was recently mentioned.

Return ALL of this as a structured text report. Don't skip anything — I need the complete picture. Format it clearly with sections.`;

    const rawData = await askBridge(gatherPrompt, 120000);
    logPoll(`Pass 1 complete: ${rawData.length} chars of raw data`);

    if (rawData.length < 50) {
      logPoll("Pass 1 returned too little data, skipping Pass 2");
      isPolling = false;
      return;
    }

    // PASS 2: AI consolidation — think like Kieran going through his inbox
    logPoll("Pass 2: AI consolidation and prioritization");
    const triagePrompt = `You are Kieran's personal assistant. Here is everything from his Slack, Linear, GitHub, Gmail, and Notion from the last few hours:

---
${rawData}
---

Now, go through all of this the way Kieran would if he sat down to process his inbox. Think about:
- What actually needs a response or action from Kieran?
- What's urgent vs. can wait?
- Are there related items that should be consolidated? (e.g., a Slack mention about a Linear ticket — that's ONE action item, not two)
- What's just noise that can be ignored?

Create a PRIORITIZED action list. Each item should be a clear task with context. Consolidate related items into single actions.

Categories:
- **urgent**: Someone is blocked waiting for Kieran, or there's a deadline
- **today**: Should handle today but not immediately blocking anyone
- **low**: Can wait, but worth knowing about

Return ONLY a JSON array, nothing else:
[{
  "source": "slack",
  "priority": "urgent",
  "confidence": 9,
  "title": "Clear, actionable title",
  "summary": "2-3 sentences explaining the full context. WHO needs what, WHY it matters, WHAT Kieran should do. Quote relevant messages.",
  "url": "direct link to the item",
  "author": "Person who needs Kieran's attention",
  "action_needed": "Specific action: 'Reply to X about Y' or 'Review PR #123' or 'Start work on VEC-10'"
}]

Important:
- Consolidate related items (don't list the same thing from Slack AND Linear separately)
- Only include items where Kieran needs to DO something
- Skip completed/done items entirely
- Sort by priority (urgent first)
- If nothing needs action, return []`;

    const response = await askBridge(triagePrompt, 90000);
    logPoll(`Pass 2 complete: ${response.length} chars`);
    logPoll(`Response (first 300): ${response.slice(0, 300)}`);

    // Strip markdown code blocks if present
    let cleanResponse = response;
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) cleanResponse = codeBlockMatch[1];

    // Parse JSON array from response
    const jsonMatch = cleanResponse.match(/\[[\s\S]*\]/);
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
