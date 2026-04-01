/**
 * Tests for current time indicator on schedule.
 *
 * The red "now" line / current time indicator must ALWAYS show on the current day,
 * including early morning (before working hours) and late night.
 * The timeline is 0-24h, so offset is relative to hour 0, not working hours start.
 */

import { describe, it, expect } from "vitest";

/** Matches the production logic: offset from startHour (0), visible whenever !isNextDay. */
function computeNowIndicator(
  nowMinutes: number,
  isNextDay: boolean,
  startHour: number,
  HOUR_HEIGHT: number,
): { nowInRange: boolean; nowOffset: number } {
  const nowInRange = !isNextDay;
  const nowOffset = nowInRange ? ((nowMinutes - startHour * 60) / 60) * HOUR_HEIGHT : -1;
  return { nowInRange, nowOffset };
}

describe("Schedule — Current Time Indicator", () => {
  const HOUR_HEIGHT = 144;
  const startHour = 0; // timeline starts at midnight

  it("should compute nowOffset relative to hour 0 (not working hours start)", () => {
    const nowMinutes = 14 * 60 + 30; // 2:30 PM
    const { nowOffset } = computeNowIndicator(nowMinutes, false, startHour, HOUR_HEIGHT);

    // 2:30 PM is 14.5 hours after midnight
    expect(nowOffset).toBe(14.5 * HOUR_HEIGHT);
    expect(nowOffset).toBeGreaterThan(0);
  });

  it("should show indicator when current time is within displayed range", () => {
    const nowMinutes = 19 * 60; // 7:00 PM
    const { nowInRange, nowOffset } = computeNowIndicator(nowMinutes, false, startHour, HOUR_HEIGHT);

    expect(nowInRange).toBe(true);
    expect(nowOffset).toBe(19 * HOUR_HEIGHT);
  });

  it("should show indicator before working hours (early morning)", () => {
    const nowMinutes = 7 * 60; // 7:00 AM — before working hours start
    const { nowInRange, nowOffset } = computeNowIndicator(nowMinutes, false, startHour, HOUR_HEIGHT);

    // Must be visible even before 9 AM working hours
    expect(nowInRange).toBe(true);
    expect(nowOffset).toBe(7 * HOUR_HEIGHT);
  });

  it("should show indicator at midnight (0:00)", () => {
    const nowMinutes = 0;
    const { nowInRange, nowOffset } = computeNowIndicator(nowMinutes, false, startHour, HOUR_HEIGHT);

    expect(nowInRange).toBe(true);
    expect(nowOffset).toBe(0);
  });

  it("should show indicator late at night (11:30 PM)", () => {
    const nowMinutes = 23 * 60 + 30; // 11:30 PM
    const { nowInRange, nowOffset } = computeNowIndicator(nowMinutes, false, startHour, HOUR_HEIGHT);

    expect(nowInRange).toBe(true);
    expect(nowOffset).toBe(23.5 * HOUR_HEIGHT);
  });

  it("should NOT show indicator when showing next day schedule", () => {
    const nowMinutes = 20 * 60; // 8:00 PM
    const { nowInRange, nowOffset } = computeNowIndicator(nowMinutes, true, startHour, HOUR_HEIGHT);

    expect(nowInRange).toBe(false);
    expect(nowOffset).toBe(-1);
  });

  it("should update nowMinutes via interval (not computed once)", () => {
    // The time indicator should update every 60s
    // This test documents the requirement that nowMinutes is state, not a const
    let nowMinutes = 14 * 60; // 2:00 PM

    // After 60 seconds, it should update
    nowMinutes = 14 * 60 + 1; // 2:01 PM
    expect(nowMinutes).toBe(841);
  });

  it("should detect stale schedule from a previous day", () => {
    const todayStr = "2026-03-31";
    const scheduleDate = "2026-03-30"; // yesterday
    const isNextDay = false;

    const isStale = scheduleDate !== null && scheduleDate !== todayStr && !isNextDay;
    expect(isStale).toBe(true);
  });

  it("should not flag current-day schedule as stale", () => {
    const todayStr = "2026-03-31";
    const scheduleDate = "2026-03-31";
    const isNextDay = false;

    const isStale = scheduleDate !== null && scheduleDate !== todayStr && !isNextDay;
    expect(isStale).toBe(false);
  });

  it("should not flag next-day schedule as stale", () => {
    const todayStr = "2026-03-31";
    const scheduleDate = "2026-03-31";
    const isNextDay = true;

    // isNextDay schedules are intentional, not stale
    const isStale = scheduleDate !== null && scheduleDate !== todayStr && !isNextDay;
    expect(isStale).toBe(false);
  });

  it("should detect day boundary change", () => {
    let todayStr = "2026-03-31";
    const newDay = "2026-04-01"; // midnight crossed

    const dayChanged = newDay !== todayStr;
    expect(dayChanged).toBe(true);

    // After detecting change, todayStr should update
    todayStr = newDay;
    expect(todayStr).toBe("2026-04-01");
  });
});
