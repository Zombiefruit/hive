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

    // Quick checks (no AI needed)
    if (idleMs > 180000) {
      log(`Agent ${agentId} idle for ${Math.round(idleMs / 60000)}m`);
      broadcastEscalation(agentId, {
        timestamp: new Date().toISOString(),
        type: "escalation",
        content: `Agent "${agent.title}" has been idle for ${Math.round(idleMs / 60000)} minutes. It may be stuck or waiting for input.`,
      });
    }

    // Periodic progress summary every 5 minutes via bridge
    const timeSinceLastCheck = now - agent.lastCheckAt;
    if (timeSinceLastCheck > 300000 && agent.eventCount > 3) {
      log(`Agent ${agentId}: periodic check-in (${agent.eventCount} events, ${Math.round(elapsedMs / 60000)}m elapsed)`);

      // Ask the bridge to summarize the agent's progress
      try {
        const summary = await askBridge(
          `An agent working on "${agent.title}" has been running for ${Math.round(elapsedMs / 60000)} minutes with ${agent.eventCount} events. Based on this, generate a brief 1-sentence progress update for the user.`,
          15000
        );
        if (summary && summary.length > 10) {
          broadcastEscalation(agentId, {
            timestamp: new Date().toISOString(),
            type: "progress",
            content: summary.slice(0, 200),
          });
        }
      } catch {}
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
