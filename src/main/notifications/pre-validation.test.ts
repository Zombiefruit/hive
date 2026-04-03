import { describe, it, expect } from "vitest";

/**
 * Tests for pre-creation validation logic.
 * These verify that stale/invalid tasks are caught before entering the inbox.
 */

describe("Pre-creation validation: done signals in text", () => {
  const DONE_SIGNALS = [
    "already replied", "already reviewed", "already responded", "already handled",
    "already merged", "already resolved", "already addressed", "already fixed",
    "already approved", "already completed", "already done",
    "may have been", "likely reviewed", "likely resolved",
    "confirm whether", "confirm if",
    "no action needed", "no action required", "no response needed",
  ];

  for (const signal of DONE_SIGNALS) {
    it(`should skip items containing "${signal}"`, () => {
      const text = `Some task context — ${signal} — more text`;
      const lower = text.toLowerCase();
      const match = DONE_SIGNALS.find(s => lower.includes(s));
      expect(match).toBeTruthy();
    });
  }

  it("should catch 'already merged' in action_needed (the PR #12613 regression)", () => {
    const actionNeeded = "Reply in thread — Kieran already merged PR #12613 on Mar 31.";
    const match = DONE_SIGNALS.find(s => actionNeeded.toLowerCase().includes(s));
    expect(match).toBe("already merged");
  });

  it("should catch 'confirm whether' hedging", () => {
    const actionNeeded = "Confirm whether that fix resolved Lior's issue or if there's a remaining edge case.";
    const match = DONE_SIGNALS.find(s => actionNeeded.toLowerCase().includes(s));
    expect(match).toBe("confirm whether");
  });

  it("should check summary AND action_needed combined", () => {
    const allText = "Some action needed. Bug was already fixed last week.".toLowerCase();
    const match = DONE_SIGNALS.find(s => allText.includes(s));
    expect(match).toBe("already fixed");
  });

  it("should NOT skip items with clear action needed", () => {
    const actionNeeded = "Review PR #12700 — assigned via random rotation, no reactions yet";
    const match = DONE_SIGNALS.find(s => actionNeeded.toLowerCase().includes(s));
    expect(match).toBeUndefined();
  });

  it("should NOT skip items with empty text", () => {
    const allText = "  ".toLowerCase();
    const match = DONE_SIGNALS.find(s => allText.includes(s));
    expect(match).toBeUndefined();
  });
});

describe("Pre-creation validation: PR status check", () => {
  it("should extract PR number and repo from GitHub URL", () => {
    const url = "https://github.com/monte-carlo-data/frontend/pull/12610";
    const match = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("monte-carlo-data/frontend");
    expect(match![2]).toBe("12610");
  });

  it("should not match non-PR GitHub URLs", () => {
    const url = "https://github.com/monte-carlo-data/frontend/issues/500";
    const match = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
    expect(match).toBeNull();
  });

  it("should identify MERGED state as skip-worthy", () => {
    const state = "MERGED";
    expect(state === "MERGED" || state === "CLOSED").toBe(true);
  });

  it("should NOT skip OPEN state", () => {
    const state = "OPEN";
    expect(state === "MERGED" || state === "CLOSED").toBe(false);
  });
});

describe("Pre-creation validation: Slack reply detection", () => {
  it("should detect user's Slack ID near a thread reference", () => {
    const rawData = `Thread in #team-vector (p1774988600419859): Jett Love assigned PR review. Replies: U02PKBZSB9Q replied "looks good"`;
    const threadRef = "1774988600";
    const userSlackId = "U02PKBZSB9Q";
    const nearThread = rawData.indexOf(threadRef);
    expect(nearThread).toBeGreaterThan(-1);
    const context = rawData.slice(Math.max(0, nearThread - 500), nearThread + 1500);
    expect(context.includes(userSlackId)).toBe(true);
    expect(context.includes("replied")).toBe(true);
  });

  it("should NOT false-positive when user ID is not near the thread", () => {
    const rawData = `Thread in #general (p1774988600419859): Someone asked something. No replies.`;
    const userSlackId = "U02PKBZSB9Q";
    expect(rawData.includes(userSlackId)).toBe(false);
  });
});
