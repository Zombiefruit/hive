/**
 * MCP Bridge — a persistent, non-headless Claude Code process
 * that has access to all claude.ai MCP connectors (Slack, Linear, etc.).
 *
 * The Manager sends it natural language prompts and gets structured data back.
 * This is the only process that needs MCP access — everything else is headless.
 */

import { spawn, ChildProcess } from "node:child_process";
import { app } from "electron";
import { getClaudeCodePath } from "./claude-path";
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

let bridgeProcess: ChildProcess | null = null;
let sessionId: string = "";
let isReady = false;
let lastMcpToolCount = 0;
let bridgeGeneration = 0; // Incremented on each startBridge() to invalidate stale timeouts
const MIN_EXPECTED_MCP_TOOLS = 85;
let pendingRequests = new Map<string, { resolve: (text: string) => void; timeout: ReturnType<typeof setTimeout> }>();
let outputBuffer = "";

// Debug log of all bridge I/O for the debug tab
const debugLog: Array<{ timestamp: string; direction: "in" | "out"; content: string }> = [];
const MAX_DEBUG_LOG = 200;

export function addDebugEntry(direction: "in" | "out", content: string): void {
  // Parse JSON to create human-readable entries
  if (direction === "out") {
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const readable = formatBridgeMessage(msg);
        if (readable) {
          debugLog.push({ timestamp: new Date().toISOString(), direction, content: readable });
          if (debugLog.length > MAX_DEBUG_LOG) debugLog.shift();
        }
      } catch {
        // Not JSON — skip
      }
    }
    return;
  }

  // For prompts (input), extract the readable part
  try {
    const msg = JSON.parse(content);
    const text = msg.message?.content ?? content;
    debugLog.push({ timestamp: new Date().toISOString(), direction, content: typeof text === "string" ? text.slice(0, 1000) : JSON.stringify(text).slice(0, 1000) });
  } catch {
    debugLog.push({ timestamp: new Date().toISOString(), direction, content: content.slice(0, 1000) });
  }
  if (debugLog.length > MAX_DEBUG_LOG) debugLog.shift();
}

function formatBridgeMessage(msg: { type?: string; subtype?: string; message?: { content?: unknown }; result?: string; tools?: string[] }): string | null {
  if (msg.type === "system" && msg.subtype === "init") {
    const toolCount = msg.tools?.length ?? 0;
    const mcpCount = (msg.tools ?? []).filter((t: string) => t.includes("mcp__claude_ai")).length;
    return `🔧 Bridge initialized: ${toolCount} tools (${mcpCount} MCP connectors)`;
  }
  if (msg.type === "system" && msg.subtype === "hook_started") return null; // Skip hooks
  if (msg.type === "system" && msg.subtype === "hook_response") return null;
  if (msg.type === "system") return `⚙️ System: ${msg.subtype ?? "unknown"}`;

  if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
    const parts: string[] = [];
    for (const block of msg.message!.content as Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>) {
      if (block.type === "text" && block.text) {
        parts.push(`💬 ${block.text.slice(0, 300)}`);
      }
      if (block.type === "tool_use" && block.name) {
        const input = block.input ?? {};
        if (block.name.includes("Slack")) parts.push(`📱 Slack: ${block.name.split("__").pop()} ${JSON.stringify(input).slice(0, 100)}`);
        else if (block.name.includes("Linear")) parts.push(`📋 Linear: ${block.name.split("__").pop()} ${JSON.stringify(input).slice(0, 100)}`);
        else if (block.name.includes("Gmail")) parts.push(`📧 Gmail: ${block.name.split("__").pop()}`);
        else if (block.name.includes("Notion")) parts.push(`📝 Notion: ${block.name.split("__").pop()}`);
        else if (block.name === "ToolSearch") parts.push(`🔍 Loading tools: ${input.query ?? ""}`);
        else parts.push(`🔧 Tool: ${block.name}`);
      }
      if (block.type === "thinking") {
        // Skip thinking blocks
      }
    }
    return parts.join("\n") || null;
  }

  if (msg.type === "result") {
    return `✅ Result: ${String(msg.result ?? "").slice(0, 200)}`;
  }

  return null; // Skip unknown types
}

/** Get the debug log for the UI. */
export function getBridgeDebugLog(): typeof debugLog {
  return debugLog;
}

/**
 * Start the MCP Bridge process.
 * This spawns an interactive Claude Code session that loads all MCP connectors.
 */
