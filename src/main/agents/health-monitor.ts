import { getAllAgents, addEvent, getPendingApprovals } from "../db/database";
import { broadcastStoreUpdate } from "../ipc/bridge";
import { getActiveAgentIds } from "./agent-manager";

/**
 * Proactive health monitoring for the agent fleet.
 * Runs periodically and detects:
 * - Agents idle for too long (may be stuck)
 * - Pending approvals that haven't been addressed
 * - Agents that errored without notification
 */

let monitorInterval: ReturnType<typeof setInterval> | null = null;
const notifiedStale = new Set<string>();
const notifiedApprovals = new Set<string>();

export function startHealthMonitor(): void {
  if (monitorInterval) return;

  monitorInterval = setInterval(() => {
    checkAgentHealth();
    checkStaleApprovals();
  }, 30000); // Check every 30 seconds

  // Also run once immediately after a delay
  setTimeout(() => {
    checkAgentHealth();
    checkStaleApprovals();
  }, 10000);
}

export function stopHealthMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

function checkAgentHealth(): void {
  const agents = getAllAgents();
  const activeIds = new Set(getActiveAgentIds());
  const now = Date.now();

  for (const agent of agents) {
    // Skip completed/errored agents
    if (agent.status === "completed" || agent.status === "errored") continue;

    // Check for agents marked active in DB but not in the active process map
    if (agent.status === "active" && agent.source === "deck" && !activeIds.has(agent.id)) {
      if (!notifiedStale.has(agent.id)) {
        notifiedStale.add(agent.id);
        addEvent(agent.id, "error", "Agent process appears to have exited unexpectedly");
        broadcastStoreUpdate();
      }
    }

    // Check for agents idle too long (>5 min since last update)
    const updatedAt = new Date(agent.updatedAt).getTime();
    const idleMs = now - updatedAt;
    if (agent.status === "active" && idleMs > 300000) { // 5 minutes
      if (!notifiedStale.has(`idle-${agent.id}`)) {
        notifiedStale.add(`idle-${agent.id}`);
        addEvent(agent.id, "error", `Agent has been idle for ${Math.round(idleMs / 60000)} minutes — may be stuck`);
        broadcastStoreUpdate();
      }
    }
  }
}

function checkStaleApprovals(): void {
  const approvals = getPendingApprovals();
  const now = Date.now();

  for (const approval of approvals) {
    const age = now - new Date(approval.timestamp).getTime();
    // Notify about approvals pending >2 minutes
    if (age > 120000 && !notifiedApprovals.has(approval.id)) {
      notifiedApprovals.add(approval.id);
      addEvent(
        approval.agentId,
        "approval",
        `Approval pending for ${Math.round(age / 60000)}min: ${approval.description.slice(0, 60)}`
      );
      broadcastStoreUpdate();
    }
  }
}
