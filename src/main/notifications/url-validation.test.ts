/**
 * Tests for URL validation and sanitization.
 *
 * BUG: Slack links show as "https://slack//channel/C0AMSV2SK4Z" instead of
 * "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z". The triage AI
 * sometimes generates malformed URLs. We need to validate and fix them
 * before storing in notifications.
 */

import { describe, it, expect } from "vitest";
import { sanitizeUrl } from "../../shared/task-utils";

describe("URL Validation — Malformed Slack URLs", () => {
  it("should fix broken Slack URL to valid web URL", () => {
    const broken = "https://slack//channel/C0AMSV2SK4Z";
    const fixed = sanitizeUrl(broken);

    expect(fixed).not.toBe(broken);
    expect(fixed).toContain("slack.com");
    expect(fixed).toContain("C0AMSV2SK4Z");
    expect(fixed).not.toContain("//channel/");
  });

  it("should pass through valid Slack archive URLs unchanged", () => {
    const valid = "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z";
    const result = sanitizeUrl(valid);

    expect(result).toBe(valid);
  });

  it("should pass through valid Slack thread URLs unchanged", () => {
    const valid = "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z/p1711234567890";
    const result = sanitizeUrl(valid);

    expect(result).toBe(valid);
  });

  it("should pass through valid Linear URLs unchanged", () => {
    const valid = "https://linear.app/monte-carlo/issue/VEC-20";
    const result = sanitizeUrl(valid);

    expect(result).toBe(valid);
  });

  it("should pass through valid GitHub URLs unchanged", () => {
    const valid = "https://github.com/monte-carlo-data/frontend/pull/12441";
    const result = sanitizeUrl(valid);

    expect(result).toBe(valid);
  });

  it("should reject empty/null URLs", () => {
    expect(sanitizeUrl("")).toBeUndefined();
    expect(sanitizeUrl(undefined as unknown as string)).toBeUndefined();
  });

  it("should add https:// to URLs missing protocol", () => {
    const noProtocol = "linear.app/monte-carlo/issue/VEC-20";
    const result = sanitizeUrl(noProtocol);

    expect(result).toBe("https://linear.app/monte-carlo/issue/VEC-20");
  });

  it("should add https:// to bare domains", () => {
    // sanitizeUrl is lenient — adds protocol but doesn't validate domain structure
    expect(sanitizeUrl("localhost")).toBe("https://localhost");
    expect(sanitizeUrl("not-a-url")).toBe("https://not-a-url");
  });
});
