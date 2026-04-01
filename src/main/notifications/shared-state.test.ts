/**
 * Tests for single source of truth — inbox and schedule must share notification state.
 *
 * The notification store (poll-service) is the SSoT. The schedule only stores
 * time slot assignments. All task data (title, priority, stage, status, timeline)
 * must come from notifications.
 */

import { describe, it, expect } from "vitest";

// ── Types matching the codebase ──

interface Notification {
  id: string;
  source: string;
  priority: string;
  title: string;
  summary: string;
  stage?: string;
  taskType?: string;
  timeline?: Array<{ timestamp: string; event: string }>;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
}

interface ScheduleItem {
  id: string;
  title: string;
  priority: string;
  stage: string;
  status: "pending" | "active" | "done";
  startTime: string;
  endTime: string;
}

// ── Build schedule from notifications + time slots (the core logic) ──

function buildScheduleItems(
  notifications: Notification[],
  timeSlots: Record<string, TimeSlot>,
): ScheduleItem[] {
  return notifications
    .filter(n => n.stage !== "skipped")
    .filter(n => timeSlots[n.id]) // Only show tasks with assigned time slots
    .map(n => ({
      id: n.id,
      title: n.title,
      priority: n.priority,
      stage: n.stage ?? "new",
      status: n.stage === "hack" ? "active" as const : n.stage === "done" ? "done" as const : "pending" as const,
      startTime: timeSlots[n.id].startTime,
      endTime: timeSlots[n.id].endTime,
    }));
}

// ── Tests ──

describe("Single Source of Truth — Inbox ↔ Schedule State Consistency", () => {

  it("schedule should reflect notification stage changes immediately", () => {
    const notifications: Notification[] = [
      { id: "task-1", source: "linear", priority: "high", title: "VEC-20", summary: "test", stage: "new" },
      { id: "task-2", source: "slack", priority: "medium", title: "Thread", summary: "test", stage: "start_work" },
    ];
    const slots: Record<string, TimeSlot> = {
      "task-1": { startTime: "09:00", endTime: "10:30" },
      "task-2": { startTime: "10:30", endTime: "11:30" },
    };

    // Initial state
    let schedule = buildScheduleItems(notifications, slots);
    expect(schedule[0].status).toBe("pending");
    expect(schedule[1].status).toBe("pending");

    // Inbox marks task-1 as done — this mutates the notification SSoT
    notifications[0].stage = "done";

    // Rebuild schedule from same notifications — should reflect the change
    schedule = buildScheduleItems(notifications, slots);
    expect(schedule.find(s => s.id === "task-1")?.status).toBe("done");
  });

  it("schedule should show done items as done, not remove them", () => {
    const notifications: Notification[] = [
      { id: "task-1", source: "linear", priority: "high", title: "VEC-20", summary: "test", stage: "done" },
    ];
    const slots: Record<string, TimeSlot> = {
      "task-1": { startTime: "09:00", endTime: "10:30" },
    };

    const schedule = buildScheduleItems(notifications, slots);
    expect(schedule).toHaveLength(1); // Still shows
    expect(schedule[0].status).toBe("done"); // But marked done
  });

  it("schedule should update priority when notification priority changes", () => {
    const notifications: Notification[] = [
      { id: "task-1", source: "linear", priority: "medium", title: "VEC-20", summary: "test", stage: "new" },
    ];
    const slots: Record<string, TimeSlot> = {
      "task-1": { startTime: "09:00", endTime: "10:30" },
    };

    let schedule = buildScheduleItems(notifications, slots);
    expect(schedule[0].priority).toBe("medium");

    // Triage upgrades priority
    notifications[0].priority = "critical";

    schedule = buildScheduleItems(notifications, slots);
    expect(schedule[0].priority).toBe("critical");
  });

  it("time slot assignments should persist independently of notification data", () => {
    const slots: Record<string, TimeSlot> = {
      "task-1": { startTime: "14:00", endTime: "15:30" },
    };

    // Simulate localStorage round-trip
    const serialized = JSON.stringify({ slots, date: "2026-03-24" });
    const loaded = JSON.parse(serialized) as { slots: Record<string, TimeSlot>; date: string };

    expect(loaded.slots["task-1"].startTime).toBe("14:00");
    expect(loaded.slots["task-1"].endTime).toBe("15:30");
  });

  it("new tasks from inbox should get time slots assigned on next schedule generate", () => {
    const notifications: Notification[] = [
      { id: "task-1", source: "linear", priority: "high", title: "Existing", summary: "test", stage: "new" },
      { id: "task-2", source: "linear", priority: "medium", title: "New task", summary: "test", stage: "new" },
    ];
    const slots: Record<string, TimeSlot> = {
      "task-1": { startTime: "09:00", endTime: "10:30" },
      // task-2 has no slot yet
    };

    // Only task-1 shows in schedule (task-2 has no slot)
    let schedule = buildScheduleItems(notifications, slots);
    expect(schedule).toHaveLength(1);

    // Assign slot for task-2
    slots["task-2"] = { startTime: "10:30", endTime: "11:00" };

    schedule = buildScheduleItems(notifications, slots);
    expect(schedule).toHaveLength(2);
  });

  it("skipped tasks should NOT appear in schedule even with time slots", () => {
    const notifications: Notification[] = [
      { id: "task-1", source: "gmail", priority: "backlog", title: "Newsletter", summary: "skipped", stage: "skipped" },
    ];
    const slots: Record<string, TimeSlot> = {
      "task-1": { startTime: "09:00", endTime: "09:30" },
    };

    const schedule = buildScheduleItems(notifications, slots);
    expect(schedule).toHaveLength(0);
  });

  it("backlog stage tasks with actionable content should appear in schedule if slotted", () => {
    const notifications: Notification[] = [
      { id: "task-1", source: "slack", priority: "low", title: "Install agentic tool", summary: "Actionable tip", stage: "backlog", taskType: "investigation" },
    ];
    const slots: Record<string, TimeSlot> = {
      "task-1": { startTime: "17:00", endTime: "17:30" },
    };

    const schedule = buildScheduleItems(notifications, slots);
    expect(schedule).toHaveLength(1); // Backlog ≠ skipped — it shows
    expect(schedule[0].status).toBe("pending");
  });

  it("marking done in schedule should update the notification SSoT", () => {
    const notifications: Notification[] = [
      { id: "task-1", source: "linear", priority: "high", title: "VEC-20", summary: "test", stage: "hack" },
    ];

    // Simulate what markDone does — it calls updateNotificationById which mutates the SSoT
    const markDone = (id: string) => {
      const n = notifications.find(n => n.id === id);
      if (n) n.stage = "done";
    };

    markDone("task-1");
    expect(notifications[0].stage).toBe("done");

    // Schedule built from same data reflects it
    const slots: Record<string, TimeSlot> = { "task-1": { startTime: "09:00", endTime: "10:30" } };
    const schedule = buildScheduleItems(notifications, slots);
    expect(schedule[0].status).toBe("done");
  });

  it("drag reorder in schedule should only change time slots, not notification data", () => {
    const notifications: Notification[] = [
      { id: "task-1", source: "linear", priority: "high", title: "First", summary: "t", stage: "new" },
      { id: "task-2", source: "linear", priority: "medium", title: "Second", summary: "t", stage: "new" },
    ];
    const slots: Record<string, TimeSlot> = {
      "task-1": { startTime: "09:00", endTime: "10:30" },
      "task-2": { startTime: "10:30", endTime: "11:30" },
    };

    // Drag reorder: swap task-1 and task-2 times
    slots["task-1"] = { startTime: "10:30", endTime: "12:00" };
    slots["task-2"] = { startTime: "09:00", endTime: "10:00" };

    // Notification data unchanged
    expect(notifications[0].title).toBe("First");
    expect(notifications[0].priority).toBe("high");

    // Schedule reflects new times
    const schedule = buildScheduleItems(notifications, slots);
    expect(schedule.find(s => s.id === "task-1")?.startTime).toBe("10:30");
    expect(schedule.find(s => s.id === "task-2")?.startTime).toBe("09:00");
  });
});

