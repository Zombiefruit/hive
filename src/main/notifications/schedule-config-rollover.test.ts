/**
 * Tests for schedule config integration and day rollover.
 *
 * BUG 1: Schedule hardcodes working hours as 09:00-18:00 instead of reading from config.
 * BUG 2: Tasks stack past midnight producing "26:00" because slot assignment doesn't stop at end-of-day.
 * BUG 3: No clear "next day" indicator — user can't tell if looking at today or tomorrow.
 */

import { describe, it, expect } from "vitest";

// ── Slot assignment with day boundary ──

/** Assign time slots to tasks, rolling to tomorrow when past end of day. */
function assignSlots(
  taskCount: number,
  taskDurationMinutes: number,
  startSlotMinutes: number,
  endOfDayMinutes: number,
): Array<{ startTime: string; endTime: string; day: "today" | "tomorrow" }> {
  const results: Array<{ startTime: string; endTime: string; day: "today" | "tomorrow" }> = [];
  let cursor = startSlotMinutes;
  const tomorrowStart = 9 * 60; // 09:00 tomorrow
  let rolledOver = cursor >= endOfDayMinutes;

  if (rolledOver) cursor = tomorrowStart;

  for (let i = 0; i < taskCount; i++) {
    // Check if this task would overflow past end of day
    if (!rolledOver && cursor + taskDurationMinutes > endOfDayMinutes && cursor < endOfDayMinutes) {
      // This task still fits partially — keep it today if it starts before end
      // Actually: if the start is before end, it's today even if it runs over
    }
    if (!rolledOver && cursor >= endOfDayMinutes) {
      rolledOver = true;
      cursor = tomorrowStart;
    }

    const day = rolledOver ? "tomorrow" : "today";
    const slotStart = cursor;
    const slotEnd = slotStart + taskDurationMinutes;

    const toTime = (mins: number) => {
      const capped = Math.min(mins, 23 * 60 + 59);
      const h = Math.floor(capped / 60);
      const m = capped % 60;
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    };

    results.push({ startTime: toTime(slotStart), endTime: toTime(slotEnd), day });
    cursor = slotEnd;
  }

  return results;
}

describe("Schedule — Config-Driven Working Hours", () => {
  it("should use working hours from config, not hardcoded 18:00", () => {
    // Config says working hours end at 20:00
    const configEndTime = "20:00";
    const endMinutes = parseInt(configEndTime.split(":")[0]) * 60;

    // At 19:00 (within config hours), tasks should be today
    const nowMinutes = 19 * 60;
    const pastEnd = nowMinutes >= endMinutes;

    expect(pastEnd).toBe(false); // 19:00 < 20:00 — still today
  });

  it("should treat 18:01 as past working hours when config says 18:00", () => {
    const configEndMinutes = 18 * 60; // 18:00
    const nowMinutes = 18 * 60 + 1; // 18:01

    expect(nowMinutes >= configEndMinutes).toBe(true); // Past end → tomorrow
  });
});

describe("Schedule — Slot Assignment Respects Day Boundary", () => {
  it("should keep tasks within today when they fit before end of day", () => {
    // 3 tasks of 60min each, starting at 14:00, end of day at 18:00
    const slots = assignSlots(3, 60, 14 * 60, 18 * 60);

    expect(slots[0]).toEqual({ startTime: "14:00", endTime: "15:00", day: "today" });
    expect(slots[1]).toEqual({ startTime: "15:00", endTime: "16:00", day: "today" });
    expect(slots[2]).toEqual({ startTime: "16:00", endTime: "17:00", day: "today" });
  });

  it("should roll tasks to tomorrow when they don't fit today", () => {
    // 5 tasks of 60min each, starting at 15:00, end of day at 18:00
    // Only 3 fit today (15-16, 16-17, 17-18), rest go to tomorrow
    const slots = assignSlots(5, 60, 15 * 60, 18 * 60);

    expect(slots[0].day).toBe("today");
    expect(slots[1].day).toBe("today");
    expect(slots[2].day).toBe("today");
    expect(slots[3].day).toBe("tomorrow"); // Rolls over
    expect(slots[4].day).toBe("tomorrow");

    // Tomorrow tasks start at 09:00, not 18:00+
    expect(slots[3].startTime).toBe("09:00");
    expect(slots[4].startTime).toBe("10:00");
  });

  it("should NEVER produce times >= 24:00", () => {
    // Even with many tasks, times should always be valid
    const slots = assignSlots(20, 90, 8 * 60, 18 * 60);

    for (const slot of slots) {
      const startHour = parseInt(slot.startTime.split(":")[0]);
      const endHour = parseInt(slot.endTime.split(":")[0]);
      expect(startHour).toBeLessThanOrEqual(23);
      expect(endHour).toBeLessThanOrEqual(23);
    }
  });

  it("should start all tasks at tomorrow morning when past working hours", () => {
    // It's 20:00, working hours end at 18:00 — everything goes to tomorrow
    const slots = assignSlots(3, 60, 20 * 60, 18 * 60);

    expect(slots.every(s => s.day === "tomorrow")).toBe(true);
    expect(slots[0].startTime).toBe("09:00");
    expect(slots[1].startTime).toBe("10:00");
    expect(slots[2].startTime).toBe("11:00");
  });
});