export function startBridge(): void {
  if (bridgeProcess) return;
  bridgeGeneration++;

  const claudePath = getClaudeCodePath();
  log("Starting MCP Bridge process");

  // Write tools to block — everything else is auto-approved via bypassPermissions
  const disallowedTools = [
    "Write", "Edit", "Bash", "NotebookEdit", "Agent", "EnterWorktree", "ExitWorktree",
    "mcp__claude_ai_Slack__slack_send_message",
    "mcp__claude_ai_Slack__slack_send_message_draft",
    "mcp__claude_ai_Slack__slack_schedule_message",
    "mcp__claude_ai_Slack__slack_create_canvas",
    "mcp__claude_ai_Slack__slack_update_canvas",
    "mcp__claude_ai_Linear__save_issue",
    "mcp__claude_ai_Linear__save_comment",
    "mcp__claude_ai_Linear__save_project",
    "mcp__claude_ai_Linear__save_initiative",
    "mcp__claude_ai_Linear__save_milestone",
    "mcp__claude_ai_Linear__save_customer",
    "mcp__claude_ai_Linear__save_customer_need",
    "mcp__claude_ai_Linear__save_status_update",
    "mcp__claude_ai_Linear__delete_comment",
    "mcp__claude_ai_Linear__delete_customer",
    "mcp__claude_ai_Linear__delete_customer_need",
    "mcp__claude_ai_Linear__delete_status_update",
    "mcp__claude_ai_Linear__delete_attachment",
    "mcp__claude_ai_Linear__create_issue_label",
    "mcp__claude_ai_Linear__create_document",
    "mcp__claude_ai_Linear__create_attachment",
    "mcp__claude_ai_Linear__update_document",
    "mcp__claude_ai_Notion__notion-create-pages",
    "mcp__claude_ai_Notion__notion-create-database",
    "mcp__claude_ai_Notion__notion-create-comment",
    "mcp__claude_ai_Notion__notion-update-page",
    "mcp__claude_ai_Notion__notion-move-pages",
    "mcp__claude_ai_Notion__notion-duplicate-page",
    "mcp__claude_ai_Notion__notion-create-view",
    "mcp__claude_ai_Notion__notion-update-view",
    "mcp__claude_ai_Notion__notion-update-data-source",
    "mcp__claude_ai_Gmail__gmail_create_draft",
    "mcp__claude_ai_Google_Calendar__gcal_create_event",
    "mcp__claude_ai_Google_Calendar__gcal_delete_event",
    "mcp__claude_ai_Google_Calendar__gcal_update_event",
    "mcp__claude_ai_Google_Calendar__gcal_respond_to_event",
  ];

  bridgeProcess = spawn(claudePath, [
    "--output-format", "stream-json",
    "--verbose",
    "--input-format", "stream-json",
    "--no-chrome",
    "--model", "claude-haiku-4-5-20251001",
    "--no-session-persistence",
    // No explicit permission mode — MCP read tools work without approval in non-headless mode
    "--disallowedTools", disallowedTools.join(","),
    "--system-prompt", "You are a READ-ONLY data fetcher for Claude Deck. You can ONLY read and search data. You must NEVER write, edit, send messages, create issues, post comments, or modify anything. If asked to write or modify, refuse. Only fetch and return data in structured JSON format. IMPORTANT: Each message you receive is an INDEPENDENT request — do not reference previous messages or complain about repeated requests. Every request is new. Just fetch the data and respond.",
  ], {
    // Run from the claude-deck project dir so .claude/skills/ are auto-discovered
    cwd: app.isPackaged ? os.homedir() : app.getAppPath(),
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  bridgeProcess.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf-8");
    addDebugEntry("out", text);
    outputBuffer += text;
    processOutputBuffer();
  });

  bridgeProcess.stderr?.on("data", (chunk: Buffer) => {
    log(`STDERR: ${chunk.toString("utf-8").slice(0, 200)}`);
  });

  const startGen = bridgeGeneration;
  bridgeProcess.on("exit", (code) => {
    log(`Bridge process exited with code ${code}`);
    bridgeProcess = null;
    isReady = false;
    lastMcpToolCount = 0;
    // Only auto-restart if this wasn't an intentional stop (generation unchanged)
    if (startGen === bridgeGeneration) {
      log("Unexpected exit — auto-restarting in 5s");
      setTimeout(() => startBridge(), 5000);
    }
  });

  // Fallback: if init never arrives after 60s, mark ready to unblock callers.
  // Use generation counter to prevent stale timeouts from affecting new bridge instances.
  const gen = bridgeGeneration;
  setTimeout(() => {
    if (gen === bridgeGeneration && bridgeProcess && !isReady) {
      isReady = true;
      log("Bridge marked as ready (timeout fallback after 60s)");
    }
  }, 60000);
}

