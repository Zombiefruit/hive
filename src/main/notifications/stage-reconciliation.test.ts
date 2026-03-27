/**
 * Tests for stage reconciliation — tasks with plans should NOT be reset to "new".
 *
 * Bug: loadCachedNotifications resets ALL "start_work" stage tasks to "new" on app restart,
 * even if they have completed plans. This causes planned tasks to appear back in Inbox.
 */

import { describe, it, expect } from "vitest";

interface MockNotification {
  id: string;
  stage: string;
  timeline: Array<{ timestamp: string; event: string }>;
}

interface MockPlan {
  notificationId: string;
  plan: string;
  conversationHistory: Array<{ role: string; content: string }>;
}

/**
 * Simulates the reconciliation logic that should run during loadCachedNotifications.
 * Only resets "start_work" tasks to "new" if NO plan exists for them.
 */
function reconcilePlanningStages(
  notifications: MockNotification[],
  plans: Map<string, MockPlan>,
): { reset: number; preserved: number } {
  let reset = 0;
  let preserved = 0;

  for (const n of notifications) {
    if (n.stage === "start_work") {
      const plan = plans.get(n.id);
      if (plan && plan.conversationHistory?.length > 0) {
        // Plan exists — keep in planning stage
        preserved++;
      } else {
        // No plan — reset to inbox
        n.stage = "new";
        n.timeline.push({ timestamp: new Date().toISOString(), event: "Reset from planning (app restarted)" });
        reset++;
      }
    }
  }

  return { reset, preserved };
}

describe("Stage Reconciliation on App Restart", () => {
  it("should reset tasks in 'planning' stage to 'new' when no plan exists", () => {
    const notifications: MockNotification[] = [
      { id: "task-1", stage: "start_work", timeline: [] },
      { id: "task-2", stage: "start_work", timeline: [] },
    ];
    const plans = new Map<string, MockPlan>();

    const result = reconcilePlanningStages(notifications, plans);

    expect(result.reset).toBe(2);
    expect(result.preserved).toBe(0);
    expect(notifications[0].stage).toBe("new");
    expect(notifications[1].stage).toBe("new");
  });

  it("should preserve 'planning' stage when a completed plan exists", () => {
    const notifications: MockNotification[] = [
      { id: "task-with-plan", stage: "start_work", timeline: [] },
    ];
    const plans = new Map<string, MockPlan>([
      ["task-with-plan", {
        notificationId: "task-with-plan",
        plan: "## TL;DR\nFix the auth token refresh...",
        conversationHistory: [
          { role: "user", content: "Prepare a plan for: Fix auth" },
          { role: "assistant", content: "## TL;DR\nFix the auth token refresh..." },
        ],
      }],
    ]);

    const result = reconcilePlanningStages(notifications, plans);

    expect(result.reset).toBe(0);
    expect(result.preserved).toBe(1);
    expect(notifications[0].stage).toBe("start_work");
  });

  it("should handle mixed — some with plans, some without", () => {
    const notifications: MockNotification[] = [
      { id: "has-plan", stage: "start_work", timeline: [] },
      { id: "no-plan", stage: "start_work", timeline: [] },
      { id: "also-has-plan", stage: "start_work", timeline: [] },
    ];
    const plans = new Map<string, MockPlan>([
      ["has-plan", {
        notificationId: "has-plan",
        plan: "Some plan",
        conversationHistory: [{ role: "user", content: "plan" }, { role: "assistant", content: "done" }],
      }],
      ["also-has-plan", {
        notificationId: "also-has-plan",
        plan: "Another plan",
        conversationHistory: [{ role: "user", content: "plan" }, { role: "assistant", content: "done" }],
      }],
    ]);

    const result = reconcilePlanningStages(notifications, plans);

    expect(result.reset).toBe(1);
    expect(result.preserved).toBe(2);
    expect(notifications[0].stage).toBe("start_work"); // has plan
    expect(notifications[1].stage).toBe("new"); // no plan
    expect(notifications[2].stage).toBe("start_work"); // has plan
  });

  it("should NOT touch tasks in other stages", () => {
    const notifications: MockNotification[] = [
      { id: "inbox", stage: "new", timeline: [] },
      { id: "hacking", stage: "hack", timeline: [] },
      { id: "done", stage: "done", timeline: [] },
    ];
    const plans = new Map<string, MockPlan>();

    reconcilePlanningStages(notifications, plans);

    expect(notifications[0].stage).toBe("new");
    expect(notifications[1].stage).toBe("hack");
    expect(notifications[2].stage).toBe("done");
  });

  it("should reset if plan exists but has empty conversation history", () => {
    const notifications: MockNotification[] = [
      { id: "empty-plan", stage: "start_work", timeline: [] },
    ];
    const plans = new Map<string, MockPlan>([
      ["empty-plan", {
        notificationId: "empty-plan",
        plan: "",
        conversationHistory: [],
      }],
    ]);

    const result = reconcilePlanningStages(notifications, plans);

    expect(result.reset).toBe(1);
    expect(notifications[0].stage).toBe("new");
  });
});
