/**
 * MCP Bridge — persistent Claude Code processes with MCP connector access.
 *
 * TWO bridges run independently:
 * - pollBridge: owned by poll-service (fetch + triage). Restarts between steps.
 * - contextBridge: owned by work-dispatcher (planning context). Never restarts mid-request.
 *
 * No process blocks another. Each bridge has its own process, session, pending requests.
 */

import { spawn, ChildProcess } from "node:child_process";
import { app } from "electron";
import { getClaudeCodePath } from "./claude-path";
import { trackProcess, untrackProcess } from "./process-monitor";
import { recordUsage } from "./usage-ledger";
import type { UsageSource } from "../shared/usage-types";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

const LOG_PATH = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "mcp-bridge.log");

function log(msg: string): void {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

// ── Shared types ──

export interface BridgeConnectorStatus {
  ready: boolean;
  mcpToolCount: number;
  connectors: {
    slack: boolean;
    linear: boolean;
    gmail: boolean;
    calendar: boolean;
    notion: boolean;
  };
  mcpServers?: Array<{ name: string; status: string }>;
}

// ── Debug log (shared across both bridges) ──

const debugLog: Array<{ timestamp: string; direction: "in" | "out"; content: string; source?: string }> = [];
const MAX_DEBUG_LOG = 200;

export function addDebugEntry(direction: "in" | "out", content: string, source?: string): void {
  if (direction === "out") {
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const readable = formatBridgeMessage(msg);
        if (readable) {
          debugLog.push({ timestamp: new Date().toISOString(), direction, content: readable, source });
          if (debugLog.length > MAX_DEBUG_LOG) debugLog.shift();
        }
      } catch {}
    }
    return;
  }
  try {
    const msg = JSON.parse(content);
    const text = msg.message?.content ?? content;
    debugLog.push({ timestamp: new Date().toISOString(), direction, content: typeof text === "string" ? text.slice(0, 1000) : JSON.stringify(text).slice(0, 1000), source });
  } catch {
    debugLog.push({ timestamp: new Date().toISOString(), direction, content: content.slice(0, 1000), source });
  }
  if (debugLog.length > MAX_DEBUG_LOG) debugLog.shift();
}

function formatBridgeMessage(msg: { type?: string; subtype?: string; message?: { content?: unknown }; result?: string; tools?: string[] }): string | null {
  if (msg.type === "system" && msg.subtype === "init") {
    const toolCount = msg.tools?.length ?? 0;
    const mcpCount = (msg.tools ?? []).filter((t: string) => t.includes("mcp__claude_ai")).length;
    return `🔧 Bridge initialized: ${toolCount} tools (${mcpCount} MCP connectors)`;
  }
  if (msg.type === "system" && (msg.subtype === "hook_started" || msg.subtype === "hook_response")) return null;
  if (msg.type === "system") return `⚙️ System: ${msg.subtype ?? "unknown"}`;
  if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
    const parts: string[] = [];
    for (const block of msg.message!.content as Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>) {
      if (block.type === "text" && block.text) parts.push(`💬 ${block.text.slice(0, 300)}`);
      if (block.type === "tool_use" && block.name) {
        const input = block.input ?? {};
        if (block.name.includes("Slack")) parts.push(`📱 Slack: ${block.name.split("__").pop()} ${JSON.stringify(input).slice(0, 100)}`);
        else if (block.name.includes("Linear")) parts.push(`📋 Linear: ${block.name.split("__").pop()} ${JSON.stringify(input).slice(0, 100)}`);
        else if (block.name.includes("Gmail")) parts.push(`📧 Gmail: ${block.name.split("__").pop()}`);
        else if (block.name.includes("Notion")) parts.push(`📝 Notion: ${block.name.split("__").pop()}`);
        else parts.push(`🔧 Tool: ${block.name}`);
      }
    }
    return parts.join("\n") || null;
  }
  if (msg.type === "result") return `✅ Result: ${String(msg.result ?? "").slice(0, 200)}`;
  return null;
}

export function getBridgeDebugLog(): typeof debugLog { return debugLog; }
export function clearBridgeDebugLog(): void { debugLog.length = 0; }

// ── Disallowed tools (shared) ──

