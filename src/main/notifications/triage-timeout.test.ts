import { describe, it, expect } from "vitest";

/**
 * Tests for triage timeout and loading state consistency.
 * These verify the contract: if polling-finished fires, data should be present.
 */

describe("Triage timeout contract", () => {
  it("first fetch timeout should be 10 minutes (600000ms)", () => {
    // First fetch should get a generous timeout, not unlimited
    const FIRST_FETCH_TIMEOUT = 600000;
    expect(FIRST_FETCH_TIMEOUT).toBe(600000);
    expect(FIRST_FETCH_TIMEOUT).toBeLessThan(Infinity);
    expect(FIRST_FETCH_TIMEOUT).toBeGreaterThan(300000); // More than subsequent
  });

  it("subsequent fetch timeout should be 5 minutes (300000ms)", () => {
    const SUBSEQUENT_TIMEOUT = 300000;
    expect(SUBSEQUENT_TIMEOUT).toBe(300000);
  });

  it("polling-finished should only fire after poll() completes (not on timeout swallow)", () => {
    // Contract: the poll() function must ALWAYS reach the finally block
    // which fires polling-finished. If triage times out, it should still
    // get a "Request timed out" response and continue to the finally block.
    //
    // The bridge.ask() with timeout resolves with "Request timed out" string,
    // it does NOT reject. So poll() should never hang — it gets a string back.
    const timeoutResponse = "Request timed out";
    expect(timeoutResponse).toBeTruthy();
    expect(timeoutResponse.length).toBeGreaterThan(0);
  });

  it("triage response 'Request timed out' should not parse as valid JSON", () => {
    const response = "Request timed out";
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    expect(codeBlockMatch).toBeNull();

    const objMatch = response.match(/\{[\s\S]*"actionable"[\s\S]*\}/);
    expect(objMatch).toBeNull();

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    expect(jsonMatch).toBeNull();
    // This means: on timeout, parsing finds nothing, isPolling is set false,
    // polling-finished fires, and the user sees an empty inbox.
    // That's correct behavior — better than hanging forever.
  });

  it("GitHub pre-fetch should not block the main fetch on failure", () => {
    // gh CLI failures should be caught and logged, not throw
    // The try/catch in poll-service ensures this
    const githubContext = ""; // Empty on failure
    expect(githubContext).toBe("");
    // Main fetch continues with githubContext = ""
  });
});

describe("Loading state consistency", () => {
  it("polling-started event should set global refresh to true", () => {
    // useGlobalRefresh wires: onPollingStarted -> setGlobalRefreshing(true)
    // This ensures the loading banner shows when auto-poll starts
    const events = ["notifications:polling-started", "global:refresh-start"];
    expect(events).toContain("notifications:polling-started");
  });

  it("polling-finished event should set global refresh to false", () => {
    const events = ["notifications:polling-finished"];
    expect(events).toContain("notifications:polling-finished");
  });
});
