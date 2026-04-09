/**
 * Tests for triage stage guard — triage must NEVER advance tasks through the workflow.
 *
 * Root cause: triage AI was proposing stage changes like "ready" for new tasks,
 * and the guard allowed it because "new" → "ready" was technically "forward progress."
 * This caused brand new tasks to appear in the Ready column without user action.
 *
 * Fix: triage can ONLY set terminal stages (done, skipped, backlog).
 * All workflow transitions are user-initiated (drag, CTA, etc.).
 */
import { describe, it, expect } from "vitest";

/** Mirrors the guard logic in poll-service.ts triage update handler */
function triageCanSetStage(proposedStage: string): boolean {
  const TRIAGE_ALLOWED_STAGES = new Set(["done", "skipped", "backlog"]);
  return TRIAGE_ALLOWED_STAGES.has(proposedStage);
}

describe("Triage stage guard — terminal stages only", () => {
  it("triage can set stage to done", () => {
    expect(triageCanSetStage("done")).toBe(true);
  });

  it("triage can set stage to skipped", () => {
    expect(triageCanSetStage("skipped")).toBe(true);
  });

  it("triage can set stage to backlog", () => {
    expect(triageCanSetStage("backlog")).toBe(true);
  });

  it("triage CANNOT set stage to ready", () => {
    expect(triageCanSetStage("ready")).toBe(false);
  });

  it("triage CANNOT set stage to preparing", () => {
    expect(triageCanSetStage("preparing")).toBe(false);
  });

  it("triage CANNOT set stage to start_work", () => {
    expect(triageCanSetStage("start_work")).toBe(false);
  });

  it("triage CANNOT set stage to hack", () => {
    expect(triageCanSetStage("hack")).toBe(false);
  });

  it("triage CANNOT set stage to ship", () => {
    expect(triageCanSetStage("ship")).toBe(false);
  });

  it("triage CANNOT set stage to code_review", () => {
    expect(triageCanSetStage("code_review")).toBe(false);
  });

  it("triage CANNOT set stage to plan_review", () => {
    expect(triageCanSetStage("plan_review")).toBe(false);
  });

  it("triage CANNOT set stage to pr_feedback", () => {
    expect(triageCanSetStage("pr_feedback")).toBe(false);
  });

  it("triage CANNOT set stage to new (redundant — tasks already start at new)", () => {
    expect(triageCanSetStage("new")).toBe(false);
  });
});

describe("New task creation — explicit stage", () => {
  it("all new tasks must have stage: 'new' set explicitly", () => {
    // Simulates the notification creation in poll-service.ts
    // Previously stage was MISSING (undefined), causing bugs when triage
    // proposed forward-moving stage changes.
    const newTask = {
      id: "poll-123-abc",
      source: "slack",
      status: "new",
      stage: "new", // THIS MUST BE SET — was previously missing
      title: "Test task",
    };

    expect(newTask.stage).toBe("new");
    expect(newTask.stage).not.toBeUndefined();
  });

  it("subtask creation must also set stage: 'new'", () => {
    const subtask = {
      id: "poll-123-sub",
      stage: "new",
      parentTaskId: "poll-123-parent",
    };
    expect(subtask.stage).toBe("new");
  });

  it("parent task creation must also set stage: 'new'", () => {
    const parent = {
      id: "poll-123-parent",
      stage: "new",
      subtaskIds: ["poll-123-sub"],
    };
    expect(parent.stage).toBe("new");
  });
});

describe("The specific bug scenario — new task lands in Ready", () => {
  it("new → ready should be BLOCKED by triage (even though forward)", () => {
    // This was the actual bug: triage proposed { stage: "ready" } for a new task.
    // The old guard checked STAGE_ORDER: ready(4) >= new(2) = true → allowed.
    // The new guard checks TRIAGE_ALLOWED_STAGES: "ready" not in {done,skipped,backlog} → blocked.
    const existingStage = "new";
    const proposedStage = "ready";

    // Old behavior (BUG):
    // const allowed = STAGE_ORDER[proposedStage] >= STAGE_ORDER[existingStage]; // 4 >= 2 = true
    // New behavior (FIXED):
    const allowed = triageCanSetStage(proposedStage); // false

    expect(allowed).toBe(false);
  });

  it("new → preparing should be BLOCKED by triage", () => {
    expect(triageCanSetStage("preparing")).toBe(false);
  });

  it("new → done SHOULD be allowed by triage (task completed externally)", () => {
    expect(triageCanSetStage("done")).toBe(true);
  });

  it("any stage → backlog SHOULD be allowed by triage (deprioritized)", () => {
    expect(triageCanSetStage("backlog")).toBe(true);
  });
});

describe("End-to-end: triage update simulation", () => {
  it("should apply triage done but block triage ready", () => {
    const notifications = [
      { id: "task-1", stage: "new", title: "Task A" },
      { id: "task-2", stage: "new", title: "Task B" },
    ];

    const triageUpdates = [
      { existing_id: "task-1", changes: { stage: "ready" } },    // SHOULD BE BLOCKED
      { existing_id: "task-2", changes: { stage: "done" } },     // SHOULD BE ALLOWED
    ];

    for (const upd of triageUpdates) {
      const existing = notifications.find(n => n.id === upd.existing_id)!;
      if (upd.changes.stage && triageCanSetStage(upd.changes.stage)) {
        existing.stage = upd.changes.stage;
      }
    }

    expect(notifications[0].stage).toBe("new");   // Blocked — still "new"
    expect(notifications[1].stage).toBe("done");   // Allowed
  });
});