const DISALLOWED_TOOLS = [
  "Write", "Edit", "Bash", "NotebookEdit", "Agent", "EnterWorktree", "ExitWorktree",
  "Read", "Glob", "Grep", // Prevent fetch agent from exploring local filesystem
  "mcp__claude_ai_Slack__slack_send_message", "mcp__claude_ai_Slack__slack_send_message_draft",
  "mcp__claude_ai_Slack__slack_schedule_message", "mcp__claude_ai_Slack__slack_create_canvas",
  "mcp__claude_ai_Slack__slack_update_canvas",
  "mcp__claude_ai_Linear__save_issue", "mcp__claude_ai_Linear__save_comment",
  "mcp__claude_ai_Linear__save_project", "mcp__claude_ai_Linear__save_initiative",
  "mcp__claude_ai_Linear__save_milestone", "mcp__claude_ai_Linear__save_customer",
  "mcp__claude_ai_Linear__save_customer_need", "mcp__claude_ai_Linear__save_status_update",
  "mcp__claude_ai_Linear__delete_comment", "mcp__claude_ai_Linear__delete_customer",
  "mcp__claude_ai_Linear__delete_customer_need", "mcp__claude_ai_Linear__delete_status_update",
  "mcp__claude_ai_Linear__delete_attachment", "mcp__claude_ai_Linear__create_issue_label",
  "mcp__claude_ai_Linear__create_document", "mcp__claude_ai_Linear__create_attachment",
  "mcp__claude_ai_Linear__update_document",
  "mcp__claude_ai_Notion__notion-create-pages", "mcp__claude_ai_Notion__notion-create-database",
  "mcp__claude_ai_Notion__notion-create-comment", "mcp__claude_ai_Notion__notion-update-page",
  "mcp__claude_ai_Notion__notion-move-pages", "mcp__claude_ai_Notion__notion-duplicate-page",
  "mcp__claude_ai_Notion__notion-create-view", "mcp__claude_ai_Notion__notion-update-view",
  "mcp__claude_ai_Notion__notion-update-data-source",
  "mcp__claude_ai_Gmail__gmail_create_draft",
  "mcp__claude_ai_Google_Calendar__gcal_create_event",
  "mcp__claude_ai_Google_Calendar__gcal_delete_event",
  "mcp__claude_ai_Google_Calendar__gcal_update_event",
  "mcp__claude_ai_Google_Calendar__gcal_respond_to_event",
];

const SYSTEM_PROMPT = "You are a READ-ONLY data fetcher. Rules: (1) ONLY use MCP tools (Slack, Linear, Gmail, Calendar, Notion, Gong) — never Read, Grep, Glob, or explore local files. (2) Each message is INDEPENDENT — never reference prior messages. (3) Return ONLY the requested data as plain text sections. NO commentary, NO narration, NO filesystem exploration. (4) If a tool call fails, include a one-line error note and move on. (5) If MCP tool output is large, summarize the key items — do NOT try to read the raw JSON from temp files.";

