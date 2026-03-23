/**
 * MCP Bridge — a persistent, non-headless Claude Code process
 * that has access to all claude.ai MCP connectors (Slack, Linear, etc.).
 *
 * The Manager sends it natural language prompts and gets structured data back.
 * This is the only process that needs MCP access — everything else is headless.
 */

import { spawn, ChildProcess } from "node:child_process";
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
let pendingRequests = new Map<string, { resolve: (text: string) => void; timeout: ReturnType<typeof setTimeout> }>();
let outputBuffer = "";

// Debug log of all bridge I/O for the debug tab
const debugLog: Array<{ timestamp: string; direction: "in" | "out"; content: string }> = [];
const MAX_DEBUG_LOG = 200;

function addDebugEntry(direction: "in" | "out", content: string): void {
  debugLog.push({ timestamp: new Date().toISOString(), direction, content: content.slice(0, 2000) });
  if (debugLog.length > MAX_DEBUG_LOG) debugLog.shift();
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

  const claudePath = getClaudeCodePath();
  log("Starting MCP Bridge process");

  bridgeProcess = spawn(claudePath, [
    "--output-format", "stream-json",
    "--verbose",
    "--input-format", "stream-json",
    "--no-chrome",
    "--model", "claude-haiku-4-5-20251001",
    // READ-ONLY: block all write/mutating tools
    "--disallowedTools", "Write,Edit,Bash,NotebookEdit,Agent,EnterWorktree,ExitWorktree",
    "--system-prompt", "You are a READ-ONLY data fetcher. You can ONLY read and search data from Slack, Linear, Notion, Gmail, GitHub, and other connected services. You must NEVER write, edit, send messages, create issues, or modify anything. Only fetch and return data. Always return structured JSON when asked.",
  ], {
    cwd: os.homedir(),
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

  bridgeProcess.on("exit", (code) => {
    log(`Bridge process exited with code ${code}`);
    bridgeProcess = null;
    isReady = false;
    // Restart after 5s
    setTimeout(() => startBridge(), 5000);
  });

  // Wait for init before marking ready
  setTimeout(() => {
    if (bridgeProcess && !isReady) {
      isReady = true;
      log("Bridge marked as ready (timeout)");
    }
  }, 15000);
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
        isReady = true;
        log(`Bridge initialized, session=${sessionId}, tools=${(msg.tools ?? []).length}`);

        // Log MCP tools specifically
        const mcpTools = (msg.tools ?? []).filter((t: string) => t.includes("mcp__claude_ai"));
        log(`claude.ai MCP tools: ${mcpTools.length} — ${mcpTools.slice(0, 5).join(", ")}`);
      }

      // Check for result messages
      if (msg.type === "result") {
        const resultText = String(msg.result ?? "");
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
 * Send a natural language prompt to the MCP Bridge and get a response.
 * The bridge has access to Slack, Linear, Notion, Gmail, etc.
 */
export function askBridge(prompt: string, timeoutMs = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!bridgeProcess || !bridgeProcess.stdin) {
      resolve("MCP Bridge not running");
      return;
    }

    if (!isReady) {
      resolve("MCP Bridge still initializing — try again in a few seconds");
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
  if (bridgeProcess) {
    bridgeProcess.kill();
    bridgeProcess = null;
    isReady = false;
    log("Bridge stopped");
  }
}
