/**
 * Work Dispatcher — handles the "Start work" action from the inbox.
 *
 * Flow:
 * 1. User clicks "Start work" on a notification
 * 2. Dispatcher asks the MCP bridge for full context
 * 3. Returns a plan summary to the user
 * 4. On user approval, spawns a non-headless work agent
 */

import { askBridge, isBridgeReady } from "../mcp-bridge";
import { spawn, ChildProcess } from "node:child_process";
import { getClaudeCodePath } from "../claude-path";
import { BrowserWindow } from "electron";
import { addEvent } from "../db/database";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const LOG_PATH = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "dispatcher.log");

function log(msg: string): void {
  try {
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

export interface WorkPlan {
  notificationId: string;
  title: string;
  context: string;
  plan: string;
  estimatedModel: string;
  estimatedCost: string;
}

const activeWorkAgents = new Map<string, ChildProcess>();

/**
 * Fetch full context for a notification and generate a work plan.
 * Returns the plan for user approval — does NOT start work automatically.
 */
export async function prepareWorkPlan(notification: {
  id: string;
  source: string;
  title: string;
  summary: string;
  url?: string;
}): Promise<WorkPlan> {
  log(`prepareWorkPlan: ${notification.title}`);

  if (!isBridgeReady()) {
    return {
      notificationId: notification.id,
      title: notification.title,
      context: notification.summary,
      plan: "MCP Bridge not ready — try again in a few seconds.",
      estimatedModel: "claude-sonnet-4-6",
      estimatedCost: "$0",
    };
  }

  // Ask the bridge for full context
  const contextPrompt = `I need full context for this work item:

Title: ${notification.title}
Source: ${notification.source}
Summary: ${notification.summary}
${notification.url ? `URL: ${notification.url}` : ""}

Please fetch all relevant details:
- If it's a Linear ticket, get the full description, comments, and related issues
- If it's a Slack thread, get the full thread with all messages
- If it's a GitHub PR, get the PR description, changed files summary, and review comments
- Any related Notion specs or docs

Return a comprehensive context summary in plain text (not JSON). Include everything I'd need to understand and work on this.`;

  const context = await askBridge(contextPrompt, 60000);
  log(`Context received: ${context.length} chars`);

  // Generate a plan summary
  const plan = generatePlanFromContext(notification, context);

  return {
    notificationId: notification.id,
    title: notification.title,
    context: context.slice(0, 5000),
    plan,
    estimatedModel: estimateModel(notification, context),
    estimatedCost: estimateCost(notification, context),
  };
}

function generatePlanFromContext(notification: { source: string; title: string }, context: string): string {
  // Simple heuristic plan — in the future, the Manager AI generates this
  if (notification.source === "github") {
    return `1. Read the PR changes and understand the diff\n2. Review code for bugs, style, and best practices\n3. Check against CLAUDE.md coding standards\n4. Post review comments`;
  }
  if (notification.source === "linear") {
    return `1. Understand the ticket requirements from the description\n2. Check related Slack threads for additional context\n3. Implement the changes in a new branch\n4. Write tests\n5. Create a draft PR`;
  }
  return `1. Review the notification context\n2. Determine required actions\n3. Execute the work\n4. Report results`;
}

function estimateModel(notification: { source: string }, context: string): string {
  if (notification.source === "github") return "claude-sonnet-4-6"; // Reviews are balanced
  if (context.length > 3000) return "claude-opus-4-6"; // Complex context needs Opus
  return "claude-sonnet-4-6";
}

function estimateCost(notification: { source: string }, context: string): string {
  if (notification.source === "github") return "~$0.50";
  if (context.length > 3000) return "~$2.00";
  return "~$1.00";
}

/**
 * Start a work agent for an approved plan.
 * The agent is a non-headless Claude Code process with full MCP access.
 */
export function startWorkAgent(plan: WorkPlan): string {
  const agentId = `work-${Date.now()}`;
  log(`Starting work agent ${agentId} for: ${plan.title}`);

  const claudePath = getClaudeCodePath();
  const workPrompt = `You are working on the following task:

## ${plan.title}

## Context
${plan.context}

## Plan
${plan.plan}

## Instructions
- Work through the plan step by step
- Use MCP tools (Slack, Linear, GitHub) as needed to gather more context
- For code changes, create a new git branch
- Write tests for your changes
- Create a draft PR when done
- Report your progress clearly

Start working now.`;

  const proc = spawn(claudePath, [
    "--output-format", "stream-json",
    "--verbose",
    "--input-format", "stream-json",
    "--no-chrome",
    "--model", plan.estimatedModel,
    // Work agents need approval for destructive operations
    "--permission-mode", "default",
  ], {
    cwd: os.homedir(),
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Send the initial prompt
  const message = JSON.stringify({
    type: "user",
    message: { role: "user", content: workPrompt },
    parent_tool_use_id: null,
    uuid: agentId,
    session_id: "",
  });
  proc.stdin?.write(message + "\n");

  activeWorkAgents.set(agentId, proc);

  // Broadcast status updates
  proc.stdout?.on("data", (chunk: Buffer) => {
    // TODO: parse stream-json and update agent status in DB
  });

  proc.on("exit", (code) => {
    log(`Work agent ${agentId} exited with code ${code}`);
    activeWorkAgents.delete(agentId);
  });

  return agentId;
}
