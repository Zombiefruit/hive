/**
 * Tests for process monitor — tracks spawned Claude Code processes and their RSS.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { trackProcess, untrackProcess, getProcessStats, _resetForTest, _setRssForTest } from "./process-monitor";

describe("Process Monitor", () => {
  beforeEach(() => {
    _resetForTest();
  });

  it("should track a process and include it in stats", () => {
    trackProcess(12345, "planning", "test-plan");
    const stats = getProcessStats();
    expect(stats.count).toBe(1);
    expect(stats.processes).toHaveLength(1);
    expect(stats.processes[0].pid).toBe(12345);
    expect(stats.processes[0].type).toBe("planning");
    expect(stats.processes[0].label).toBe("test-plan");
  });

  it("should untrack a process", () => {
    trackProcess(12345, "planning", "test-plan");
    untrackProcess(12345);
    const stats = getProcessStats();
    expect(stats.count).toBe(0);
    expect(stats.processes).toHaveLength(0);
  });

  it("should track multiple processes", () => {
    trackProcess(100, "poll-bridge", "poll");
    trackProcess(200, "planning", "VEC-24 plan");
    trackProcess(300, "work", "VEC-24 work");
    const stats = getProcessStats();
    expect(stats.count).toBe(3);
  });

  it("should compute totalRssKb from tracked processes", () => {
    trackProcess(100, "poll-bridge", "poll");
    trackProcess(200, "planning", "plan");
    // Simulate RSS values being set (normally done by sampling)
    _setRssForTest(100, 500000); // 500MB
    _setRssForTest(200, 200000); // 200MB
    const stats = getProcessStats();
    expect(stats.totalRssKb).toBe(700000);
  });

  it("should include selfRssKb for the main process", () => {
    const stats = getProcessStats();
    expect(stats.selfRssKb).toBeGreaterThan(0);
  });

  it("should track uptime correctly", () => {
    const before = Date.now();
    trackProcess(100, "planning", "test");
    const stats = getProcessStats();
    expect(stats.processes[0].uptimeMs).toBeGreaterThanOrEqual(0);
    expect(stats.processes[0].uptimeMs).toBeLessThan(1000);
  });

  it("should handle untracking a non-existent PID gracefully", () => {
    untrackProcess(99999);
    const stats = getProcessStats();
    expect(stats.count).toBe(0);
  });

  it("should handle duplicate track calls (update, not duplicate)", () => {
    trackProcess(100, "planning", "first");
    trackProcess(100, "planning", "second"); // same PID, updated label
    const stats = getProcessStats();
    expect(stats.count).toBe(1);
    expect(stats.processes[0].label).toBe("second");
  });
});