function processOutputBuffer(): void {
  const lines = outputBuffer.split("\n");
  outputBuffer = lines.pop() ?? ""; // Keep incomplete line in buffer

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);

      // Track session ID from init
      if (msg.type === "system" && msg.subtype === "init") {
        sessionId = msg.session_id ?? "";
        const allTools: string[] = msg.tools ?? [];
        const mcpTools = allTools.filter((t: string) => t.includes("mcp__claude_ai"));
        lastMcpToolCount = mcpTools.length;

        // Check for required connectors
        const hasSlack = mcpTools.some((t: string) => t.includes("Slack"));
        const hasLinear = mcpTools.some((t: string) => t.includes("Linear"));
        const hasGmail = mcpTools.some((t: string) => t.includes("Gmail"));
        const hasCalendar = mcpTools.some((t: string) => t.includes("Google_Calendar"));
        const hasNotion = mcpTools.some((t: string) => t.includes("Notion"));

        isReady = true;
        log(`Bridge initialized, session=${sessionId}, tools=${allTools.length}, MCP=${mcpTools.length}`);
        log(`  Connectors: Slack=${hasSlack} Linear=${hasLinear} Gmail=${hasGmail} Calendar=${hasCalendar} Notion=${hasNotion}`);

        if (mcpTools.length < MIN_EXPECTED_MCP_TOOLS) {
          log(`  WARNING: Only ${mcpTools.length} MCP tools loaded (expected >=${MIN_EXPECTED_MCP_TOOLS}). Some connectors may be missing.`);
        }
      }

      // Log all message types when we have pending requests
      if (pendingRequests.size > 0 && msg.type) {
        if (msg.type === "assistant") {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content as Array<{ type: string; name?: string; text?: string }>) {
              if (block.type === "tool_use") log(`  Bridge calling tool: ${block.name}`);
              if (block.type === "text" && block.text) log(`  Bridge text: ${block.text.slice(0, 100)}`);
            }
          }
        } else if (msg.type === "tool_result" || (msg.type === "user" && msg.message?.content)) {
          // Tool result came back
        }
      }

      // Check for result messages
      if (msg.type === "result") {
        const resultText = String(msg.result ?? "");
        log(`  Bridge result received: ${resultText.length} chars`);
        // Resolve any pending request
        for (const [reqId, req] of pendingRequests) {
          clearTimeout(req.timeout);
          req.resolve(resultText);
          pendingRequests.delete(reqId);
          break; // One result per request
        }
      }

      // Also capture assistant text for pending requests
      if (msg.type === "assistant" && msg.message?.content) {
        const content = msg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && block.text) {
              // Store for result
            }
          }
        }
      }
    } catch {}
  }
}

/**
 * Restart the bridge process to clear conversation context.
 * Call after each poll cycle to prevent context accumulation.
 */
export function restartBridge(): void {
  log("Restarting bridge to clear context");
  stopBridge();
  setTimeout(() => startBridge(), 1000);
}

// restartBridgeAndWait removed — no longer needed since we don't restart between sources

/**
 * Send a natural language prompt to the MCP Bridge and get a response.
 * The bridge has access to Slack, Linear, Notion, Gmail, etc.
 * Waits up to 90s for the bridge to be ready before sending (init takes ~45s).
 */
export async function askBridge(prompt: string, timeoutMs = 60000): Promise<string> {
  // Wait for bridge to be ready — init takes ~45s on first start
  const waitStart = Date.now();
  while (!isBridgeReady() && Date.now() - waitStart < 90000) {
    await new Promise(r => setTimeout(r, 500));
  }

  return new Promise((resolve, reject) => {
    if (!bridgeProcess || !bridgeProcess.stdin) {
      resolve("MCP Bridge not running");
      return;
    }

    if (!isReady) {
      resolve("MCP Bridge still initializing after 20s wait");
      return;
    }

    const reqId = randomUUID();
    log(`Request ${reqId.slice(0, 8)}: ${prompt.slice(0, 100)}`);

    const timeout = setTimeout(() => {
      pendingRequests.delete(reqId);
      log(`Request ${reqId.slice(0, 8)} timed out`);
      resolve("Request timed out");
    }, timeoutMs);

    pendingRequests.set(reqId, { resolve, timeout });

    // Send the message as stream-json
    const message = JSON.stringify({
      type: "user",
      message: { role: "user", content: prompt },
      parent_tool_use_id: null,
      uuid: reqId,
      session_id: sessionId,
    });

    addDebugEntry("in", message);
    bridgeProcess.stdin.write(message + "\n");
  });
}

/**
 * Check if the bridge is ready (MCP servers connected).
 */
export function isBridgeReady(): boolean {
  return isReady && bridgeProcess !== null;
}

/**
 * Stop the bridge process.
 */
export function stopBridge(): void {
  bridgeGeneration++; // Invalidate stale timeouts and prevent auto-restart
  if (bridgeProcess) {
    bridgeProcess.kill();
    bridgeProcess = null;
    isReady = false;
    log("Bridge stopped");
  }
}
