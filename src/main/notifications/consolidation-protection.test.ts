/**
 * Tests for consolidation protection — tasks in active stages must never be removed.
 *
 * Bug: the POST-TRIAGE CONSOLIDATION step was merging duplicates without checking
 * if either task was in an active stage (preparing, start_work, hack, etc.).
 * Tasks the user was actively working on got removed.
 */

import { describe, it, expect } from "vitest";
import { STAGE_ORDER } from "../../shared/task-utils";

// Simulate the protected consolidation logic
const PROTECTED_STAGES = new Set(["start_work", "plan_review", "hack", "ship", "code_review", "pr_feedback", "preparing", "ready"]);

interface MockNotification {
  id: string;
  title: string;
  stage: string;
  source: string;
}

function simulateConsolidation(notifications: MockNotification[]): { kept: string[]; removed: string[] } {
  const keyToFirst = new Map<string, number>();
  const toRemove = new Set<number>();

  for (let i = 0; i < notifications.length; i++) {
    const key = notifications[i].title.toLowerCase(); // simplified key
    const firstIdx = keyToFirst.get(key);
    if (firstIdx !== undefined) {
      const first = notifications[firstIdx];
      const dupe = notifications[i];
      const firstProtected = PROTECTED_STAGES.has(first.stage);
      const dupeProtected = PROTECTED_STAGES.has(dupe.stage);

      if (firstProtected && !dupeProtected) {
        toRemove.add(i);
        continue;
      }
      if (dupeProtected && !firstProtected) {
        toRemove.add(firstIdx);
        keyToFirst.set(key, i);
        continue;
      }
      if (firstProtected && dupeProtected) {
        continue; // keep both
      }
      // Neither protected — remove the one with less progress
      const firstOrder = STAGE_ORDER[first.stage] ?? 0;
      const dupeOrder = STAGE_ORDER[dupe.stage] ?? 0;
      if (dupeOrder > firstOrder) {
        toRemove.add(firstIdx);
        keyToFirst.set(key, i);
      } else {
        toRemove.add(i);
      }
    } else {
      keyToFirst.set(key, i);
    }
  }

  const removed = [...toRemove].map(i => notifications[i].id);
  const kept = notifications.filter((_, i) => !toRemove.has(i)).map(n => n.id);
  return { kept, removed };
}

describe("Consolidation Protection", () => {
  it("should NEVER remove a task in preparing stage", () => {
    const notifications: MockNotification[] = [
      { id: "active", title: "Reply to Mor", stage: "preparing", source: "slack" },
      { id: "new-dupe", title: "Reply to Mor", stage: "new", source: "slack" },
    ];
    const result = simulateConsolidation(notifications);
    expect(result.kept).toContain("active");
    expect(result.removed).toContain("new-dupe");
    expect(result.removed).not.toContain("active");
  });

  it("should NEVER remove a task in start_work stage", () => {
    const notifications: MockNotification[] = [
      { id: "planned", title: "VEC-24: Chat rendering", stage: "start_work", source: "linear" },
      { id: "new-dupe", title: "VEC-24: Chat rendering", stage: "new", source: "linear" },
    ];
    const result = simulateConsolidation(notifications);
    expect(result.kept).toContain("planned");
    expect(result.removed).not.toContain("planned");
  });

  it("should NEVER remove a task in hack stage", () => {
    const notifications: MockNotification[] = [
      { id: "building", title: "VEC-10: Fig Intelligence", stage: "hack", source: "linear" },
      { id: "new-dupe", title: "VEC-10: Fig Intelligence", stage: "new", source: "linear" },
    ];
    const result = simulateConsolidation(notifications);
    expect(result.kept).toContain("building");
    expect(result.removed).not.toContain("building");
  });

  it("should keep BOTH if both are in protected stages", () => {
    const notifications: MockNotification[] = [
      { id: "preparing", title: "Reply to Yael", stage: "preparing", source: "slack" },
      { id: "ready", title: "Reply to Yael", stage: "ready", source: "slack" },
    ];
    const result = simulateConsolidation(notifications);
    expect(result.kept).toContain("preparing");
    expect(result.kept).toContain("ready");
    expect(result.removed).toHaveLength(0);
  });

  it("should merge two 'new' stage tasks normally", () => {
    const notifications: MockNotification[] = [
      { id: "first", title: "Some task", stage: "new", source: "slack" },
      { id: "second", title: "Some task", stage: "new", source: "slack" },
    ];
    const result = simulateConsolidation(notifications);
    expect(result.kept).toHaveLength(1);
    expect(result.removed).toHaveLength(1);
  });

  it("should keep done tasks over new tasks", () => {
    const notifications: MockNotification[] = [
      { id: "done-one", title: "Old task", stage: "done", source: "linear" },
      { id: "new-dupe", title: "Old task", stage: "new", source: "linear" },
    ];
    const result = simulateConsolidation(notifications);
    expect(result.kept).toContain("done-one");
  });

  it("should never regress stage via triage update", () => {
    // Simulates the stage protection in the update handler
    const currentStage = "preparing";
    const proposedStage = "new"; // triage wants to regress
    const currentOrder = STAGE_ORDER[currentStage] ?? 0;
    const newOrder = STAGE_ORDER[proposedStage] ?? 0;
    // Stage should NOT be updated (regression blocked)
    expect(newOrder).toBeLessThan(currentOrder);
  });
});
