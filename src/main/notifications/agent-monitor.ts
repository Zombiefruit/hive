/**
 * Agent Monitor — the Manager's oversight loop.
 * Periodically checks running work agents and escalates when needed.
 */

import { askBridge, isBridgeReady } from "../mcp-bridge";
import { BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const LOG_PATH = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "monitor.log");
function log(msg: string): void {
  try { fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`); } catch {}
}

interface MonitoredAgent {
  agentId: string;
  title: string;
  startedAt: number;
  lastEventAt: number;
  eventCount: number;
  lastCheckAt: number;
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
    agentId, title, startedAt: now, lastEventAt: now, eventCount: 0, lastCheckAt: now,
  });
  log(`Registered agent ${agentId}: ${title}`);
}

export function recordAgentEvent(agentId: string): void {
  const agent = monitoredAgents.get(agentId);
  if (agent) {
    agent.lastEventAt = Date.now();
    agent.eventCount++;
  }
}

export function unregisterAgent(agentId: string): void {
  monitoredAgents.delete(agentId);
}

async function checkAgents(): Promise<void> {
  if (!isBridgeReady()) return;

  for (const [agentId, agent] of monitoredAgents) {
    const now = Date.now();
    const idleMs = now - agent.lastEventAt;
    const elapsedMs = now - agent.startedAt;

    // Check if agent has been idle for > 3 minutes
    if (idleMs > 180000) {
      log(`Agent ${agentId} idle for ${Math.round(idleMs / 60000)}m — escalating`);
      broadcastEscalation(agentId, {
        timestamp: new Date().toISOString(),
        type: "escalation",
        content: `Agent has been idle for ${Math.round(idleMs / 60000)} minutes. It may be stuck or waiting for approval. Check its status.`,
      });
    }

    // Check if agent has been running too long (> 15 minutes)
    if (elapsedMs > 900000 && agent.eventCount < 5) {
      log(`Agent ${agentId} running ${Math.round(elapsedMs / 60000)}m with only ${agent.eventCount} events — may be stuck`);
      broadcastEscalation(agentId, {
        timestamp: new Date().toISOString(),
        type: "escalation",
        content: `Agent has been running for ${Math.round(elapsedMs / 60000)} minutes with minimal activity (${agent.eventCount} events). Consider checking its progress.`,
      });
    }

    agent.lastCheckAt = now;
  }
}

function broadcastEscalation(agentId: string, event: { timestamp: string; type: string; content: string }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("task:event", { agentId, event });
    }
  }
}
