/**
 * Orchestrator — autonomous agent that watches all tasks and drives progression.
 * Replaces the reactive Manager Agent with a proactive loop that:
 * - Monitors task states and advances them based on verdicts
 * - Detects stalled tasks and escalates
 * - Coordinates subtask completion → parent advancement
 * - Broadcasts its thinking to the UI as a "thinking bubble"
 */

import { BrowserWindow } from "electron";
import { getNotifications, updateNotificationById } from "./notifications/poll-service";
import { addDebugEntry } from "./mcp-bridge";
import { computeParentStage } from "../shared/task-utils";
import type { Escalation } from "../shared/escalation-types";
import { randomUUID } from "node:crypto";

// ── State ──

let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
const escalations: Escalation[] = [];
const recentThoughts: Array<{ timestamp: string; thought: string }> = [];

// ── Thinking bubble — broadcasts to UI ──

function think(thought: string): void {
  const entry = { timestamp: new Date().toISOString(), thought };
  recentThoughts.push(entry);
  if (recentThoughts.length > 50) recentThoughts.shift();

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("orchestrator:thought", entry);
    }
  }
  addDebugEntry("out", `🧠 [ORCH] ${thought}`, "orchestrator");
}

// ── Core loop ──

async function tick(): Promise<void> {
  const notifications = getNotifications();
  const active = notifications.filter(n => n.stage && !["done", "skipped", "new"].includes(n.stage));

  if (active.length === 0) return;

  // 1. Check for parent tasks that need stage updates
  const parents = notifications.filter(n => n.subtaskIds && n.subtaskIds.length > 0);
  for (const parent of parents) {
    const children = notifications.filter(n => parent.subtaskIds!.includes(n.id));
    const childStages = children.map(c => c.stage ?? "new");
    const computed = computeParentStage(childStages);
    if (computed !== parent.stage) {
      think(`Parent "${parent.title}" stage: ${parent.stage} → ${computed} (from ${childStages.join(", ")})`);
      updateNotificationById(parent.id, { stage: computed });
    }
  }

  // 2. Detect stalled tasks (in active stage with no timeline update in 15+ min)
  const now = Date.now();
  for (const n of active) {
    const lastEvent = n.timeline?.[n.timeline.length - 1];
    if (!lastEvent) continue;
    const lastEventTime = new Date(lastEvent.timestamp).getTime();
    const minutesSince = (now - lastEventTime) / 60000;

    if (minutesSince > 15 && n.stage === "hack") {
      // Check if we already escalated this task recently
      const recentEscalation = escalations.find(e => e.taskId === n.id && !e.resolvedAt);
      if (!recentEscalation) {
        think(`Task "${n.title}" has been in ${n.stage} for ${Math.round(minutesSince)}min with no activity — escalating`);
        escalations.push({
          id: randomUUID(),
          taskId: n.id,
          agentId: "",
          type: "stuck",
          severity: minutesSince > 30 ? "high" : "medium",
          summary: `Task stalled in ${n.stage} stage for ${Math.round(minutesSince)} minutes`,
          whatWasTried: [`Last activity: ${lastEvent.event}`],
          suggestedActions: ["Check agent output", "Restart work agent", "Manually advance"],
          createdAt: new Date().toISOString(),
        });

        // Broadcast escalation to UI
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send("orchestrator:escalation", escalations[escalations.length - 1]);
          }
        }
      }
    }
  }

  // 3. Check for tasks in plan_review that have been reviewed (have verdicts)
  const planReviewTasks = active.filter(n => n.stage === "plan_review");
  for (const n of planReviewTasks) {
    if (n.verdict?.status === "approved") {
      think(`Plan for "${n.title}" was approved by judge — ready for user to start work`);
    }
  }
}

// ── Public API ──

export function startOrchestrator(): void {
  if (running) return;
  running = true;
  think("Orchestrator started — monitoring all active tasks");

  // Run every 60 seconds
  intervalId = setInterval(() => {
    tick().catch(err => {
      addDebugEntry("out", `❌ [ORCH] Tick error: ${String(err).slice(0, 100)}`, "orchestrator");
    });
  }, 60000);

  // Run immediately on start
  tick().catch(() => {});
}

export function stopOrchestrator(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  running = false;
  think("Orchestrator stopped");
}

export function getOrchestratorStatus(): {
  running: boolean;
  escalations: Escalation[];
  recentThoughts: Array<{ timestamp: string; thought: string }>;
} {
  return { running, escalations, recentThoughts };
}

export function resolveEscalation(id: string, resolution: string): void {
  const esc = escalations.find(e => e.id === id);
  if (esc) {
    esc.resolvedAt = new Date().toISOString();
    esc.resolution = resolution;
    think(`Escalation resolved: ${esc.summary} → ${resolution}`);
  }
}

export function getRecentThoughts(limit = 10): Array<{ timestamp: string; thought: string }> {
  return recentThoughts.slice(-limit);
}

/** Emit a thought from outside the orchestrator (e.g., poll service, judges). */
export function emitThought(thought: string): void {
  think(thought);
}
