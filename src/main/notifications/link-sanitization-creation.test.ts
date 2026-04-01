/**
 * Tests: fake Slack URLs should be REMOVED at creation time, not just sanitized.
 *
 * BUG: sanitizeUrl returns undefined for fake URLs, but the fallback `?? l.url`
 * was keeping the original bad URL. Fixed: filter out links where sanitizeUrl
 * returns undefined, instead of falling back.
 */

import { describe, it, expect } from "vitest";
import { sanitizeUrl } from "../../shared/task-utils";

describe("Link Filtering at Creation Time", () => {
  it("should remove links with fake Slack URLs", () => {
    const links = [
      { type: "slack", label: "#ui-ux-prs", url: "https://app.slack.com/client/T/C_ui_ux_prs" },
      { type: "linear", label: "VEC-20", url: "https://linear.app/issue/VEC-20" },
    ];

    const filtered = links.filter(l => sanitizeUrl(l.url) !== undefined);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe("linear");
  });

  it("should keep links with valid Slack archive URLs", () => {
    const links = [
      { type: "slack", label: "#team-vector", url: "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z" },
      { type: "linear", label: "VEC-20", url: "https://linear.app/issue/VEC-20" },
    ];

    const filtered = links.filter(l => sanitizeUrl(l.url) !== undefined);
    expect(filtered).toHaveLength(2);
  });

  it("should remove slack://channel/name URLs (channel name, not ID)", () => {
    const result = sanitizeUrl("slack://channel/product-releases");
    expect(result).toBeUndefined(); // No valid Slack ID found
  });

  it("should remove https://slack:dm URLs", () => {
    const result = sanitizeUrl("https://slack:dm");
    expect(result).toBeUndefined();
  });

  it("should keep and fix DM URLs with valid IDs", () => {
    const result = sanitizeUrl("https://slack://dm/D043DJB30DB");
    expect(result).toContain("slack.com/archives/D043DJB30DB");
  });
});
