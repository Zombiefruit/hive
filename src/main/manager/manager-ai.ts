import { app } from "electron";
import { updateNotificationByTitle } from "../notifications/poll-service";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { getClaudeCodePath } from "../claude-path";
import { executeManagerTool } from "./manager-tools";
import { getAllAgents, getPendingApprovals } from "../db/database";
import { broadcastStoreUpdate } from "../ipc/bridge";
import { getMonitorSummary } from "../notifications/agent-monitor";
import { hasConfig, getConfig } from "../config";

const MODEL = "claude-sonnet-4-6"; // Sonnet for fast responses — bridge uses Opus for heavy MCP work
const CALL_DIR = path.join(os.tmpdir(), "claude-deck-mcp");

interface ManagerMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown>; result: string }>;
  timestamp: string;
}

interface ManagerConversation {
  id: string;
  title: string;
  messages: ManagerMessage[];
  createdAt: string;
  updatedAt: string;
}

interface ManagerState {
  activeConversationId: string | null;
  conversations: ManagerConversation[];
}

let state: ManagerState = { activeConversationId: null, conversations: [] };
let onStreamCallback: ((event: ManagerStreamEvent) => void) | null = null;
let mcpCallWatcher: fs.FSWatcher | null = null;
let mcpServerScriptPath: string | null = null;

export type ManagerStreamEvent =
  | { type: "message_start"; conversationId: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "message_complete"; message: ManagerMessage }
  | { type: "error"; error: string };

function getStatePath(): string {
  return path.join(app.getPath("userData"), "manager-state.json");
}

function saveState(): void {
  fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2));
}

function loadState(): void {
  try {
    const raw = fs.readFileSync(getStatePath(), "utf-8");
    state = JSON.parse(raw);
  } catch {
    state = { activeConversationId: null, conversations: [] };
  }
}

/**
 * Write the fleet MCP server script to a temp location.
 * This script is spawned as a stdio MCP server by the Agent SDK.
 * It communicates with the main process via file-based IPC in CALL_DIR.
 */
function ensureMcpServerScript(): string {
  if (mcpServerScriptPath && fs.existsSync(mcpServerScriptPath)) {
    return mcpServerScriptPath;
  }

  const scriptDir = path.join(app.getPath("userData"), "mcp");
  fs.mkdirSync(scriptDir, { recursive: true });
  mcpServerScriptPath = path.join(scriptDir, "fleet-server.mjs");

  // The MCP server script — self-contained, no imports from our codebase
  const script = `
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

const CALL_DIR = ${JSON.stringify(CALL_DIR)};
fs.mkdirSync(CALL_DIR, { recursive: true });

async function callMain(toolName, input) {
  const callId = Date.now() + "-" + Math.random().toString(36).slice(2);
  const reqFile = path.join(CALL_DIR, callId + ".request.json");
  const resFile = path.join(CALL_DIR, callId + ".response.json");
  fs.writeFileSync(reqFile, JSON.stringify({ toolName, input }));
  const start = Date.now();
  while (Date.now() - start < 30000) {
    if (fs.existsSync(resFile)) {
      const result = fs.readFileSync(resFile, "utf-8");
      try { fs.unlinkSync(reqFile); } catch {}
      try { fs.unlinkSync(resFile); } catch {}
      return result;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  try { fs.unlinkSync(reqFile); } catch {}
  return JSON.stringify({ error: "Tool call timed out" });
}

const server = new McpServer({ name: "claude-deck-fleet", version: "1.0.0" });

const tools = [
  ["spawn_agent", "Spawn a new Claude Code agent.", { task: z.string(), model: z.string().optional(), cwd: z.string(), branch: z.string().optional(), permissionMode: z.string().optional(), maxBudgetUsd: z.number().optional() }],
  ["list_agents", "List all agents with status, task, model, cost.", { status_filter: z.string().optional() }],
  ["get_agent_status", "Get detailed agent status.", { agentId: z.string() }],
  ["send_message_to_agent", "Send instruction to a running agent.", { agentId: z.string(), message: z.string() }],
  ["interrupt_agent", "Gracefully interrupt an agent.", { agentId: z.string() }],
  ["kill_agent", "Force-kill an agent.", { agentId: z.string() }],
  ["approve_command", "Approve/reject a pending permission request.", { approvalId: z.string(), approved: z.boolean(), reason: z.string().optional() }],
  ["list_pending_approvals", "Get all pending approvals.", {}],
  ["add_context_to_agent", "Attach context to an agent.", { agentId: z.string(), type: z.string(), resourceId: z.string(), title: z.string(), url: z.string().optional() }],
  ["get_fleet_metrics", "Get fleet metrics.", {}],
];

for (const [name, desc, schema] of tools) {
  server.tool(name, desc, schema, async (input) => {
    const result = await callMain(name, input);
    return { content: [{ type: "text", text: result }] };
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);
`;

  fs.writeFileSync(mcpServerScriptPath, script);
  return mcpServerScriptPath;
}

