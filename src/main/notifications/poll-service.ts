import { app, BrowserWindow } from "electron";
import { askBridge, isBridgeReady, restartBridge } from "../mcp-bridge";
import { getClaudeCodePath } from "../claude-path";
import { getAllAgents, getAllContextRefs } from "../db/database";
import { spawn as spawnProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * One-shot Claude Code call with MCP access via stream-json interactive mode.
 * Each call spawns its own process so they can run in parallel.
 * Waits for init (which loads MCP connectors) before sending the prompt.
 */
function askOneShot(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const claudePath = getClaudeCodePath();
    const systemPrompt = "You are a READ-ONLY data fetcher. Fetch the requested data using MCP tools and return it as plain text. Do not write, edit, or modify anything.";

    const proc = spawnProcess(claudePath, [
      "--output-format", "stream-json",
      "--input-format", "stream-json",
      "--verbose",
      "--no-chrome",
      "--model", "claude-haiku-4-5-20251001",
      "--no-session-persistence",
      "--system-prompt", systemPrompt,
    ], {
      env: { ...process.env },
      cwd: app.isPackaged ? os.homedir() : app.getAppPath(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let outputBuffer = "";
    let resultText = "";
    let done = false;
    let promptSent = false;

    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        proc.kill();
        resolve(resultText || "Request timed out");
      }
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      outputBuffer += chunk.toString("utf-8");
      const lines = outputBuffer.split("\n");
      outputBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);

          // Wait for init with MCP tools loaded, THEN send prompt
          if (msg.type === "system" && msg.subtype === "init" && !promptSent) {
            const mcpCount = ((msg.tools ?? []) as string[]).filter((t: string) => t.includes("mcp__claude_ai")).length;
            logPoll(`    [oneshot] init: ${(msg.tools ?? []).length} tools, ${mcpCount} MCP`);

            promptSent = true;
            proc.stdin?.write(JSON.stringify({
              type: "user",
              message: { role: "user", content: prompt },
              parent_tool_use_id: null,
              session_id: msg.session_id ?? "",
            }) + "\n");
          }

          if (msg.type === "result" && !done) {
            resultText = String(msg.result ?? "");
            done = true;
            clearTimeout(timeout);
            proc.kill();
            resolve(resultText);
          }
        } catch {}
      }
    });

    proc.stderr?.on("data", () => {}); // suppress

    proc.on("exit", () => {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        resolve(resultText || "Process exited without result");
      }
    });
  });
}

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

let startPollTimeout: ReturnType<typeof setTimeout> | null = null;

