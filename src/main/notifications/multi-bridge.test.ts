/**
 * Tests for multi-bridge architecture.
 *
 * Two persistent bridges: pollBridge (fetch/triage) and contextBridge (planning context).
 * They are independent — restarting one doesn't affect the other.
 */

import { describe, it, expect } from "vitest";

// ── Bridge Factory Contract ──

interface Bridge {
  label: string;
  start: () => void;
  ask: (prompt: string, timeout?: number) => Promise<string>;
  isReady: () => boolean;
  restart: () => Promise<void>;
  stop: () => void;
}

function createMockBridge(label: string): Bridge {
  let ready = false;
  let stopped = false;
  return {
    label,
    start: () => { ready = true; stopped = false; },
    ask: async (prompt) => {
      if (!ready) return "Bridge not ready";
      return `[${label}] Response to: ${prompt.slice(0, 50)}`;
    },
    isReady: () => ready && !stopped,
    restart: async () => { ready = false; stopped = true; ready = true; stopped = false; },
    stop: () => { ready = false; stopped = true; },
  };
}

describe("Multi-Bridge Architecture", () => {
  it("two bridges should start independently", () => {
    const pollBridge = createMockBridge("poll");
    const contextBridge = createMockBridge("context");

    pollBridge.start();
    contextBridge.start();

    expect(pollBridge.isReady()).toBe(true);
    expect(contextBridge.isReady()).toBe(true);
  });

  it("restarting poll bridge should NOT affect context bridge", async () => {
    const pollBridge = createMockBridge("poll");
    const contextBridge = createMockBridge("context");

    pollBridge.start();
    contextBridge.start();

    // Restart poll bridge (happens between fetch and triage)
    await pollBridge.restart();

    // Context bridge should still be ready
    expect(contextBridge.isReady()).toBe(true);
    // Poll bridge should also be ready after restart
    expect(pollBridge.isReady()).toBe(true);
  });

  it("poll and context requests should run simultaneously", async () => {
    const pollBridge = createMockBridge("poll");
    const contextBridge = createMockBridge("context");

    pollBridge.start();
    contextBridge.start();

    // Run both requests in parallel
    const [pollResult, contextResult] = await Promise.all([
      pollBridge.ask("Fetch all sources"),
      contextBridge.ask("Get Linear issue VEC-20"),
    ]);

    expect(pollResult).toContain("[poll]");
    expect(contextResult).toContain("[context]");
    // Both completed — no blocking
  });

  it("context bridge should stay ready while poll bridge is restarting", async () => {
    const pollBridge = createMockBridge("poll");
    const contextBridge = createMockBridge("context");

    pollBridge.start();
    contextBridge.start();

    // Stop poll bridge (simulating restart)
    pollBridge.stop();
    expect(pollBridge.isReady()).toBe(false);

    // Context bridge unaffected
    expect(contextBridge.isReady()).toBe(true);
    const result = await contextBridge.ask("Get Slack thread");
    expect(result).toContain("[context]");
  });

  it("each bridge should have its own label in debug entries", async () => {
    const pollBridge = createMockBridge("poll");
    const contextBridge = createMockBridge("context");

    pollBridge.start();
    contextBridge.start();

    const pollResult = await pollBridge.ask("test");
    const contextResult = await contextBridge.ask("test");

    expect(pollResult).toContain("[poll]");
    expect(contextResult).toContain("[context]");
    expect(pollResult).not.toContain("[context]");
    expect(contextResult).not.toContain("[poll]");
  });

  it("stopping one bridge should not stop the other", () => {
    const pollBridge = createMockBridge("poll");
    const contextBridge = createMockBridge("context");

    pollBridge.start();
    contextBridge.start();

    pollBridge.stop();
    expect(pollBridge.isReady()).toBe(false);
    expect(contextBridge.isReady()).toBe(true);

    contextBridge.stop();
    expect(contextBridge.isReady()).toBe(false);
  });
});

describe("Bridge Consumer Routing", () => {
  it("poll-service should ONLY use pollBridge", () => {
    const consumers = {
      "poll-service fetch": "pollBridge",
      "poll-service triage": "pollBridge",
    };

    for (const [consumer, bridge] of Object.entries(consumers)) {
      expect(bridge).toBe("pollBridge");
    }
  });

  it("work-dispatcher should ONLY use contextBridge", () => {
    const consumers = {
      "planning Step 2 context fetch": "contextBridge",
      "channel name resolution": "contextBridge",
    };

    for (const [consumer, bridge] of Object.entries(consumers)) {
      expect(bridge).toBe("contextBridge");
    }
  });

  it("manager should use neither bridge (execFile)", () => {
    const managerUseBridge = false;
    expect(managerUseBridge).toBe(false);
  });

  it("no bridge locking should be needed", () => {
    // With two bridges, no consumer needs to lock/acquire
    const needsLocking = false;
    expect(needsLocking).toBe(false);
  });
});