// ── Pre-approved read-only MCP tools (auto-approved, no user prompt needed) ──
// These are all read/search operations from remote MCP servers that require
// tool-permission approval in Claude Code. Without pre-approval, headless bridge
// processes silently fail because nobody can click "approve" on the permission prompt.
const ALLOWED_TOOLS = [
  // Slack (read-only)
  "mcp__claude_ai_Slack__slack_read_channel", "mcp__claude_ai_Slack__slack_read_thread",
  "mcp__claude_ai_Slack__slack_read_user_profile", "mcp__claude_ai_Slack__slack_read_canvas",
  "mcp__claude_ai_Slack__slack_search_channels", "mcp__claude_ai_Slack__slack_search_users",
  "mcp__claude_ai_Slack__slack_search_public", "mcp__claude_ai_Slack__slack_search_public_and_private",
  // Linear (read-only)
  "mcp__claude_ai_Linear__get_issue", "mcp__claude_ai_Linear__get_project",
  "mcp__claude_ai_Linear__get_team", "mcp__claude_ai_Linear__get_user",
  "mcp__claude_ai_Linear__get_document", "mcp__claude_ai_Linear__get_initiative",
  "mcp__claude_ai_Linear__get_milestone", "mcp__claude_ai_Linear__get_attachment",
  "mcp__claude_ai_Linear__get_issue_status", "mcp__claude_ai_Linear__get_status_updates",
  "mcp__claude_ai_Linear__list_issues", "mcp__claude_ai_Linear__list_projects",
  "mcp__claude_ai_Linear__list_teams", "mcp__claude_ai_Linear__list_users",
  "mcp__claude_ai_Linear__list_documents", "mcp__claude_ai_Linear__list_cycles",
  "mcp__claude_ai_Linear__list_initiatives", "mcp__claude_ai_Linear__list_milestones",
  "mcp__claude_ai_Linear__list_issue_labels", "mcp__claude_ai_Linear__list_issue_statuses",
  "mcp__claude_ai_Linear__list_project_labels", "mcp__claude_ai_Linear__list_comments",
  "mcp__claude_ai_Linear__list_customers", "mcp__claude_ai_Linear__research",
  "mcp__claude_ai_Linear__search_documentation",
  // Google Calendar (read-only)
  "mcp__claude_ai_Google_Calendar__gcal_list_events", "mcp__claude_ai_Google_Calendar__gcal_list_calendars",
  "mcp__claude_ai_Google_Calendar__gcal_get_event", "mcp__claude_ai_Google_Calendar__gcal_find_meeting_times",
  "mcp__claude_ai_Google_Calendar__gcal_find_my_free_time",
  // Gmail (read-only)
  "mcp__claude_ai_Gmail__gmail_search_messages", "mcp__claude_ai_Gmail__gmail_read_message",
  "mcp__claude_ai_Gmail__gmail_read_thread", "mcp__claude_ai_Gmail__gmail_list_labels",
  "mcp__claude_ai_Gmail__gmail_list_drafts", "mcp__claude_ai_Gmail__gmail_get_profile",
  // Notion (read-only)
  "mcp__claude_ai_Notion__notion-search", "mcp__claude_ai_Notion__notion-fetch",
  "mcp__claude_ai_Notion__notion-get-comments", "mcp__claude_ai_Notion__notion-get-teams",
  "mcp__claude_ai_Notion__notion-get-users", "mcp__claude_ai_Notion__notion-query-data-sources",
  "mcp__claude_ai_Notion__notion-query-meeting-notes",
  // Gong (read-only)
  "mcp__claude_ai_Gong__list_calls", "mcp__claude_ai_Gong__get_call_details",
  "mcp__claude_ai_Gong__get_call_transcript", "mcp__claude_ai_Gong__get_call_stats",
  "mcp__claude_ai_Gong__list_users", "mcp__claude_ai_Gong__search_calls",
  // ToolSearch needed to discover MCP tools
  "ToolSearch",
];

const MIN_EXPECTED_MCP_TOOLS = 85;

// ═══════════════════════════════════════════════════════════════
// BRIDGE FACTORY — creates independent bridge instances
// ═══════════════════════════════════════════════════════════════

export interface BridgeInstance {
  start: () => void;
  ask: (prompt: string, timeoutMs?: number) => Promise<string>;
  isReady: () => boolean;
  restart: () => Promise<void>;
  stop: () => void;
  getStatus: () => BridgeConnectorStatus;
  label: string;
}