export function startPolling(): void {
  if (pollInterval) return;
  logPoll("startPolling called");
  loadCachedNotifications();
  loadCachedSkipped();
  broadcastNotifications();

  // Cancel any pending poll from a previous startPolling call
  if (startPollTimeout) clearTimeout(startPollTimeout);
  // Single poll on startup after bridge initializes (no automatic interval)
  startPollTimeout = setTimeout(() => poll(), 20000);
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

export function updateNotificationById(id: string, changes: Record<string, unknown>): boolean {
  logPoll(`updateNotificationById called: id=${id.slice(0, 20)}, changes=${JSON.stringify(changes)}, total notifications=${notifications.length}`);
  const n = notifications.find(n => n.id === id);
  if (!n) {
    logPoll(`  NOT FOUND! Available IDs: ${notifications.map(n => n.id.slice(0, 20)).join(", ")}`);
    return false;
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
    fs.writeFileSync(getCachePath(), JSON.stringify(notifications));
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
    logPoll("Bridge not ready, waiting up to 60s...");
    const waitStart = Date.now();
    while (!isBridgeReady() && Date.now() - waitStart < 60000) {
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!isBridgeReady()) {
      logPoll("Bridge still not ready after 60s — aborting poll");
      isPolling = false;
      return;
    }
    logPoll("Bridge became ready after waiting");
  }

  // Don't seed from context refs — only use real triage results

  try {
    const hours = nextLookbackHours;
    nextLookbackHours = 168;
    logPoll(`Polling (lookback: ${hours}h)`);

    // Compute date cutoff for search queries
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const cutoffStr = cutoffDate.toISOString().split("T")[0]; // YYYY-MM-DD
    const slackAfter = cutoffStr; // Slack search supports "after:YYYY-MM-DD"

    // PASS 1: Gather raw data — one request per source for deterministic results
    logPoll("Pass 1: Gathering raw data (per-source)");

    const sources: Array<{ name: string; prompt: string; timeoutMs: number }> = [
      {
        name: "Slack",
        timeoutMs: 240000, // 4 min — Slack is the most important source
        prompt: `You MUST execute ALL of these Slack API calls. Do not skip any.

Step 1: Use mcp__claude_ai_Slack__slack_search_public_and_private with query "<@U02PKBZSB9Q> after:${slackAfter}"
Step 2: Use mcp__claude_ai_Slack__slack_search_public_and_private with query "to:U02PKBZSB9Q after:${slackAfter}"
Step 3: Use mcp__claude_ai_Slack__slack_read_channel with channel_id "C0AMSV2SK4Z"
Step 4: Use mcp__claude_ai_Slack__slack_read_channel with channel_id "C0AMT1AGN7K"
Step 5: Use mcp__claude_ai_Slack__slack_read_channel with channel_id "C054VQW7EGG"

CRITICAL RULES:
- Only include messages from AFTER ${cutoffStr}. DISCARD anything older.
- For each message/thread: who said it, exact quote, channel name, timestamp
- HIGHEST PRIORITY: Flag any thread or DM where someone messaged Kieran (U02PKBZSB9Q) and Kieran has NOT replied yet. Mark as "NEEDS RESPONSE".
- For #agentic-engineering (C054VQW7EGG): flag actionable tips, tools, or scripts as "ACTIONABLE TIP".
- Be thorough — Slack is the most important data source. Include everything relevant.
Return ALL results as plain text.`
      },
      {
        name: "Linear",
        timeoutMs: 180000, // 3 min (60s init + 2 min fetch)
        prompt: `Use mcp__claude_ai_Linear__list_issues with assignee "kwilliams" and limit 20.

From the results, ONLY include issues where status is NOT "Done" and NOT "Canceled".

For each open issue, return: identifier (e.g. VEC-10), title, status, priority. Keep it concise — one line per issue. Return as plain text.`
      },
      {
        name: "Calendar",
        timeoutMs: 150000, // 2.5 min (60s init + 1.5 min fetch)
        prompt: `You MUST execute this Google Calendar API call.

Step 1: Use mcp__claude_ai_Google_Calendar__gcal_list_events to get events for the next 24 hours

Return for each event: title, start time, end time, attendees, location or video link. Flag any meetings in the next 2 hours. Return as plain text.`
      },
      {
        name: "Gmail",
        timeoutMs: 150000, // 2.5 min (60s init + 1.5 min fetch)
        prompt: `You MUST execute this Gmail API call.

Step 1: Use mcp__claude_ai_Gmail__gmail_search_messages with query "is:unread newer_than:${hours <= 24 ? "1d" : hours <= 48 ? "2d" : "7d"}" and limit 20

Return for each email: subject, sender name, and preview/snippet. Skip automated notifications from GitHub, Linear, Slack, Datadog, or other bots. Return as plain text.`
      },
      {
        name: "Notion",
        timeoutMs: 180000, // 3 min (60s init + 2 min fetch)
        prompt: `You MUST execute these Notion API calls. Do not skip any.

Step 1: Use mcp__claude_ai_Notion__notion-search with query "Kieran Williams"
Step 2: Use mcp__claude_ai_Notion__notion-search with query "Vector team" to find recently updated team pages

Only include pages updated after ${cutoffStr}. Return page titles, who edited them, and brief summaries. Return as plain text.`
      },
    ];

    // Fetch ALL sources in PARALLEL — each spawns its own Claude Code process
    // spawn works from Electron's Node.js (bridge proves it); processes init in parallel
    logPoll(`  Launching ${sources.length} parallel fetchers...`);
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) win.webContents.send("notifications:polling-progress", {
          source: "Fetching all sources",
          current: 1,
          total: 2,
        });
      } catch {}
    }

    const fetchPromises = sources.map(async (source) => {
      logPoll(`  [parallel] Starting: ${source.name}`);
      try {
        const result = await askOneShot(source.prompt, source.timeoutMs);
        logPoll(`  [parallel] ${source.name}: ${result.length} chars`);
        return `## ${source.name}\n${result}\n`;
      } catch (err) {
        logPoll(`  [parallel] ${source.name}: ERROR ${String(err).slice(0, 60)}`);
        return `## ${source.name}\nError: ${String(err).slice(0, 100)}\n`;
      }
    });

    const rawResults = await Promise.all(fetchPromises);
    const rawData = rawResults.join("\n---\n\n");
    logPoll(`Pass 1 complete: ${rawData.length} total chars from ${rawResults.length} sources`);

    // Restart bridge before triage to clear accumulated conversation context
    restartBridge();
    logPoll("Waiting for bridge restart before triage...");
    const triageWaitStart = Date.now();
    while (!isBridgeReady() && Date.now() - triageWaitStart < 90000) {
      await new Promise(r => setTimeout(r, 1000));
    }

    // PASS 2: Triage the raw data (fresh bridge, clean context)
    logPoll("Pass 2: Triaging raw data");
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("notifications:polling-progress", {
        source: "Triaging",
        current: sources.length + 1,
        total: sources.length + 1,
      });
    }
    const now = new Date();
    const israelTime = now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false });
    const triagePrompt = `You are Kieran Williams's personal assistant. Current time: ${now.toISOString()} (${israelTime} Israel Time / Asia/Jerusalem).

Kieran is based in ISRAEL (Asia/Jerusalem timezone, UTC+2 or UTC+3). All meeting times must be evaluated relative to Israel time. A meeting at "9am Pacific" is 7pm Israel time. If a meeting has ALREADY PASSED in Israel time, do NOT flag it as needing prep.

Here is everything from his Slack, Linear, GitHub, Gmail, Calendar, and Notion:

---
${rawData}
---

Process this like Kieran would going through his inbox.

## CRITICAL RULES

1. **VERIFY before including**: Done/merged/closed/resolved items → skip.

2. **Direct asks from managers/leads = highest priority**: Yael Chemla (manager) or team lead asks = confidence 10.

3. **Consolidate**: Slack mention + Linear ticket about same thing = ONE item with ALL links.

4. **UNREAD THREADS ARE HIGH PRIORITY**: If someone tagged/messaged Kieran in a thread and he hasn't replied, that is an actionable "response" item. Don't skip these.

5. **Classify task type**:
   - "implementation" — code work needed
   - "review" — PR needs review
   - "response" — someone messaged Kieran and expects a reply
   - "investigation" — "look into this" type request
   - "planning" — needs a plan/RFC
   - "meeting_prep" — upcoming meeting (only if it HASN'T happened yet in Israel time)
   - "follow_up" — Kieran already responded but needs to check back later (e.g., waiting for someone's reply)

6. **Timezone**: Evaluate ALL times in Israel timezone. Past meetings = skip. Upcoming = include.

7. **#agentic-engineering tips**: Actionable suggestions (scripts, tools, configs to try) = include as task_type "investigation".

Return a JSON object with THREE arrays:
{
  "actionable": [... items needing immediate action ...],
  "follow_up": [... items Kieran already handled but should recheck later (waiting for reply, monitoring, etc.) ...],
  "skipped": [... items reviewed and not relevant ...]
}

Each actionable/follow_up item:
{"source": "slack", "priority": "urgent|today|low", "confidence": 1-10, "task_type": "...", "title": "...", "summary": "...", "links": [{"type": "...", "label": "...", "url": "..."}], "author": "...", "action_needed": "..."}

Each skipped item:
{"source": "slack", "title": "Short description", "reason": "Why skipped", "url": "https://..."}

Rules:
- Manager/lead asks = confidence 10, PM (Mor Ofir) = confidence 9
- Unread thread where Kieran was tagged = confidence 8+
- Include ALL related links per item
- Sort by confidence (highest first)
- Include EVERYTHING in one of the three arrays. Nothing silently dropped.`;

    const response = await askBridge(triagePrompt, 180000); // 3 min — single combined request
    logPoll(`Poll complete: ${response.length} chars`);
    logPoll(`Response (first 300): ${response.slice(0, 300)}`);

    // Strip markdown code blocks if present
    let cleanResponse = response;
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) cleanResponse = codeBlockMatch[1];

    // Try to parse as {actionable, skipped} object first, then fall back to array
    let actionableItems: unknown[] = [];
    let followUpItems: unknown[] = [];
    let skippedItems: Array<{ source?: string; title?: string; reason?: string; url?: string }> = [];

    const objMatch = cleanResponse.match(/\{[\s\S]*"actionable"[\s\S]*\}/);
    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]);
        actionableItems = parsed.actionable ?? [];
        followUpItems = parsed.follow_up ?? [];
        skippedItems = parsed.skipped ?? [];
        logPoll(`Parsed: ${actionableItems.length} actionable, ${followUpItems.length} follow-up, ${skippedItems.length} skipped`);
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

    // Also parse follow-up items with same shape
    const followItems = followUpItems as typeof items;
    logPoll(`Parsed ${items.length} actionable, ${followItems.length} follow-up notifications`);
    lastSkippedItems = skippedItems;
    saveCachedSkipped();

    // NEVER delete existing notifications — only add new ones
    // Build a set of existing keys to deduplicate
    const existingKeys = new Set(notifications.map(n => extractKey(n)));

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

    let added = 0;
    // Add actionable items (skip if already exists)
    for (const item of items) {
      const key = extractKey(item);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
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

    // Add follow-up items with "follow_up" stage
    for (const item of followItems) {
      const key = extractKey(item);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      notifications.push({
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
        stage: "follow_up",
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

    // Broadcast that polling is complete so UI can stop loading indicator
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("notifications:polling-finished");
    }

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