function buildSystemPrompt(): string {
  const agents = getAllAgents();
  const pending = getPendingApprovals();

  const fleetSummary = agents.length > 0
    ? agents.map((a) =>
        `- [${a.status}] ${a.task.slice(0, 80)} (${a.model}, $${a.costUsd.toFixed(3)})`
      ).join("\n")
    : "No agents running.";

  const approvalSummary = pending.length > 0
    ? pending.map((a) => `- [${a.riskLevel}] ${a.description}`).join("\n")
    : "No pending approvals.";

  const cfg = hasConfig() ? getConfig() : null;
  const userName = cfg?.name ?? "the user";
  const identity = cfg
    ? `${cfg.name} (${cfg.role?.replace(/_/g, " ")} on the ${cfg.teamName} team)`
    : "the user";

  return `You are the Manager AI for Claude Deck, an orchestration dashboard for Claude Code agents.

## Your Role
You manage a fleet of Claude Code agents for ${identity}.

## Capabilities
You manage ${userName}'s notification inbox and agent fleet. You can:
- Discuss tasks and help prioritize
- Update task state by including action blocks in your response
- Spawn agents when work is approved

## Updating tasks
When ${userName} asks you to change a task's priority, mark it done, or change its stage,
include a JSON action block in your response (on its own line):
{"action": "update_task", "task_title": "partial title match", "changes": {"priority": "low", "stage": "done", "confidence": 3}}

Valid changes: priority (critical/high/medium/low/backlog), stage (new/start_work/plan_review/hack/ship/code_review/pr_feedback/preparing/ready/backlog/done/skipped), confidence (1-10), status (done/dismissed)

Stage descriptions:
- new = inbox, untriaged
- start_work = planning (agent tasks)
- plan_review = plan ready for user review
- hack = actively coding
- ship = creating PR
- code_review = awaiting review
- pr_feedback = addressing review feedback
- preparing = planning (human tasks: response, meeting_prep, review)
- ready = human task planned, ready to execute
- backlog = deprioritized
- done = completed
- skipped = not actionable

Priority levels:
- critical = do it NOW, direct ask from manager, blocking others
- high = do it today, tagged threads needing reply, active PRs
- medium = do it this week, assigned tickets, planned work
- low = when you have time, optional reviews, nice-to-haves
- backlog = informational, no action needed

Example: User says "downgrade the sync meeting" → you respond with text AND:
{"action": "update_task", "task_title": "sync meeting", "changes": {"priority": "backlog", "stage": "done"}}

## Current Fleet State
${fleetSummary}

## Pending Approvals
${approvalSummary}

## Work Agent Monitor
${getMonitorSummary()}

Be concise and action-oriented. Use your fleet tools — don't use Read/Write/Bash.`;
}

function getActiveConversation(): ManagerConversation {
  if (state.activeConversationId) {
    const conv = state.conversations.find((c) => c.id === state.activeConversationId);
    if (conv) return conv;
  }
  return createConversation();
}

function createConversation(title?: string): ManagerConversation {
  const conv: ManagerConversation = {
    id: crypto.randomUUID(),
    title: title ?? "New conversation",
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.conversations.unshift(conv);
  state.activeConversationId = conv.id;
  saveState();
  return conv;
}

/**
 * Watch for MCP tool call requests and execute them in the main process.
 */
function startMcpCallHandler(): void {
  fs.mkdirSync(CALL_DIR, { recursive: true });

  mcpCallWatcher = fs.watch(CALL_DIR, async (_eventType, filename) => {
    if (!filename?.endsWith(".request.json")) return;

    const requestFile = path.join(CALL_DIR, filename);
    const responseFile = requestFile.replace(".request.json", ".response.json");

    try {
      // Small delay to let the file write complete
      await new Promise((r) => setTimeout(r, 10));
      const raw = fs.readFileSync(requestFile, "utf-8");
      const { toolName, input } = JSON.parse(raw);

      // Emit tool use event to UI
      emit({ type: "tool_use", name: toolName, input });

      const result = await executeManagerTool(toolName, input);

      emit({ type: "tool_result", name: toolName, result });

      fs.writeFileSync(responseFile, result);
    } catch (err) {
      fs.writeFileSync(responseFile, JSON.stringify({ error: String(err) }));
    }
  });
}

function emit(event: ManagerStreamEvent): void {
  onStreamCallback?.(event);
}

/**
 * Initialize the Manager AI. Call on app startup.
 */
export function initManager(): void {
  loadState();
  startMcpCallHandler();
}

/**
 * Set the stream callback for real-time UI updates.
 */
export function setManagerStreamCallback(cb: (event: ManagerStreamEvent) => void): void {
  onStreamCallback = cb;
}

/**
 * Parse Manager response for action blocks and execute them.
 * The Manager can include JSON action blocks like:
 * {"action": "update_task", "task_title": "...", "changes": {...}}
 */
function parseAndExecuteActions(content: string): void {
  // Find JSON objects that contain "update_task" by counting braces
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.includes("update_task")) continue;

    try {
      const action = JSON.parse(trimmed);
      if (action.action === "update_task" && action.task_title) {
        const changes: Record<string, unknown> = {};
        if (action.changes) Object.assign(changes, action.changes);
        // Also support flat fields
        if (action.priority && !changes.priority) changes.priority = action.priority;
        if (action.status && !changes.status) changes.status = action.status;
        if (action.stage && !changes.stage) changes.stage = action.stage;
        if (action.confidence && !changes.confidence) changes.confidence = action.confidence;

        const updated = updateNotificationByTitle(String(action.task_title), changes);
        if (updated) {
          emit({ type: "text_delta", text: `\n\n✅ Task "${action.task_title}" updated.` });
        } else {
          emit({ type: "text_delta", text: `\n\n⚠️ Could not find task matching "${action.task_title}".` });
        }
      }
    } catch {}
  }
}

