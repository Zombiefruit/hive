/**
 * Tests for smart poll lookback — only fetch data since last poll, not always 7 days.
 */

import { describe, it, expect } from "vitest";
import { computeLookbackHours, migrateCacheFormat, buildCachePayload } from "../../shared/poll-cache";

describe("Smart Lookback — computeLookbackHours", () => {
  it("should return 168 hours for first poll (no lastPollTimestamp)", () => {
    expect(computeLookbackHours(null)).toBe(168);
  });

  it("should return hoursSinceLastPoll + 1hr buffer", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
    const hours = computeLookbackHours(twoHoursAgo);
    // 2hr + 1hr buffer = 3, but ceil + ms drift can make it 4
    expect(hours).toBeGreaterThanOrEqual(3);
    expect(hours).toBeLessThanOrEqual(4);
  });

  it("should clamp minimum to 1 hour", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    const hours = computeLookbackHours(fiveMinAgo);
    // 5min = ~0.08hr + 1hr buffer = ~1.08, ceil = 2 — but clamped minimum is 1
    expect(hours).toBeGreaterThanOrEqual(1);
    expect(hours).toBeLessThanOrEqual(2);
  });

  it("should clamp maximum to 168 hours", () => {
    const tenDaysAgo = new Date(Date.now() - 240 * 3600000).toISOString();
    const hours = computeLookbackHours(tenDaysAgo);
    expect(hours).toBe(168);
  });

  it("should handle 30 minutes ago → 1 or 2 hours", () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000).toISOString();
    const hours = computeLookbackHours(thirtyMinAgo);
    // 0.5hr + 1hr = 1.5, ceil = 2
    expect(hours).toBeGreaterThanOrEqual(1);
    expect(hours).toBeLessThanOrEqual(2);
  });

  it("should handle exactly 1 hour ago → 2 hours", () => {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const hours = computeLookbackHours(oneHourAgo);
    expect(hours).toBe(2);
  });
});

describe("Smart Lookback — migrateCacheFormat", () => {
  it("should handle bare array (legacy format)", () => {
    const raw = JSON.stringify([{ id: "task-1", title: "Test" }]);
    const result = migrateCacheFormat(raw);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].id).toBe("task-1");
    expect(result.lastPollTimestamp).toBeNull();
  });

  it("should handle new format with meta", () => {
    const raw = JSON.stringify({
      notifications: [{ id: "task-1", title: "Test" }],
      meta: { lastPollTimestamp: "2026-03-25T10:00:00Z" },
    });
    const result = migrateCacheFormat(raw);
    expect(result.notifications).toHaveLength(1);
    expect(result.lastPollTimestamp).toBe("2026-03-25T10:00:00Z");
  });

  it("should handle new format with null timestamp", () => {
    const raw = JSON.stringify({
      notifications: [],
      meta: { lastPollTimestamp: null },
    });
    const result = migrateCacheFormat(raw);
    expect(result.notifications).toHaveLength(0);
    expect(result.lastPollTimestamp).toBeNull();
  });

  it("should handle empty/invalid JSON gracefully", () => {
    const result = migrateCacheFormat("not json");
    expect(result.notifications).toHaveLength(0);
    expect(result.lastPollTimestamp).toBeNull();
  });

  it("should handle empty string", () => {
    const result = migrateCacheFormat("");
    expect(result.notifications).toHaveLength(0);
    expect(result.lastPollTimestamp).toBeNull();
  });
});

describe("Smart Lookback — buildCachePayload", () => {
  it("should produce new format JSON", () => {
    const notifications = [{ id: "task-1", title: "Test" }];
    const timestamp = "2026-03-25T10:00:00Z";
    const payload = buildCachePayload(notifications, timestamp);
    const parsed = JSON.parse(payload);
    expect(parsed.notifications).toHaveLength(1);
    expect(parsed.meta.lastPollTimestamp).toBe(timestamp);
  });

  it("should round-trip correctly", () => {
    const notifications = [
      { id: "a", title: "Task A" },
      { id: "b", title: "Task B" },
    ];
    const timestamp = "2026-03-25T12:30:00Z";
    const payload = buildCachePayload(notifications, timestamp);
    const result = migrateCacheFormat(payload);
    expect(result.notifications).toHaveLength(2);
    expect(result.lastPollTimestamp).toBe(timestamp);
  });
});
