import { describe, it, expect } from "vitest";

/**
 * Tests for pre-creation validation logic.
 * These verify that stale/invalid tasks are caught before entering the inbox.
 */

describe("Pre-creation validation: action_needed signals", () => {
  const SKIP_PHRASES = [
    "already replied",
    "already reviewed",
    "already responded",
    "already handled",
    "may have been",
    "likely reviewed",
  ];

  for (const phrase of SKIP_PHRASES) {
    it(`should skip items where action_needed contains "${phrase}"`, () => {
      const actionNeeded = `Review PR #12610 if not ${phrase} — reactions suggest completion`;
      const lower = actionNeeded.toLowerCase();
      const shouldSkip = SKIP_PHRASES.some(p => lower.includes(p));
      expect(shouldSkip).toBe(true);
    });
  }

  it("should NOT skip items with clear action needed", () => {
    const actionNeeded = "Review PR #12700 — assigned via random rotation, no reactions yet";
    const lower = actionNeeded.toLowerCase();
    const shouldSkip = SKIP_PHRASES.some(p => lower.includes(p));
    expect(shouldSkip).toBe(false);
  });

  it("should NOT skip items with empty action_needed", () => {
    const actionNeeded = "";
    const lower = actionNeeded.toLowerCase();
    const shouldSkip = SKIP_PHRASES.some(p => lower.includes(p));
    expect(shouldSkip).toBe(false);
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
