/**
 * Tests for schedule day rollover and header summary.
 *
 * BUG 1: Tasks scheduled at 9:30pm and 10:15pm when it's 8pm.
 * After working hours end, new tasks should roll to tomorrow morning.
 *
 * BUG 2: Schedule starts abruptly at 9:00 with no context.
 * Should show a condensed summary/header before the timeline.
 */

import { describe, it, expect } from "vitest";

// ── Day Rollover Logic ──

function computeNextSlot(
  nowMinutes: number,
  workingHoursEnd: string,
  workingHoursStart: string,
): { startMinutes: number; isNextDay: boolean } {
  const endMinutes = parseInt(workingHoursEnd.split(":")[0]) * 60 + parseInt(workingHoursEnd.split(":")[1]);
  const startMinutes = parseInt(workingHoursStart.split(":")[0]) * 60 + parseInt(workingHoursStart.split(":")[1]);

  // Round up to next 15min
  const rounded = Math.ceil(nowMinutes / 15) * 15;

  if (rounded >= endMinutes) {
    // Past working hours — roll to tomorrow morning
    return { startMinutes, isNextDay: true };
  }

  // Within working hours — start from now
  return { startMinutes: Math.max(rounded, startMinutes), isNextDay: false };
}

describe("Schedule Day Rollover", () => {
  it("should roll to next morning when current time is past working hours end", () => {
    // 8:00 PM = 20:00 = 1200 minutes, working hours end at 18:00 = 1080
    const result = computeNextSlot(1200, "18:00", "09:00");

    expect(result.isNextDay).toBe(true);
    expect(result.startMinutes).toBe(540); // 09:00 = 540 minutes
  });

  it("should stay on today when within working hours", () => {
    // 2:00 PM = 14:00 = 840 minutes
    const result = computeNextSlot(840, "18:00", "09:00");

    expect(result.isNextDay).toBe(false);
    expect(result.startMinutes).toBe(840); // Start from now
  });

  it("should roll to morning when exactly at end of working hours", () => {
    // 6:00 PM = 18:00 = 1080 minutes
    const result = computeNextSlot(1080, "18:00", "09:00");

    expect(result.isNextDay).toBe(true);
    expect(result.startMinutes).toBe(540); // Tomorrow 09:00
  });

  it("should start from working hours start if current time is before it", () => {
    // 7:00 AM = 420 minutes, working hours start at 09:00
    const result = computeNextSlot(420, "18:00", "09:00");

    expect(result.isNextDay).toBe(false);
    expect(result.startMinutes).toBe(540); // 09:00, not 07:00
  });

  it("should round up to next 15min boundary", () => {
    // 2:07 PM = 847 minutes → should round to 2:15 PM = 855
    const result = computeNextSlot(847, "18:00", "09:00");

    expect(result.isNextDay).toBe(false);
    expect(result.startMinutes).toBe(855);
  });

  it("should handle late night (past midnight)", () => {
    // 1:00 AM = 60 minutes — before working hours
    const result = computeNextSlot(60, "18:00", "09:00");

    expect(result.isNextDay).toBe(false);
    expect(result.startMinutes).toBe(540); // 09:00 today
  });
});

// ── Schedule Header Summary ──

interface ScheduleTask {
  title: string;
  priority: string;
  estimatedMinutes: number;
  status: "pending" | "active" | "done";
}

function buildScheduleSummary(tasks: ScheduleTask[], isNextDay: boolean): {
  dateLabel: string;
  taskCount: number;
  doneCount: number;
  totalMinutes: number;
  topTasks: string[];
} {
  const pending = tasks.filter(t => t.status !== "done");
  const done = tasks.filter(t => t.status === "done");
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, backlog: 4 };

  const topTasks = pending
    .sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2))
    .slice(0, 3)
    .map(t => t.title);

  const today = new Date();
  const targetDate = isNextDay ? new Date(today.getTime() + 86400000) : today;
  const dateLabel = targetDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return {
    dateLabel,
    taskCount: pending.length,
    doneCount: done.length,
    totalMinutes: pending.reduce((sum, t) => sum + t.estimatedMinutes, 0),
    topTasks,
  };
}

describe("Schedule Header Summary", () => {
  it("should show tomorrow's date when rolled over", () => {
    const tasks: ScheduleTask[] = [
      { title: "VEC-20: Coverage gaps", priority: "high", estimatedMinutes: 90, status: "pending" },
    ];

    const summary = buildScheduleSummary(tasks, true);

    // Should say tomorrow's date
    const tomorrow = new Date(Date.now() + 86400000);
    const expectedDay = tomorrow.toLocaleDateString("en-US", { weekday: "long" });
    expect(summary.dateLabel).toContain(expectedDay);
  });

  it("should show today's date when not rolled over", () => {
    const tasks: ScheduleTask[] = [
      { title: "VEC-20", priority: "high", estimatedMinutes: 90, status: "pending" },
    ];

    const summary = buildScheduleSummary(tasks, false);

    const today = new Date();
    const expectedDay = today.toLocaleDateString("en-US", { weekday: "long" });
    expect(summary.dateLabel).toContain(expectedDay);
  });

  it("should count pending and done tasks separately", () => {
    const tasks: ScheduleTask[] = [
      { title: "Task 1", priority: "high", estimatedMinutes: 90, status: "pending" },
      { title: "Task 2", priority: "medium", estimatedMinutes: 45, status: "done" },
      { title: "Task 3", priority: "low", estimatedMinutes: 30, status: "pending" },
    ];

    const summary = buildScheduleSummary(tasks, false);

    expect(summary.taskCount).toBe(2); // pending only
    expect(summary.doneCount).toBe(1);
  });

  it("should show total estimated time for pending tasks", () => {
    const tasks: ScheduleTask[] = [
      { title: "Task 1", priority: "high", estimatedMinutes: 90, status: "pending" },
      { title: "Task 2", priority: "medium", estimatedMinutes: 45, status: "pending" },
      { title: "Task 3", priority: "low", estimatedMinutes: 30, status: "done" },
    ];

    const summary = buildScheduleSummary(tasks, false);

    expect(summary.totalMinutes).toBe(135); // 90 + 45, not 30 (done)
  });

  it("should show top 3 tasks by priority", () => {
    const tasks: ScheduleTask[] = [
      { title: "Low task", priority: "low", estimatedMinutes: 30, status: "pending" },
      { title: "Critical task", priority: "critical", estimatedMinutes: 60, status: "pending" },
      { title: "High task", priority: "high", estimatedMinutes: 45, status: "pending" },
      { title: "Medium task", priority: "medium", estimatedMinutes: 30, status: "pending" },
    ];

    const summary = buildScheduleSummary(tasks, false);

    expect(summary.topTasks).toHaveLength(3);
    expect(summary.topTasks[0]).toBe("Critical task");
    expect(summary.topTasks[1]).toBe("High task");
    expect(summary.topTasks[2]).toBe("Medium task");
  });

  it("should handle empty task list", () => {
    const summary = buildScheduleSummary([], false);

    expect(summary.taskCount).toBe(0);
    expect(summary.doneCount).toBe(0);
    expect(summary.totalMinutes).toBe(0);
    expect(summary.topTasks).toHaveLength(0);
  });
});
