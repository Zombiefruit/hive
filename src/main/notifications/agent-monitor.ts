/**
 * Agent Monitor — the Manager's oversight loop.
 * Periodically checks running work agents, detects stuck/idle states,
 * and escalates to the user through both the task page and Manager chat.
 */

import { BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { notifyAgentCompleted, notifyAgentError } from "../native-notifications";

const LOG_PATH = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "monitor.log");
function log(msg: string): void {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

type AgentStatus = "running" | "idle" | "stuck" | "completed" | "errored";

interface MonitoredAgent {
  agentId: string;
  title: string;
  startedAt: number;
  lastEventAt: number;
  eventCount: number;
  lastCheckAt: number;
  status: AgentStatus;
  lastEscalationAt: number;
  lastOutput: string;
}

const monitoredAgents = new Map<string, MonitoredAgent>();
let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startMonitoring(): void {
  if (monitorInterval) return;
  monitorInterval = setInterval(checkAgents, 30000); // Every 30s
}

export function stopMonitoring(): void {
  if (monitorInterval) { clearInterval(monitorInterval); monitorInterval = null; }
}

export function registerAgent(agentId: string, title: string): void {
  const now = Date.now();
  monitoredAgents.set(agentId, {
    agentId, title, startedAt: now, lastEventAt: now, eventCount: 0,
    lastCheckAt: now, status: "running", lastEscalationAt: 0, lastOutput: "",
  });
  log(`Registered agent ${agentId}: ${title}`);
}

export function recordAgentEvent(agentId: string, output?: string): void {
  const agent = monitoredAgents.get(agentId);
  if (agent) {
    agent.lastEventAt = Date.now();
    agent.eventCount++;
    agent.status = "running";
    if (output) agent.lastOutput = output.slice(0, 500);
  }
}

export function markAgentCompleted(agentId: string): void {
  const agent = monitoredAgents.get(agentId);
  if (agent) {
    agent.status = "completed";
    broadcastEscalation(agentId, {
      timestamp: new Date().toISOString(),
      type: "completed",
      content: `Agent "${agent.title}" completed after ${Math.round((Date.now() - agent.startedAt) / 60000)} minutes (${agent.eventCount} events).`,
    });
    notifyAgentCompleted(agent.title);
    log(`Agent ${agentId} completed`);
  }
}

export function markAgentErrored(agentId: string, error: string): void {
  const agent = monitoredAgents.get(agentId);
  if (agent) {
    agent.status = "errored";
    broadcastEscalation(agentId, {
      timestamp: new Date().toISOString(),
      type: "error",
      content: `Agent "${agent.title}" errored: ${error.slice(0, 200)}`,
    });
    notifyAgentError(agentId, agent.title, error);
    log(`Agent ${agentId} errored: ${error.slice(0, 100)}`);
  }
}

export function unregisterAgent(agentId: string): void {
  monitoredAgents.delete(agentId);
}

/** Get a summary of all monitored agents for the Manager's context. */
export function getMonitorSummary(): string {
  if (monitoredAgents.size === 0) return "No agents being monitored.";
  const lines: string[] = [];
  for (const [, agent] of monitoredAgents) {
    const elapsed = Math.round((Date.now() - agent.startedAt) / 60000);
    const idle = Math.round((Date.now() - agent.lastEventAt) / 60000);
    lines.push(`- [${agent.status}] "${agent.title}" (${elapsed}m elapsed, ${idle}m idle, ${agent.eventCount} events)`);
    if (agent.lastOutput) lines.push(`  Last: ${agent.lastOutput.slice(0, 100)}`);
  }
  return lines.join("\n");
}

async function checkAgents(): Promise<void> {
  const now = Date.now();

  for (const [agentId, agent] of monitoredAgents) {
    if (agent.status === "completed" || agent.status === "errored") continue;

    const idleMs = now - agent.lastEventAt;
    const elapsedMs = now - agent.startedAt;
    const timeSinceEscalation = now - agent.lastEscalationAt;

    // Idle detection: no events for 3+ minutes
    if (idleMs > 180000 && agent.status !== "idle") {
      agent.status = "idle";
      log(`Agent ${agentId} idle for ${Math.round(idleMs / 60000)}m`);
    }

    // Stuck detection: idle for 10+ minutes with very few events
    if (idleMs > 600000 && agent.eventCount < 5 && agent.status !== "stuck") {
      agent.status = "stuck";
      log(`Agent ${agentId} appears stuck (${agent.eventCount} events in ${Math.round(elapsedMs / 60000)}m)`);
    }

    // Escalate idle/stuck agents (max once per 5 min to avoid spam)
    if ((agent.status === "idle" || agent.status === "stuck") && timeSinceEscalation > 300000) {
      agent.lastEscalationAt = now;
      broadcastEscalation(agentId, {
        timestamp: new Date().toISOString(),
        type: "escalation",
        content: agent.status === "stuck"
          ? `Agent "${agent.title}" appears stuck — ${agent.eventCount} events in ${Math.round(elapsedMs / 60000)} minutes. Consider interrupting or restarting.`
          : `Agent "${agent.title}" idle for ${Math.round(idleMs / 60000)} minutes. It may need input or have completed silently.`,
      });
    }

    // Periodic progress updates every 5 minutes for actively running agents
    const timeSinceCheck = now - agent.lastCheckAt;
    if (timeSinceCheck > 300000 && agent.status === "running" && agent.eventCount > 3) {
      agent.lastCheckAt = now;
      broadcastEscalation(agentId, {
        timestamp: new Date().toISOString(),
        type: "progress",
        content: `Agent "${agent.title}": ${agent.eventCount} events, running for ${Math.round(elapsedMs / 60000)} minutes.`,
      });
    }
  }
}

function broadcastEscalation(agentId: string, event: { timestamp: string; type: string; content: string }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("task:event", { agentId, event });
    }
  }
}
