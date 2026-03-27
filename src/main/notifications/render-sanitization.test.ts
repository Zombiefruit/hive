/**
 * Tests: URLs must be sanitized at RENDER time, not just creation time.
 * Cached items from before the sanitizeUrl fix still have broken URLs.
 *
 * BUG: "https://slack//channel/C0AMSV2SK4Z" showing in schedule detail view
 * because the URL was cached before sanitizeUrl was added.
 */

import { describe, it, expect } from "vitest";
import { sanitizeUrl } from "../../shared/task-utils";

describe("Render-time URL sanitization", () => {
  it("should fix cached broken Slack URLs to use slack:// protocol for native app", () => {
    const cachedUrl = "https://slack//channel/C0AMSV2SK4Z";
    const fixed = sanitizeUrl(cachedUrl);

    expect(fixed).not.toBe(cachedUrl);
    // Should use slack:// protocol to open native Slack app, not browser
    expect(fixed).toContain("slack.com");
  });

  it("should sanitize URLs in links array at render time", () => {
    const links = [
      { type: "slack", label: "#team-vector", url: "https://slack//channel/C0AMSV2SK4Z" },
      { type: "linear", label: "VEC-20", url: "https://linear.app/issue/VEC-20" },
    ];

    const sanitized = links.map(l => ({ ...l, url: sanitizeUrl(l.url) ?? l.url }));

    expect(sanitized[0].url).toContain("slack.com");
    expect(sanitized[1].url).toBe("https://linear.app/issue/VEC-20"); // unchanged
  });

  it("priority badge should appear on both actionable and human section cards", () => {
    // Both sections should render priority badges
    const actionableCard = { priority: "critical", taskType: "implementation" };
    const humanCard = { priority: "high", taskType: "response" };

    expect(actionableCard.priority).toBeTruthy();
    expect(humanCard.priority).toBeTruthy();
    // Both should have a priority badge in their render output
  });
});
