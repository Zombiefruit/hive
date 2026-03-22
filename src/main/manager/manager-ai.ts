import Anthropic from "@anthropic-ai/sdk";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { MANAGER_TOOL_SCHEMAS, executeManagerTool } from "./manager-tools";
import { getAllAgents, getPendingApprovals } from "../db/database";
import { broadcastStoreUpdate } from "../ipc/bridge";

const MODEL = "claude-opus-4-6";
const MAX_TOKENS = 8192;

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

let client: Anthropic | null = null;
let state: ManagerState = { activeConversationId: null, conversations: [] };
let onStreamCallback: ((event: ManagerStreamEvent) => void) | null = null;

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

  return `You are the Manager AI for Claude Deck, an orchestration dashboard for Claude Code agents.

## Your Role
You manage a fleet of Claude Code agents working on software engineering tasks for Kieran Williams (Senior Engineer at Monte Carlo Data, Vector team).

## Capabilities
- Spawn new agents with appropriate model, working directory, and context
- Monitor all running agents and their progress
- Approve or escalate tool permission requests from agents
- Troubleshoot stuck or errored agents
- Feed relevant context to agents proactively

## Decision Guidelines

**Model selection:**
- Haiku: simple fixes, typos, small changes (fast, cheap)
- Sonnet 4: feature implementation, refactors, code review (balanced)
- Opus 4: complex architecture, debugging, multi-file changes (deep reasoning)

**Approval delegation:**
- Auto-approve: file reads, grep, glob, safe bash commands (ls, cat, git status, etc.)
- Auto-approve with note: file writes, edits, safe bash (npm install, git commit, etc.)
- ESCALATE to user: destructive operations (rm -rf, git push --force, DROP TABLE, git reset --hard, etc.)

**Budget defaults:**
- Small task: $1
- Feature work: $5
- Complex work: $10

**When agents get stuck:**
- Check recent messages and events for the agent
- Identify the blocker (permission denied, error, confusion)
- Send a helpful message to guide the agent
- If truly stuck, kill and restart with better instructions

## Current Fleet State
${fleetSummary}

## Pending Approvals
${approvalSummary}

## Instructions
Be concise and action-oriented. Show your reasoning briefly. When you use tools, explain what you're doing and why. Ask for clarification only when genuinely ambiguous.`;
}

function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
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
 * Initialize the Manager AI. Call on app startup.
 */
export function initManager(): void {
  loadState();
}

/**
 * Set the stream callback for real-time UI updates.
 */
export function setManagerStreamCallback(cb: (event: ManagerStreamEvent) => void): void {
  onStreamCallback = cb;
}

function emit(event: ManagerStreamEvent): void {
  onStreamCallback?.(event);
}

/**
 * Send a message to the Manager AI and get a streamed response.
 */
export async function sendManagerMessage(userMessage: string): Promise<ManagerMessage> {
  const conversation = getActiveConversation();

  // Add user message
  const userMsg: ManagerMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
  };
  conversation.messages.push(userMsg);
  conversation.updatedAt = new Date().toISOString();

  // Update title from first message
  if (conversation.messages.filter((m) => m.role === "user").length === 1) {
    conversation.title = userMessage.slice(0, 60);
  }

  emit({ type: "message_start", conversationId: conversation.id });

  // Build API messages from conversation history
  const apiMessages: Anthropic.MessageParam[] = conversation.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const anthropic = getAnthropicClient();
    let assistantContent = "";
    const toolCalls: ManagerMessage["toolCalls"] = [];

    // Agentic loop — keep going while there are tool calls
    let currentMessages = [...apiMessages];

    while (true) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(),
        tools: MANAGER_TOOL_SCHEMAS as Anthropic.Tool[],
        messages: currentMessages,
      });

      // Process response content
      let hasToolUse = false;
      const toolResults: Anthropic.MessageParam[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          assistantContent += block.text;
          emit({ type: "text_delta", text: block.text });
        } else if (block.type === "tool_use") {
          hasToolUse = true;
          const toolInput = block.input as Record<string, unknown>;
          emit({ type: "tool_use", name: block.name, input: toolInput });

          // Execute the tool
          const result = await executeManagerTool(block.name, toolInput);
          toolCalls.push({ name: block.name, input: toolInput, result });
          emit({ type: "tool_result", name: block.name, result });

          // Build tool result for next iteration
          toolResults.push({
            role: "user" as const,
            content: [{
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: result,
            }],
          });
        }
      }

      if (!hasToolUse || response.stop_reason === "end_turn") {
        break;
      }

      // Continue with tool results
      currentMessages = [
        ...currentMessages,
        { role: "assistant" as const, content: response.content },
        ...toolResults,
      ];
    }

    // Save assistant message
    const assistantMsg: ManagerMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: assistantContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
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

/**
 * Get all conversations.
 */
export function getManagerConversations(): ManagerConversation[] {
  return state.conversations;
}

/**
 * Switch to a different conversation.
 */
export function switchManagerConversation(conversationId: string): void {
  const conv = state.conversations.find((c) => c.id === conversationId);
  if (conv) {
    state.activeConversationId = conversationId;
    saveState();
  }
}

/**
 * Start a new conversation.
 */
export function newManagerConversation(): ManagerConversation {
  return createConversation();
}

/**
 * Delete a conversation.
 */
export function deleteManagerConversation(conversationId: string): void {
  state.conversations = state.conversations.filter((c) => c.id !== conversationId);
  if (state.activeConversationId === conversationId) {
    state.activeConversationId = state.conversations[0]?.id ?? null;
  }
  saveState();
}

/**
 * Get the active conversation's messages.
 */
export function getActiveManagerMessages(): ManagerMessage[] {
  const conv = state.activeConversationId
    ? state.conversations.find((c) => c.id === state.activeConversationId)
    : null;
  return conv?.messages ?? [];
}