/**
 * Send a message to the Manager AI.
 */
export async function sendManagerMessage(userMessage: string): Promise<ManagerMessage> {
  const conversation = getActiveConversation();

  const userMsg: ManagerMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
  };
  conversation.messages.push(userMsg);
  conversation.updatedAt = new Date().toISOString();

  if (conversation.messages.filter((m) => m.role === "user").length === 1) {
    conversation.title = userMessage.slice(0, 60);
  }

  emit({ type: "message_start", conversationId: conversation.id });

  // Build prompt with conversation history
  const historyContext = conversation.messages.slice(0, -1).map((m) =>
    `${m.role === "user" ? "User" : "Manager"}: ${m.content}`
  ).join("\n\n");

  const fullPrompt = historyContext
    ? `Previous conversation:\n${historyContext}\n\nUser: ${userMessage}`
    : userMessage;

  try {
    const systemPrompt = buildSystemPrompt();
    const claudePath = getClaudeCodePath();
    const managerStart = Date.now();
    console.log(`[manager] Sending message: "${userMessage.slice(0, 60)}"`);
    const { execFile } = require("node:child_process") as typeof import("node:child_process");

    const assistantContent = await new Promise<string>((resolve, reject) => {
      console.log(`[manager] Spawning claude process (model: ${MODEL})...`);
      const proc = execFile(claudePath, [
        "-p", `${systemPrompt}\n\n---\n\nUser: ${fullPrompt}`,
        "--output-format", "json",
        "--model", MODEL,
        "--max-turns", "10",
      ], {
        timeout: 180000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env },
        cwd: os.homedir(),
      }, (error: Error | null, stdout: string) => {
        if (error) {
          console.log(`[manager] ERROR: ${error.message}`);
          reject(error);
          return;
        }
        try {
          const result = JSON.parse(stdout);
          resolve(String(result.result ?? ""));
        } catch {
          resolve(stdout.slice(0, 5000));
        }
      });
      console.log(`[manager] Process spawned (PID: ${proc.pid})`);
    });

    console.log(`[manager] Response received: ${assistantContent.length} chars (${Math.round((Date.now() - managerStart) / 1000)}s)`);
    emit({ type: "text_delta", text: assistantContent });

    // Parse and execute any action blocks in the response
    parseAndExecuteActions(assistantContent);

    const assistantMsg: ManagerMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: assistantContent || "(No response)",
      timestamp: new Date().toISOString(),
    };
    conversation.messages.push(assistantMsg);
    conversation.updatedAt = new Date().toISOString();
    saveState();

    emit({ type: "message_complete", message: assistantMsg });
    broadcastStoreUpdate();

    return assistantMsg;
  } catch (err) {
    const errorMsg = String(err);
    emit({ type: "error", error: errorMsg });
    throw err;
  }
}

function extractTextContent(message: unknown): string {
  if (!message) return "";
  const msg = message as { content?: unknown };
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return (msg.content as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
  }
  return "";
}

export function getManagerConversations(): ManagerConversation[] {
  return state.conversations;
}

export function switchManagerConversation(conversationId: string): void {
  const conv = state.conversations.find((c) => c.id === conversationId);
  if (conv) {
    state.activeConversationId = conversationId;
    saveState();
  }
}

export function newManagerConversation(): ManagerConversation {
  return createConversation();
}

export function deleteManagerConversation(conversationId: string): void {
  state.conversations = state.conversations.filter((c) => c.id !== conversationId);
  if (state.activeConversationId === conversationId) {
    state.activeConversationId = state.conversations[0]?.id ?? null;
  }
  saveState();
}

export function getActiveManagerMessages(): ManagerMessage[] {
  const conv = state.activeConversationId
    ? state.conversations.find((c) => c.id === state.activeConversationId)
    : null;
  return conv?.messages ?? [];
}

export function stopManager(): void {
  if (mcpCallWatcher) {
    mcpCallWatcher.close();
    mcpCallWatcher = null;
  }
}
