import { describe, it, expect } from "vitest";
import { getDefaultTab } from "./DetailDrawer";

describe("getDefaultTab", () => {
  it("should return 'agent' when conversation exists", () => {
    expect(getDefaultTab({ hasConversation: true, hasPlan: false, isLoading: false })).toBe("agent");
  });

  it("should return 'agent' when loading", () => {
    expect(getDefaultTab({ hasConversation: false, hasPlan: false, isLoading: true })).toBe("agent");
  });

  it("should return 'plan' when plan exists but no conversation", () => {
    expect(getDefaultTab({ hasConversation: false, hasPlan: true, isLoading: false })).toBe("plan");
  });

  it("should default to 'agent'", () => {
    expect(getDefaultTab({ hasConversation: false, hasPlan: false, isLoading: false })).toBe("agent");
  });
});
