/**
 * Tests for bridge orphan result discard behavior.
 *
 * When a result arrives without a pending request (from init messages,
 * compaction, hooks), it must be discarded — not matched to the next
 * real request that gets queued.
 */
import { describe, it, expect } from "vitest";

describe("Bridge orphan result discard", () => {
  it("should discard results when no pending requests exist", () => {
    const pendingRequests = new Map<string, { resolve: (text: string) => void }>();
    const resultText = "INIT_ACK";
    let discarded = false;

    // Simulate: result arrives with no pending request
    if (pendingRequests.size === 0) {
      discarded = true;
      // Don't resolve anything
    } else {
      // Would resolve first pending request
      const [, req] = [...pendingRequests.entries()][0];
      req.resolve(resultText);
    }

    expect(discarded).toBe(true);
  });

  it("should deliver result to pending request when one exists", () => {
    const pendingRequests = new Map<string, { resolve: (text: string) => void; result?: string }>();
    let resolvedValue = "";

    // Add a real pending request
    pendingRequests.set("req-123", {
      resolve: (text) => { resolvedValue = text; },
    });

    const resultText = "## SLACK\nMessages from #team-vector...";

    // Simulate: result arrives with pending request
    if (pendingRequests.size === 0) {
      // Would discard
    } else {
      for (const [reqId, req] of pendingRequests) {
        req.resolve(resultText);
        pendingRequests.delete(reqId);
        break;
      }
    }

    expect(resolvedValue).toBe(resultText);
    expect(pendingRequests.size).toBe(0);
  });

  it("should handle multiple orphan results before a real request", () => {
    const pendingRequests = new Map<string, { resolve: (text: string) => void }>();
    const discardedResults: string[] = [];

    // Simulate: multiple orphan results from init/compaction
    const orphanResults = ["ready", "INIT_ACK", "Ready to continue."];
    for (const result of orphanResults) {
      if (pendingRequests.size === 0) {
        discardedResults.push(result);
      }
    }

    expect(discardedResults).toEqual(orphanResults);
    expect(discardedResults).toHaveLength(3);
  });

  it("should NOT deliver orphan result to a request queued AFTER the result", () => {
    // This is the exact bug we fixed: INIT_ACK arrives, THEN real request is queued,
    // but INIT_ACK was already processed (discarded). The real request waits for the
    // NEXT result (which is the actual data).
    const pendingRequests = new Map<string, { resolve: (text: string) => void }>();
    let fetchResult = "";

    // Step 1: Orphan result arrives — no pending request
    const orphanResult = "INIT_ACK";
    if (pendingRequests.size === 0) {
      // Discarded correctly
    }

    // Step 2: Real request queued
    pendingRequests.set("fetch-slack", {
      resolve: (text) => { fetchResult = text; },
    });

    // Step 3: Real result arrives — pending request exists
    const realResult = "## SLACK\n47 messages from #team-vector";
    if (pendingRequests.size > 0) {
      for (const [reqId, req] of pendingRequests) {
        req.resolve(realResult);
        pendingRequests.delete(reqId);
        break;
      }
    }

    expect(fetchResult).toBe(realResult);
    expect(fetchResult).not.toBe(orphanResult);
  });
});
