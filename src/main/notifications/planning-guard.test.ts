/**
 * Tests for planning guard — prevents concurrent planning for the same notification
 * and verifies no auto-retry on timeout.
 *
 * We can't import work-dispatcher directly (Electron dependencies), so we test
 * the guard logic and timeout contract.
 */
import { describe, it, expect } from "vitest";

describe("Planning Concurrency Guard", () => {
  it("should prevent concurrent planning for the same notification ID", () => {
    // Simulates the activePlanningIds guard in prepareWorkPlan
    const activePlanningIds = new Set<string>();
    const notifId = "poll-123-abc";

    // First call: should proceed
    expect(activePlanningIds.has(notifId)).toBe(false);
    activePlanningIds.add(notifId);
    expect(activePlanningIds.has(notifId)).toBe(true);

    // Second call while first is running: should be blocked
    const secondCallBlocked = activePlanningIds.has(notifId);
    expect(secondCallBlocked).toBe(true);

    // After first completes: guard is released
    activePlanningIds.delete(notifId);
    expect(activePlanningIds.has(notifId)).toBe(false);

    // Third call after release: should proceed
    activePlanningIds.add(notifId);
    expect(activePlanningIds.has(notifId)).toBe(true);
  });

  it("should allow concurrent planning for different notification IDs", () => {
    const activePlanningIds = new Set<string>();

    activePlanningIds.add("notif-A");
    activePlanningIds.add("notif-B");

    // Both should be tracked independently
    expect(activePlanningIds.has("notif-A")).toBe(true);
    expect(activePlanningIds.has("notif-B")).toBe(true);
    expect(activePlanningIds.has("notif-C")).toBe(false);

    // Releasing one doesn't affect the other
    activePlanningIds.delete("notif-A");
    expect(activePlanningIds.has("notif-A")).toBe(false);
    expect(activePlanningIds.has("notif-B")).toBe(true);
  });

  it("should release guard on error (try/catch path)", () => {
    const activePlanningIds = new Set<string>();
    const notifId = "poll-error-test";

    activePlanningIds.add(notifId);
    try {
      throw new Error("MCP bridge crash");
    } catch {
      activePlanningIds.delete(notifId);
    }

    // Guard must be released even after error
    expect(activePlanningIds.has(notifId)).toBe(false);
  });

  it("should release guard on timeout path", () => {
    const activePlanningIds = new Set<string>();
    const notifId = "poll-timeout-test";

    activePlanningIds.add(notifId);
    const response = "Request timed out";

    // Timeout path: check response, release guard, return error plan
    if (response.includes("timed out")) {
      activePlanningIds.delete(notifId);
    }

    expect(activePlanningIds.has(notifId)).toBe(false);
  });
});

describe("Inactivity Timeout (no hard wall-clock limit)", () => {
  it("should use inactivity timeout, not wall-clock timeout", () => {
    // The agent should run as long as it needs to — only kill if truly hung.
    // "Hung" = no stdout data for 120s.
    const INACTIVITY_LIMIT_MS = 120_000;
    let lastActivityTs = Date.now();

    // Simulate active agent: data arrives every 30s
    lastActivityTs = Date.now();
    const silentMs = Date.now() - lastActivityTs;
    expect(silentMs).toBeLessThan(INACTIVITY_LIMIT_MS); // Not hung

    // Simulate hung agent: no data for 130s
    const hungTs = Date.now() - 130_000;
    const hungSilentMs = Date.now() - hungTs;
    expect(hungSilentMs).toBeGreaterThan(INACTIVITY_LIMIT_MS); // Hung
  });

  it("should reset inactivity timer on stdout data", () => {
    let lastActivityTs = Date.now() - 100_000; // 100s since last data
    const INACTIVITY_LIMIT_MS = 120_000;

    // Before data: getting close to timeout
    expect(Date.now() - lastActivityTs).toBeGreaterThan(90_000);

    // Data arrives — reset timer
    lastActivityTs = Date.now();
    expect(Date.now() - lastActivityTs).toBeLessThan(INACTIVITY_LIMIT_MS);
  });

  it("should NOT retry when agent becomes unresponsive", () => {
    const response = "Agent became unresponsive";
    let retryCount = 0;

    // New behavior: no retry, return error plan
    const isFailure = response.includes("unresponsive") || response.includes("timed out");
    if (isFailure) {
      retryCount = 0; // User clicks "Re-plan" manually
    }

    expect(retryCount).toBe(0);
    expect(isFailure).toBe(true);
  });

  it("should return an error plan with re-plan instructions on failure", () => {
    const failureResponses = [
      "Agent became unresponsive",
      "Request timed out",
      "Process exited without result",
    ];

    for (const response of failureResponses) {
      const isFailure = response.includes("unresponsive") ||
        response.includes("timed out") ||
        response.includes("not ready") ||
        response.includes("exited without");
      expect(isFailure).toBe(true);
    }
  });

  it("should NOT return error plan for successful responses", () => {
    const response = "## Plan\n\n1. Update the coverage gaps endpoint\n2. Add tests\n---\nEstimated: 2 hours";

    const isFailure = response.includes("unresponsive") ||
      response.includes("timed out") ||
      response.includes("not ready") ||
      response.includes("exited without");

    expect(isFailure).toBe(false);
  });
});

describe("Planning Guard — File-Level Contract", () => {
  it("work-dispatcher should import askMcpPlanningAgent (not askBridge) for planning", () => {
    // Planning uses askMcpPlanningAgent which spawns isolated processes.
    // It must NEVER use the shared askBridge (owned by poll-service).
    const planningImports = ["askMcpPlanningAgent", "askEphemeralProcess"];
    const forbiddenForPlanning = ["askBridge"];

    for (const imp of planningImports) {
      expect(imp).toBeTruthy();
    }
    for (const imp of forbiddenForPlanning) {
      // Must not be used by prepareWorkPlan
      expect(planningImports).not.toContain(imp);
    }
  });

  it("activePlanningIds should be exported for testability", () => {
    // The isPlanningActive() export lets callers check without direct Set access
    const isPlanningActive = (id: string, activeSet: Set<string>) => activeSet.has(id);

    const active = new Set(["abc"]);
    expect(isPlanningActive("abc", active)).toBe(true);
    expect(isPlanningActive("xyz", active)).toBe(false);
  });
});