export function createBridge(label: string, model = "claude-opus-4-6[1m]"): BridgeInstance {
  let bridgeProcess: ChildProcess | null = null;
  let sessionId = "";
  let isReady = false;
  let generation = 0;
  // (initResultPending removed — orphan results are now discarded by checking pendingRequests.size)
  let outputBuffer = "";
  let pendingRequests = new Map<string, { resolve: (text: string) => void; timeout: ReturnType<typeof setTimeout> | null; startTs: number }>();
  let connectorStatus: BridgeConnectorStatus = {
    ready: false, mcpToolCount: 0,
    connectors: { slack: false, linear: false, gmail: false, calendar: false, notion: false },
  };

  function processOutput(): void {
    const lines = outputBuffer.split("\n");
    outputBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "system" && msg.subtype === "init") {
          sessionId = msg.session_id ?? "";
          const allTools: string[] = msg.tools ?? [];
          const mcpTools = allTools.filter((t: string) => t.includes("mcp__claude_ai"));
          // Capture MCP server list from init message
          const mcpServers = (msg.mcp_servers as Array<{ name: string; status: string }> | undefined) ?? [];
          connectorStatus = {
            ready: true, mcpToolCount: mcpTools.length,
            connectors: {
              slack: mcpTools.some((t: string) => t.includes("Slack")),
              linear: mcpTools.some((t: string) => t.includes("Linear")),
              gmail: mcpTools.some((t: string) => t.includes("Gmail")),
              calendar: mcpTools.some((t: string) => t.includes("Google_Calendar")),
              notion: mcpTools.some((t: string) => t.includes("Notion")),
            },
            mcpServers,
          };
          isReady = true;
          log(`[${label}] Initialized: ${allTools.length} tools, ${mcpTools.length} MCP`);
        }
        if (msg.type === "result") {
          const resultText = String(msg.result ?? "");
          // Only deliver results to pending requests. Discard any result
          // that arrives without a pending request — these come from the init
          // message, compaction, hooks, or other non-request output.
          if (pendingRequests.size === 0) {
            log(`[${label}] Discarding orphan result (${resultText.length} chars, no pending request)`);
            continue;
          }
          log(`[${label}] Result: ${resultText.length} chars`);
          for (const [reqId, req] of pendingRequests) {
            if (req.timeout) clearTimeout(req.timeout);
            try {
              recordUsage({
                timestamp: new Date().toISOString(),
                source: "poll-bridge",
                model,
                inputTokens: msg.usage?.input_tokens ?? 0,
                outputTokens: msg.usage?.output_tokens ?? 0,
                costUsd: msg.total_cost_usd ?? 0,
                durationMs: Date.now() - req.startTs,
                label: `bridge:${label}`,
              });
            } catch {}
            req.resolve(resultText);
            pendingRequests.delete(reqId);
            break;
          }
        }
      } catch {}
    }
  }

  const instance: BridgeInstance = {
    label,

    start() {
      if (bridgeProcess) return;
      generation++;
      const claudePath = getClaudeCodePath();
      log(`[${label}] Starting bridge`);

      bridgeProcess = spawn(claudePath, [
        "--output-format", "stream-json",
        "--verbose",
        "--input-format", "stream-json",
        "--no-chrome",
        "--model", model,
        "--no-session-persistence",
        "--allowedTools", ALLOWED_TOOLS.join(","),
        "--disallowedTools", DISALLOWED_TOOLS.join(","),
        "--system-prompt", SYSTEM_PROMPT,
      ], {
        cwd: app.isPackaged ? os.homedir() : app.getAppPath(),
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (bridgeProcess.pid) trackProcess(bridgeProcess.pid, "poll-bridge", label);

      bridgeProcess.stdout?.on("data", (chunk: Buffer) => {
        addDebugEntry("out", chunk.toString("utf-8"), label);
        outputBuffer += chunk.toString("utf-8");
        processOutput();
      });

      bridgeProcess.stderr?.on("data", (chunk: Buffer) => {
        log(`[${label}] STDERR: ${chunk.toString("utf-8").slice(0, 200)}`);
      });

      // Send an initial message to trigger Claude Code initialization.
      // Without this, --input-format stream-json waits for the first message
      // before emitting the system/init event.
      // No init message needed — the 60s fallback marks the bridge ready.
      // Sending an init message caused orphan results that corrupted real requests.

      const startGen = generation;
      bridgeProcess.on("exit", (code) => {
        if (bridgeProcess?.pid) untrackProcess(bridgeProcess.pid);
        log(`[${label}] Exited (code ${code})`);
        bridgeProcess = null;
        isReady = false;
        // Resolve all pending requests with an error so callers don't hang forever
        for (const [reqId, req] of pendingRequests) {
          if (req.timeout) clearTimeout(req.timeout);
          req.resolve(`Bridge process exited (code ${code})`);
          log(`[${label}] Rejected pending request ${reqId.slice(0, 8)} due to exit`);
        }
        pendingRequests.clear();
        if (startGen === generation) {
          log(`[${label}] Unexpected exit — auto-restarting in 5s`);
          setTimeout(() => instance.start(), 5000);
        }
      });

      // Fallback: mark ready after 60s if init never arrives
      const gen = generation;
      setTimeout(() => {
        if (gen === generation && bridgeProcess && !isReady) {
          isReady = true;
          log(`[${label}] Marked ready (60s fallback)`);
        }
      }, 60000);
    },

    async ask(prompt: string, timeoutMs?: number): Promise<string> {
      // Wait for ready
      const waitStart = Date.now();
      while (!instance.isReady() && Date.now() - waitStart < 90000) {
        await new Promise(r => setTimeout(r, 500));
      }

      return new Promise((resolve) => {
        if (!bridgeProcess || !bridgeProcess.stdin) {
          resolve(`[${label}] Bridge not running`);
          return;
        }
        if (!isReady) {
          resolve(`[${label}] Bridge still initializing after 90s`);
          return;
        }

        const reqId = randomUUID();
        log(`[${label}] Request ${reqId.slice(0, 8)}: ${prompt.slice(0, 100)}`);

        const reqStartTs = Date.now();
        const timeout = timeoutMs ? setTimeout(() => {
          pendingRequests.delete(reqId);
          log(`[${label}] Request ${reqId.slice(0, 8)} timed out after ${timeoutMs}ms`);
          resolve("Request timed out");
        }, timeoutMs) : null;

        pendingRequests.set(reqId, { resolve, timeout, startTs: reqStartTs });

        const message = JSON.stringify({
          type: "user",
          message: { role: "user", content: prompt },
          parent_tool_use_id: null,
          uuid: reqId,
          session_id: sessionId,
        });

        addDebugEntry("in", message, label);
        bridgeProcess.stdin.write(message + "\n");
      });
    },

    isReady() {
      return isReady && bridgeProcess !== null;
    },

    async restart(): Promise<void> {
      log(`[${label}] Restarting`);
      instance.stop();
      await new Promise(r => setTimeout(r, 1000));
      instance.start();
    },

    stop() {
      generation++;
      if (bridgeProcess) {
        if (bridgeProcess.pid) untrackProcess(bridgeProcess.pid);
        bridgeProcess.kill();
        bridgeProcess = null;
        isReady = false;
        // Preserve last known connector status across restarts — only mark bridge as not ready
        // Connectors will be updated when the new process initializes
        connectorStatus = { ...connectorStatus, ready: false };
        log(`[${label}] Stopped`);
      }
    },

    getStatus() {
      return { ...connectorStatus, ready: instance.isReady() };
    },
  };

  return instance;
}

// ═══════════════════════════════════════════════════════════════
// TWO BRIDGE INSTANCES
// ═══════════════════════════════════════════════════════════════

/** Poll bridge — owned EXCLUSIVELY by poll-service (fetch + triage). */
export const pollBridge = createBridge("poll");

/** Context bridge — owned EXCLUSIVELY by work-dispatcher (planning context). */
export const contextBridge = createBridge("context");

/** Fetch bridge — lightweight fetch using Haiku. */
export const fetchBridge = createBridge("fetch", "claude-haiku-4-5");

// ── Backward-compatible exports (for gradual migration) ──

export function startBridge(): void { pollBridge.start(); }
export function askBridge(prompt: string, timeoutMs?: number): Promise<string> { return pollBridge.ask(prompt, timeoutMs); }
export function isBridgeReady(): boolean { return pollBridge.isReady(); }
export async function restartBridge(): Promise<void> { return pollBridge.restart(); }
export function stopBridge(): void { pollBridge.stop(); }
export function getBridgeStatus(): BridgeConnectorStatus { return pollBridge.getStatus(); }

// ── Fetch bridge exports ──

export function startFetchBridge(): void { fetchBridge.start(); }
export function askFetchBridge(prompt: string, timeoutMs?: number): Promise<string> { return fetchBridge.ask(prompt, timeoutMs); }
export function isFetchBridgeReady(): boolean { return fetchBridge.isReady(); }
export async function restartFetchBridge(): Promise<void> { return fetchBridge.restart(); }
export function stopFetchBridge(): void { fetchBridge.stop(); }

// ═══════════════════════════════════════════════════════════════
// MCP PLANNING AGENT — single agent with full MCP tool access
// ═══════════════════════════════════════════════════════════════

export interface PlanningEvent {
  type: "init" | "tool_use" | "text" | "result" | "error" | "status";
  content: string;
  timestamp: string;
}

/**
 * Spawn a fresh Claude Code process WITH MCP tools.
 * The agent can read from Slack, Linear, Notion, GitHub, etc.
 * Write/edit/send tools are blocked.
 * ~60s MCP init time is expected and acceptable.
 *
 * @param onEvent — optional callback for streaming real-time events to the UI
 */
export function askMcpPlanningAgent(
  prompt: string,
  _timeoutMs?: number, // DEPRECATED — kept for signature compat; inactivity timeout used instead
  onEvent?: (event: PlanningEvent) => void,
  model = "claude-opus-4-6[1m]",
): Promise<string> {
  return new Promise((resolve) => {
    const claudePath = getClaudeCodePath();

    const proc = spawn(claudePath, [
      "--output-format", "stream-json",
      "--verbose",
      "--input-format", "stream-json",
      "--no-chrome",
      "--model", model,
      "--no-session-persistence",
      "--allowedTools", ALLOWED_TOOLS.join(","),
      "--disallowedTools", DISALLOWED_TOOLS.join(","),
      "--system-prompt", "You are a READ-ONLY planning agent. You have MCP tools to fetch context from Slack, Linear, Notion, Gmail, and Google Calendar. Use them to gather all relevant information, then produce a work plan. NEVER write, edit, or send anything. NEVER explore the local filesystem — the task is NOT about the current directory.",
    ], {
      cwd: os.homedir(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let outputBuffer = "";
    let resultText = "";
    let assistantText = ""; // Accumulates text from assistant blocks (the actual plan content)
    let done = false;
    let bytesReceived = 0;
    let initialized = false;

    const emit = (type: PlanningEvent["type"], content: string) => {
      onEvent?.({ type, content, timestamp: new Date().toISOString() });
    };

    if (proc.pid) trackProcess(proc.pid, "planning", "planning-agent");

    addDebugEntry("in", `📋 [PLANNING] Spawned MCP planning agent (PID ${proc.pid})`, "planning");
    log(`[planning] Spawned MCP agent PID ${proc.pid}`);
    emit("status", "Spawned planning agent — loading MCP tools...");

    proc.stdin?.write(JSON.stringify({
      type: "user",
      message: { role: "user", content: prompt },
      parent_tool_use_id: null,
      session_id: "",
    }) + "\n");

    // Periodic status updates during silent MCP init period
    const initTicker = setInterval(() => {
      if (!initialized && !done) {
        const elapsed = Math.round((Date.now() - startTs) / 1000);
        emit("status", `Loading MCP tools... (${elapsed}s)`);
      }
    }, 10000);
    const startTs = Date.now();

    // Two-phase timeout:
    // Phase 1 (init): 5 min hard limit for MCP tool loading. If init never completes, kill.
    // Phase 2 (working): 120s inactivity limit. If agent stops producing output, kill.
    const INIT_TIMEOUT_MS = 120_000; // 120s for tool loading (normally ~10s, but can be slower on cold start)
    const INACTIVITY_LIMIT_MS = 120_000; // 2 min silence after init = hung
    let lastActivityTs = Date.now();
    let inactivityCheck: ReturnType<typeof setInterval> | null = null;

    // Phase 1: init timeout — kill if tools never finish loading
    const initTimeout = setTimeout(() => {
      if (!initialized && !done) {
        done = true;
        clearInterval(initTicker);
        if (proc.pid) untrackProcess(proc.pid);
        const elapsed = Math.round((Date.now() - startTs) / 1000);
        addDebugEntry("out", `⏱️ [PLANNING] MCP init never completed after ${elapsed}s — killing`, "planning");
        log(`[planning] Init timeout: tools never loaded after ${elapsed}s`);
        emit("error", `MCP tools failed to load after ${elapsed}s. Check MCP server connectivity.`);
        proc.kill();
        resolve("MCP tools failed to load — check server connectivity");
      }
    }, INIT_TIMEOUT_MS);

    // Phase 2: starts after init — inactivity detection
    const startInactivityTimer = () => {
      if (inactivityCheck) return;
      clearTimeout(initTimeout); // init succeeded, cancel init timeout
      lastActivityTs = Date.now();
      inactivityCheck = setInterval(() => {
        if (done) return;
        const silentMs = Date.now() - lastActivityTs;
        if (silentMs >= INACTIVITY_LIMIT_MS) {
          done = true;
          clearInterval(initTicker);
          if (inactivityCheck) clearInterval(inactivityCheck);
          if (proc.pid) untrackProcess(proc.pid);
          const elapsed = Math.round((Date.now() - startTs) / 1000);
          addDebugEntry("out", `⏱️ [PLANNING] No activity for ${Math.round(silentMs / 1000)}s after init — killing (total ${elapsed}s, ${bytesReceived} bytes)`, "planning");
          log(`[planning] Inactivity timeout: ${Math.round(silentMs / 1000)}s silent after init, total ${elapsed}s`);
          emit("error", `Agent unresponsive for ${Math.round(silentMs / 1000)}s — killed`);
          proc.kill();
          resolve(resultText || assistantText || "Agent became unresponsive");
        }
      }, 10000);
    };

    proc.stdout?.on("data", (chunk: Buffer) => {
      bytesReceived += chunk.length;
      lastActivityTs = Date.now(); // Reset inactivity timer on any output
      outputBuffer += chunk.toString("utf-8");
      const lines = outputBuffer.split("\n");
      outputBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "system" && msg.subtype === "init") {
            initialized = true;
            clearInterval(initTicker);
            const tools: string[] = msg.tools ?? [];
            const mcpCount = tools.filter((t: string) => t.includes("mcp__claude_ai")).length;
            addDebugEntry("out", `🔧 [PLANNING] MCP agent initialized: ${tools.length} tools (${mcpCount} MCP)`, "planning");
            log(`[planning] Initialized: ${tools.length} tools, ${mcpCount} MCP`);
            emit("init", `Agent ready — ${tools.length} tools (${mcpCount} MCP connectors)`);
            startInactivityTimer();
          }
          if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
            for (const block of msg.message.content as Array<{ type: string; name?: string; text?: string; input?: Record<string, unknown> }>) {
              if (block.type === "tool_use" && block.name) {
                addDebugEntry("out", `🔧 [PLANNING] Tool: ${block.name}`, "planning");
                const input = block.input ?? {};
                let detail = block.name;
                if (block.name.includes("Slack")) detail = `Slack: ${block.name.split("__").pop()} ${JSON.stringify(input).slice(0, 80)}`;
                else if (block.name.includes("Linear")) detail = `Linear: ${block.name.split("__").pop()} ${JSON.stringify(input).slice(0, 80)}`;
                else if (block.name.includes("Notion")) detail = `Notion: ${block.name.split("__").pop()}`;
                else if (block.name.includes("Gmail")) detail = `Gmail: ${block.name.split("__").pop()}`;
                emit("tool_use", detail);
              }
              if (block.type === "text" && block.text?.trim()) {
                assistantText += (assistantText ? "\n" : "") + block.text;
                emit("text", block.text.slice(0, 500));
              }
            }
          }
          if (msg.type === "result" && !done) {
            resultText = String(msg.result ?? "");
            const finalText = resultText.trim() || assistantText.trim();

            // Always accept the result — Claude Code's `result` message is final.
            // Previous code filtered short results as "premature", but this was wrong:
            // it silently swallowed errors like "Prompt is too long" and left the
            // process hanging until timeout killed it.

            addDebugEntry("out", `✅ [PLANNING] Result: ${finalText.length} chars (result=${resultText.length}, assistant=${assistantText.length})`, "planning");
            log(`[planning] Result: ${finalText.length} chars (result=${resultText.length}, assistant=${assistantText.length})`);
            emit("result", `Plan complete (${finalText.length} chars)`);
            try {
              recordUsage({
                timestamp: new Date().toISOString(),
                source: "planning-agent",
                model,
                inputTokens: msg.usage?.input_tokens ?? 0,
                outputTokens: msg.usage?.output_tokens ?? 0,
                costUsd: msg.total_cost_usd ?? 0,
                durationMs: Date.now() - startTs,
                label: "mcp-planning-agent",
              });
            } catch {}
            done = true;
            clearInterval(initTicker);
            clearTimeout(initTimeout);
            if (inactivityCheck) clearInterval(inactivityCheck);
            if (proc.pid) untrackProcess(proc.pid);
            proc.kill();
            resolve(finalText);
          }
        } catch {}
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8").trim();
      if (!text) return;
      log(`[planning] STDERR: ${text.slice(0, 200)}`);
      if (!initialized && !done) {
        emit("status", text.slice(0, 120));
      }
    });
    proc.on("exit", (code) => {
      clearInterval(initTicker);
      clearTimeout(initTimeout);
      if (inactivityCheck) clearInterval(inactivityCheck);
      if (proc.pid) untrackProcess(proc.pid);
      if (!done) {
        done = true;
        const finalText = resultText.trim() || assistantText.trim();
        addDebugEntry("out", `🛑 [PLANNING] Exited (code=${code}, bytes=${bytesReceived}, text=${finalText.length})`, "planning");
        log(`[planning] Exited code=${code}, bytes=${bytesReceived}, text=${finalText.length}`);
        emit("error", `Agent exited (code ${code})`);
        resolve(finalText || "Process exited without result");
      }
    });
  });
}

// Legacy ephemeral process (no MCP tools — used for plan iteration and work prompt composition)
export function askEphemeralProcess(prompt: string, timeoutMs = 180000, model = "claude-opus-4-6[1m]", usageSource: UsageSource = "ephemeral"): Promise<string> {
  return new Promise((resolve) => {
    const ephStartTs = Date.now();
    const claudePath = getClaudeCodePath();

    const proc = spawn(claudePath, [
      "--output-format", "stream-json",
      "--verbose",
      "--input-format", "stream-json",
      "--no-chrome",
      "--model", model,
      "--no-session-persistence",
      "--disallowedTools", "Write,Edit,Bash,NotebookEdit,Agent,EnterWorktree,ExitWorktree",
      "--system-prompt", "You are a planning assistant for work tasks (NOT for the current repo/directory). All context has been provided in your prompt. Do NOT read local files, do NOT explore the filesystem, do NOT assume the task is about the current directory. Just analyze the provided context and create a plan. Return ONLY the plan or a JSON context request — no narration.",
    ], {
      cwd: os.homedir(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let outputBuffer = "";
    let resultText = "";
    let done = false;
    let bytesReceived = 0;

    if (proc.pid) trackProcess(proc.pid, "ephemeral", "plan-iteration");

    addDebugEntry("in", `📋 [PLANNING] Spawned ephemeral process (PID ${proc.pid})`, "planning");

    proc.stdin?.write(JSON.stringify({
      type: "user",
      message: { role: "user", content: prompt },
      parent_tool_use_id: null,
      session_id: "",
    }) + "\n");

    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        if (proc.pid) untrackProcess(proc.pid);
        addDebugEntry("out", `⏱️ [PLANNING] Timed out (${bytesReceived} bytes received)`, "planning");
        proc.kill();
        resolve(resultText || "Request timed out");
      }
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      bytesReceived += chunk.length;
      outputBuffer += chunk.toString("utf-8");
      const normalized = outputBuffer.replace(/\}\s*\{/g, "}\n{");
      const lines = normalized.split("\n");
      outputBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
            for (const block of msg.message.content as Array<{ type: string; name?: string; text?: string }>) {
              if (block.type === "tool_use" && block.name) addDebugEntry("out", `🔧 [PLANNING] Tool: ${block.name}`, "planning");
            }
          }
          if (msg.type === "result" && !done) {
            resultText = String(msg.result ?? "");
            addDebugEntry("out", `✅ [PLANNING] Result: ${resultText.length} chars`, "planning");
            try {
              recordUsage({
                timestamp: new Date().toISOString(),
                source: usageSource,
                model,
                inputTokens: msg.usage?.input_tokens ?? 0,
                outputTokens: msg.usage?.output_tokens ?? 0,
                costUsd: msg.total_cost_usd ?? 0,
                durationMs: Date.now() - ephStartTs,
                label: `ephemeral:${usageSource}`,
              });
            } catch {}
            done = true;
            clearTimeout(timeout);
            if (proc.pid) untrackProcess(proc.pid);
            proc.kill();
            resolve(resultText);
          }
        } catch {}
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      log(`[ephemeral] STDERR: ${chunk.toString("utf-8").trim().slice(0, 200)}`);
    });
    proc.on("exit", (code) => {
      if (proc.pid) untrackProcess(proc.pid);
      if (!done) {
        done = true;
        clearTimeout(timeout);
        addDebugEntry("out", `🛑 [PLANNING] Exited (code=${code}, bytes=${bytesReceived})`, "planning");
        resolve(resultText || "Process exited without result");
      }
    });
  });
}
