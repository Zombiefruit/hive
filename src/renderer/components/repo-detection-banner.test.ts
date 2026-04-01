import { describe, it, expect } from "vitest";
import { deriveBranch } from "./RepoDetectionBanner";

describe("deriveBranch", () => {
  it("should derive branch from ticket ID in title", () => {
    expect(deriveBranch("VEC-44: Add Mixpanel tracking", "kwilliams")).toBe("kwilliams/vec-44-add-mixpanel-tracking");
  });

  it("should truncate long branch names to 50 chars", () => {
    const long = "VEC-100: Implement a very long feature name that goes on and on and on";
    const branch = deriveBranch(long, "kwilliams");
    expect(branch.length).toBeLessThanOrEqual(50);
    expect(branch).toContain("kwilliams/vec-100");
  });

  it("should handle titles without ticket IDs", () => {
    expect(deriveBranch("Fix the login bug", "kwilliams")).toBe("kwilliams/fix-the-login-bug");
  });
});
