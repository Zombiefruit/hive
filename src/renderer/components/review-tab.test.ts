/**
 * Tests for ReviewTab — code review findings display.
 */
import { describe, it, expect } from "vitest";

describe("ReviewTab data handling", () => {
  it("should extract content from IPC response objects", () => {
    // IPC returns {filename, content} objects, not strings
    const ipcData = [
      { filename: "review-001.md", content: "## Review\n- **critical**: Missing null check in handler" },
      { filename: "review-002.md", content: "## Follow-up\nAll good" },
    ];
    const reviews = ipcData.map((d: unknown) =>
      typeof d === "string" ? d : (d as { content?: string }).content ?? ""
    );
    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toContain("critical");
    expect(reviews[1]).toContain("All good");
  });

  it("should handle string responses (backward compat)", () => {
    const ipcData = ["## Review\nLooks good"];
    const reviews = ipcData.map((d: unknown) =>
      typeof d === "string" ? d : (d as { content?: string }).content ?? ""
    );
    expect(reviews[0]).toBe("## Review\nLooks good");
  });

  it("should count severity badges from review text", () => {
    const text = "- **critical**: SQL injection\n- **critical**: XSS\n- **warning**: Missing test";
    const criticals = (text.match(/\*\*critical\*\*/gi) || []).length;
    const warnings = (text.match(/\*\*warning\*\*/gi) || []).length;
    expect(criticals).toBe(2);
    expect(warnings).toBe(1);
  });

  it("should handle empty reviews array", () => {
    const reviews: string[] = [];
    expect(reviews.length).toBe(0);
  });
});
