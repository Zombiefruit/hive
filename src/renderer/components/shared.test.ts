/** Tests for shared UI components — EmptyState, SectionHeader, SourceIcon, formatTimeSince. */

import { describe, it, expect } from "vitest";
import { formatTimeSince, getSourceIconName } from "./shared";

describe("formatTimeSince", () => {
  it("should return 'just now' for times less than 1 minute ago", () => {
    const now = new Date().toISOString();
    expect(formatTimeSince(now)).toBe("just now");
  });

  it("should return minutes for times < 60 minutes ago", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(formatTimeSince(tenMinAgo)).toBe("10m ago");
  });

  it("should return hours for times < 24 hours ago", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(formatTimeSince(threeHoursAgo)).toBe("3h ago");
  });

  it("should return days for times >= 24 hours ago", () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString();
    expect(formatTimeSince(twoDaysAgo)).toBe("2d ago");
  });
});

describe("getSourceIconName", () => {
  it("should return known source names", () => {
    expect(getSourceIconName("linear")).toBe("linear");
    expect(getSourceIconName("slack")).toBe("slack");
    expect(getSourceIconName("github")).toBe("github");
    expect(getSourceIconName("notion")).toBe("notion");
    expect(getSourceIconName("email")).toBe("email");
    expect(getSourceIconName("manual")).toBe("manual");
  });

  it("should return 'unknown' for unrecognized sources", () => {
    expect(getSourceIconName("jira")).toBe("unknown");
    expect(getSourceIconName("")).toBe("unknown");
  });
});
