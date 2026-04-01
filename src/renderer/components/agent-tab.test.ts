import { describe, it, expect } from "vitest";
import { shouldAutoExpand, getInputPlaceholder } from "./AgentTab";

describe("shouldAutoExpand", () => {
  it("should expand activity log when loading", () => {
    expect(shouldAutoExpand(true, 5)).toBe(true);
  });

  it("should not expand when not loading and has events", () => {
    expect(shouldAutoExpand(false, 5)).toBe(false);
  });

  it("should not expand when no events", () => {
    expect(shouldAutoExpand(false, 0)).toBe(false);
  });
});

describe("getInputPlaceholder", () => {
  it("should show disabled message when no agent and no conversation", () => {
    expect(getInputPlaceholder(false, false)).toBe("Start work to begin a conversation...");
  });

  it("should show active prompt when skill running", () => {
    expect(getInputPlaceholder(true, true)).toBe("Reply to agent...");
  });

  it("should show feedback prompt when conversation exists", () => {
    expect(getInputPlaceholder(false, true)).toBe("Push back, ask questions, or refine the plan...");
  });
});