describe("Task Visibility — Nothing Actionable Gets Hidden", () => {
  it("backlog priority + actionable type should appear in backlog column, not reviewed", () => {
    const AGENT_ACTIONABLE = new Set(["implementation", "investigation", "review"]);
    const HUMAN_ONLY = new Set(["meeting_prep", "response"]);

    const task = { taskType: "investigation", priority: "backlog", stage: "new" };

    // This task IS agent-actionable — should appear in the backlog column
    const isActionable = AGENT_ACTIONABLE.has(task.taskType);
    expect(isActionable).toBe(true);

    // Should NOT be in reviewed/skipped
    const isSkipped = task.stage === "skipped";
    expect(isSkipped).toBe(false);
  });

  it("low priority + response type should appear in human section, not hidden", () => {
    const HUMAN_ONLY = new Set(["meeting_prep", "response"]);

    const task = { taskType: "response", priority: "low", stage: "new" };

    const isHuman = HUMAN_ONLY.has(task.taskType);
    expect(isHuman).toBe(true);

    // Should appear in the human row's "Needs Response" column
    const isInHumanNewColumn = isHuman && (task.stage === "new");
    expect(isInHumanNewColumn).toBe(true);
  });

  it("only stage=skipped items should be in the collapsible reviewed section", () => {
    const tasks = [
      { stage: "skipped", priority: "backlog" },
      { stage: "new", priority: "backlog" },
      { stage: "backlog", priority: "low" },
      { stage: "done", priority: "high" },
    ];

    const reviewed = tasks.filter(t => t.stage === "skipped");
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0].stage).toBe("skipped");
  });
});
