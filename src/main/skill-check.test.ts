import { describe, it, expect } from "vitest";
import { checkRequiredSkills } from "./skill-runner";

describe("Startup Skill Check", () => {
  it("should return installed and missing properties", () => {
    const result = checkRequiredSkills();
    expect(result).toHaveProperty("installed");
    expect(result).toHaveProperty("missing");
    expect(Array.isArray(result.missing)).toBe(true);
  });

  it("should check start-work, hack, ship, code-review", () => {
    const result = checkRequiredSkills();
    if (!result.installed) {
      for (const skill of result.missing) {
        expect(["start-work", "hack", "ship", "code-review"]).toContain(skill);
      }
    }
  });
});
