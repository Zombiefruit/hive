import { describe, it, expect } from "vitest";
import { isValidAction, isKnownActionType, getActionRisk, KNOWN_ACTION_TYPES } from "./action-types";

describe("KNOWN_ACTION_TYPES", () => {
  it("should include all 10 action types", () => {
    expect(KNOWN_ACTION_TYPES).toContain("run_skill");
    expect(KNOWN_ACTION_TYPES).toContain("update_linear");
    expect(KNOWN_ACTION_TYPES).toContain("open_url");
    expect(KNOWN_ACTION_TYPES).toContain("send_slack");
    expect(KNOWN_ACTION_TYPES).toContain("send_email");
    expect(KNOWN_ACTION_TYPES).toContain("join_meeting");
    expect(KNOWN_ACTION_TYPES).toContain("review_pr");
    expect(KNOWN_ACTION_TYPES).toContain("dismiss");
    expect(KNOWN_ACTION_TYPES).toContain("snooze");
    expect(KNOWN_ACTION_TYPES).toContain("no_action");
    expect(KNOWN_ACTION_TYPES).toHaveLength(10);
  });
});

describe("isKnownActionType", () => {
  it("should return true for known types", () => {
    expect(isKnownActionType("run_skill")).toBe(true);
    expect(isKnownActionType("send_slack")).toBe(true);
    expect(isKnownActionType("no_action")).toBe(true);
  });

  it("should return false for unknown types", () => {
    expect(isKnownActionType("unknown")).toBe(false);
    expect(isKnownActionType("")).toBe(false);
    expect(isKnownActionType("RUN_SKILL")).toBe(false);
  });
});

describe("isValidAction", () => {
  it("should validate a complete run_skill action", () => {
    expect(isValidAction({ type: "run_skill", skill: "/hack", label: "Start hacking", risk: "medium" })).toBe(true);
  });

  it("should validate a no_action (no risk required)", () => {
    expect(isValidAction({ type: "no_action", label: "Nothing to do" })).toBe(true);
  });

  it("should reject missing type", () => {
    expect(isValidAction({ label: "Test" })).toBe(false);
  });

  it("should reject missing label", () => {
    expect(isValidAction({ type: "run_skill", risk: "medium" })).toBe(false);
  });

  it("should reject empty label", () => {
    expect(isValidAction({ type: "run_skill", label: "", risk: "medium" })).toBe(false);
  });

  it("should reject unknown type", () => {
    expect(isValidAction({ type: "fly_to_moon", label: "Go", risk: "low" })).toBe(false);
  });

  it("should reject missing risk for non-no_action types", () => {
    expect(isValidAction({ type: "run_skill", label: "Start" })).toBe(false);
  });
});

describe("getActionRisk", () => {
  it("should return the risk level from the action", () => {
    expect(getActionRisk({ type: "run_skill", skill: "/hack", label: "Hack", risk: "medium" })).toBe("medium");
    expect(getActionRisk({ type: "open_url", url: "https://example.com", label: "Open", risk: "low" })).toBe("low");
    expect(getActionRisk({ type: "send_slack", channel: "C123", message: "Hi", label: "Send", risk: "high" })).toBe("high");
  });

  it("should return undefined for no_action", () => {
    expect(getActionRisk({ type: "no_action", label: "Done" })).toBeUndefined();
  });
});
