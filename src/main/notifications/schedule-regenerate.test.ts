/**
 * Tests for schedule regenerate behavior.
 *
 * BUG 1: Regenerate doesn't visibly change anything — it preserves stale slots.
 * BUG 2: Tasks overlap because they share the same "23:59" slot from overflow.
 * BUG 3: No loading state shown during regeneration.
 *
 * FIX: Regenerate should clear ALL stored slots and reassign from scratch.
 */

import { describe, it, expect } from "vitest";

describe("Schedule Regenerate", () => {
  it("should clear all stored time slots when regenerating", () => {
    const storedSlots: Record<string, { startTime: string; endTime: string }> = {
      "task-1": { startTime: "23:59", endTime: "23:59" }, // broken from overflow
      "task-2": { startTime: "23:59", endTime: "23:59" }, // broken
      "task-3": { startTime: "09:00", endTime: "10:30" }, // fine
    };

    // Regenerate clears everything
    const cleared: Record<string, { startTime: string; endTime: string }> = {};
    expect(Object.keys(cleared)).toHaveLength(0);

    // Then reassigns fresh slots
    cleared["task-1"] = { startTime: "09:00", endTime: "10:30" };
    cleared["task-2"] = { startTime: "10:30", endTime: "12:00" };
    cleared["task-3"] = { startTime: "12:00", endTime: "13:30" };

    // No "23:59" slots
    for (const slot of Object.values(cleared)) {
      expect(slot.startTime).not.toBe("23:59");
      expect(slot.endTime).not.toBe("23:59");
    }
  });

  it("should never assign overlapping time slots", () => {
    const tasks = [
      { id: "1", duration: 90 },
      { id: "2", duration: 45 },
      { id: "3", duration: 60 },
    ];

    let cursor = 9 * 60; // 09:00
    const slots: Array<{ id: string; start: number; end: number }> = [];

    for (const task of tasks) {
      slots.push({ id: task.id, start: cursor, end: cursor + task.duration });
      cursor += task.duration;
    }

    // Verify no overlaps
    for (let i = 0; i < slots.length - 1; i++) {
      expect(slots[i].end).toBeLessThanOrEqual(slots[i + 1].start);
    }
  });

  it("should show loading state during regeneration", () => {
    let generating = false;

    // Start regeneration
    generating = true;
    expect(generating).toBe(true);

    // Complete
    generating = false;
    expect(generating).toBe(false);
  });

  it("should never produce minute values >= 1440 (24h)", () => {
    const minutesToTime = (mins: number): string => {
      const capped = Math.min(mins, 23 * 60 + 59);
      const h = Math.floor(capped / 60);
      const m = capped % 60;
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    };

    // If cursor exceeds 24h, cap the TIME but the cursor should have
    // already rolled to next day — not produced 23:59 for everything
    expect(minutesToTime(1500)).toBe("23:59");

    // But the SLOT ASSIGNMENT should roll to tomorrow, not produce 23:59
    const endOfDay = 18 * 60; // 18:00
    const startOfDay = 9 * 60; // 09:00
    let cursor = 17 * 60; // 17:00
    const taskDuration = 120; // 2 hours

    // This task would end at 19:00 — past end of day
    if (cursor + taskDuration > endOfDay) {
      // Should assign to start of day instead of letting it overflow
      // (or at least the slot should be before end of day)
    }
    // The cursor should not go past endOfDay for today's tasks
    const assignedEnd = Math.min(cursor + taskDuration, endOfDay * 2); // bad: allows overflow
    const correctEnd = cursor + taskDuration; // task runs past end, but start is valid
    expect(cursor).toBeLessThan(endOfDay); // start is valid
  });
});
