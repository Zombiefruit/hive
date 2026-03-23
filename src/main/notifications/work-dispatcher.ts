/**
 * Work Dispatcher — orchestrates the notification → plan → work flow.
 *
 * NO hardcoded logic. The Manager (via MCP bridge) does all the thinking:
 * - Analyzes the notification context
 * - Proposes a plan
 * - Iterates on the plan based on user feedback
 * - Composes the work agent prompt when approved
 */

import { askBridge, isBridgeReady } from "../mcp-bridge";
import { spawn, ChildProcess } from "node:child_process";
import { getClaudeCodePath } from "../claude-path";
import { BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const LOG_PATH = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "dispatcher.log");
function log(msg: string): void {
  try { fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`); } catch {}
}

export interface WorkPlan {
  notificationId: string;
  title: string;
  context: string;
  plan: string;
  estimatedModel: string;
  estimatedCost: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}

// Persist plans so they survive page refreshes
const plans = new Map<string, WorkPlan>();

function getPlanCachePath(): string {
  return path.join(os.homedir(), "Library", "Application Support", "claude-deck", "plans-cache.json");
}

function savePlans(): void {
  try {
    const data = Object.fromEntries(plans);
    fs.writeFileSync(getPlanCachePath(), JSON.stringify(data));
  } catch {}
}

function loadPlans(): void {
  try {
    const raw = fs.readFileSync(getPlanCachePath(), "utf-8");
    const data = JSON.parse(raw) as Record<string, WorkPlan>;
    for (const [k, v] of Object.entries(data)) plans.set(k, v);
  } catch {}
}

// Load on module init
loadPlans();

export function getPlan(notificationId: string): WorkPlan | null {
  return plans.get(notificationId) ?? null;
}

export function getAllPlans(): Record<string, WorkPlan> {
  return Object.fromEntries(plans);
}

/**
 * Ask the Manager to analyze a notification and propose a plan.
 * The Manager uses the bridge to fetch full context and think about it.
 */
export async function prepareWorkPlan(notification: {
  id: string;
  source: string;
  title: string;
  summary: string;
  url?: string;
  taskType?: string;
  links?: Array<{ type: string; label: string; url: string }>;
}): Promise<WorkPlan> {
  log(`prepareWorkPlan: ${notification.title}`);

  if (!isBridgeReady()) {
    return {
      notificationId: notification.id,
      title: notification.title,
      context: notification.summary,
      plan: "MCP Bridge not ready — try again in a few seconds.",
      estimatedModel: "",
      estimatedCost: "",
      conversationHistory: [],
    };
  }

  const taskType = notification.taskType ?? "implementation";
  const linksText = notification.links?.map(l => `- [${l.type}] ${l.label}: ${l.url}`).join("\n") ?? "";

  // Ask the bridge to fetch full context AND propose a plan using the right skill
  const prompt = `I need you to analyze this work item and create a detailed plan.

## Task Type: ${taskType}
Use the /parse-${taskType} skill approach to analyze this.

## Notification
- **Source**: ${notification.source}
- **Title**: ${notification.title}
- **Summary**: ${notification.summary}
${notification.url ? `- **URL**: ${notification.url}` : ""}
${linksText ? `\n## Related Links\n${linksText}` : ""}

## What I need from you

1. **Fetch full context**: Use your MCP tools to get all relevant details:
   - If Linear ticket: get the full description, acceptance criteria, comments, related issues
   - If Slack thread: get the full conversation
   - If GitHub PR: get the description, changed files, review comments
   - Check for any related Notion docs or specs

2. **Analyze and propose a plan**: Based on the context, tell me:
   - What exactly needs to be done (be specific)
   - What approach you'd recommend
   - Which files/areas of the codebase are likely involved
   - What model would be best for this (Haiku for simple, Sonnet for moderate, Opus for complex)
   - Estimated cost
   - Any risks or things to watch out for
   - What the agent will need access to (repos, branches, etc.)

3. **Format your response** as a clear plan I can review and approve. Be specific and actionable — I want to know exactly what the agent will do before I approve it.`;

  const response = await askBridge(prompt, 90000);
  log(`Plan response: ${response.length} chars`);

  const plan: WorkPlan = {
    notificationId: notification.id,
    title: notification.title,
    context: response,
    plan: response,
    estimatedModel: "", // Let the AI decide in its response
    estimatedCost: "",
    conversationHistory: [
      { role: "user", content: `Prepare a plan for: ${notification.title}` },
      { role: "assistant", content: response },
    ],
  };

  plans.set(notification.id, plan);
  savePlans();
  return plan;
}

/**
 * Send feedback on a plan — the user pushes back or asks for changes.
 * The Manager iterates on the plan based on the feedback.
 */
export async function iteratePlan(notificationId: string, userFeedback: string): Promise<WorkPlan> {
  const existing = plans.get(notificationId);
  if (!existing) throw new Error("No plan found for this notification");

  log(`iteratePlan: ${notificationId} feedback: ${userFeedback.slice(0, 100)}`);

  // Build conversation context
  const historyText = existing.conversationHistory
    .map(m => `${m.role === "user" ? "User" : "Manager"}: ${m.content}`)
    .join("\n\n---\n\n");

  const prompt = `We've been discussing a work plan. Here's the conversation so far:

${historyText}

---

User's feedback: ${userFeedback}

Please update your plan based on this feedback. Address the user's concerns and provide a revised plan.`;

  const response = await askBridge(prompt, 90000);

  existing.plan = response;
  existing.context = response;
  existing.conversationHistory.push(
    { role: "user", content: userFeedback },
    { role: "assistant", content: response },
  );

  savePlans();
  return existing;
}

/**
 * Start a work agent for an approved plan.
 * The Manager composes the full prompt — no hardcoded templates.
 */
export async function startWorkAgent(notificationId: string): Promise<string> {
  const plan = plans.get(notificationId);
  if (!plan) throw new Error("No plan found");

  log(`startWorkAgent: ${plan.title}`);

  // Ask the Manager to compose the actual work prompt
  const promptComposition = `Based on this approved plan, compose a complete prompt for a Claude Code agent that will execute this work. The agent has access to all MCP tools (Slack, Linear, GitHub, Notion) and standard code tools (Read, Write, Edit, Bash, etc.).

## The approved plan:
${plan.plan}

## What to include in the prompt:
- Clear task description
- All relevant context the agent needs
- Step-by-step instructions
- What to do when done (create PR, update ticket, etc.)
- Any constraints or things to avoid

Write the prompt as if you're giving instructions to a skilled developer. Be thorough but clear.`;

  const workPrompt = await askBridge(promptComposition, 60000);
  log(`Work prompt composed: ${workPrompt.length} chars`);

  // Spawn the work agent
  const claudePath = getClaudeCodePath();
  const agentId = `work-${Date.now()}`;

  const proc = spawn(claudePath, [
    "--output-format", "stream-json",
    "--verbose",
    "--input-format", "stream-json",
    "--no-chrome",
    "--model", "claude-sonnet-4-6",
    "--permission-mode", "default",
  ], {
    cwd: os.homedir(),
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Send the composed prompt
  const message = JSON.stringify({
    type: "user",
    message: { role: "user", content: workPrompt },
    parent_tool_use_id: null,
    uuid: agentId,
    session_id: "",
  });
  proc.stdin?.write(message + "\n");

  // Parse agent output and broadcast events to the UI
  let outputBuffer = "";
  proc.stdout?.on("data", (chunk: Buffer) => {
    outputBuffer += chunk.toString("utf-8");
    const lines = outputBuffer.split("\n");
    outputBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const event = parseAgentEvent(msg);
        if (event) {
          broadcastTaskEvent(agentId, event);
        }
      } catch {}
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    broadcastTaskEvent(agentId, {
      timestamp: new Date().toISOString(),
      type: "error",
      content: chunk.toString("utf-8").slice(0, 200),
    });
  });

  proc.on("exit", (code) => {
    log(`Work agent ${agentId} exited: ${code}`);
    activeWorkAgents.delete(agentId);
    broadcastTaskEvent(agentId, {
      timestamp: new Date().toISOString(),
      type: "completed",
      content: `Agent finished with exit code ${code}`,
    });
  });

  return agentId;
}

interface TaskEvent {
  timestamp: string;
  type: "started" | "progress" | "tool_use" | "error" | "completed" | "escalation" | "text";
  content: string;
}

function parseAgentEvent(msg: { type?: string; message?: { content?: unknown }; subtype?: string; result?: string }): TaskEvent | null {
  const now = new Date().toISOString();

  if (msg.type === "system" && msg.subtype === "init") {
    return { timestamp: now, type: "started", content: "Agent initialized" };
  }

  if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
    const blocks = msg.message!.content as Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
    for (const block of blocks) {
      if (block.type === "text" && block.text?.trim()) {
        return { timestamp: now, type: "text", content: block.text };
      }
      if (block.type === "tool_use" && block.name) {
        const input = block.input ?? {};
        let detail = block.name;
        if (block.name === "Bash") detail = `Run: ${String(input.command ?? "").slice(0, 80)}`;
        else if (block.name === "Read") detail = `Read: ${input.file_path}`;
        else if (block.name === "Write") detail = `Write: ${input.file_path}`;
        else if (block.name === "Edit") detail = `Edit: ${input.file_path}`;
        return { timestamp: now, type: "tool_use", content: detail };
      }
    }
  }

  if (msg.type === "result") {
    return { timestamp: now, type: "completed", content: String(msg.result ?? "Agent finished").slice(0, 500) };
  }

  return null;
}

function broadcastTaskEvent(agentId: string, event: TaskEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("task:event", { agentId, event });
    }
  }
}
}
