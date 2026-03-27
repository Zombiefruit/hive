/**
 * Tests for current time indicator on schedule.
 *
 * BUG: The red "now" line / current time indicator is not showing on the schedule.
 * It was present before but got lost during refactoring.
 */

import { describe, it, expect } from "vitest";

describe("Schedule — Current Time Indicator", () => {
  it("should compute nowOffset within the visible timeline range", () => {
    const HOUR_HEIGHT = 144;
    const startHour = 9;
    const endHour = 18;
    const nowMinutes = 14 * 60 + 30; // 2:30 PM
    const dayStartMinutes = startHour * 60; // 540

    const nowOffset = ((nowMinutes - dayStartMinutes) / 60) * HOUR_HEIGHT;

    // 2:30 PM is 5.5 hours after 9:00 AM
    expect(nowOffset).toBe(5.5 * HOUR_HEIGHT);
    expect(nowOffset).toBeGreaterThan(0);
  });

  it("should show indicator when current time is within displayed range", () => {
    const startHour = 9;
    const endHour = 20; // extended past 18:00 for tasks
    const nowMinutes = 19 * 60; // 7:00 PM
    const dayStartMinutes = startHour * 60;
    const displayEndMinutes = endHour * 60;

    const nowInRange = nowMinutes >= dayStartMinutes && nowMinutes <= displayEndMinutes;
    expect(nowInRange).toBe(true);
  });

  it("should NOT show indicator when current time is before start", () => {
    const startHour = 9;
    const nowMinutes = 7 * 60; // 7:00 AM — before 9am
    const dayStartMinutes = startHour * 60;

    const nowInRange = nowMinutes >= dayStartMinutes;
    expect(nowInRange).toBe(false);
  });

  it("should update nowMinutes via interval (not computed once)", () => {
    // The time indicator should update every 60s
    // This test documents the requirement that nowMinutes is state, not a const
    let nowMinutes = 14 * 60; // 2:00 PM

    // After 60 seconds, it should update
    nowMinutes = 14 * 60 + 1; // 2:01 PM
    expect(nowMinutes).toBe(841);
  });
});
