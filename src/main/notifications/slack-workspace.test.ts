/**
 * Tests for configurable Slack workspace URL.
 *
 * The Slack workspace changed from montecarlodata.slack.com to montecarloai.slack.com.
 * All URL construction must use the configured workspace, not a hardcoded value.
 */

import { describe, it, expect } from "vitest";
import { getSlackBaseUrl, buildSlackArchiveUrl, sanitizeUrl } from "../../shared/task-utils";

describe("Configurable Slack Workspace", () => {
  it("getSlackBaseUrl should return configured workspace URL", () => {
    const url = getSlackBaseUrl("montecarloai");
    expect(url).toBe("https://montecarloai.slack.com");
  });

  it("getSlackBaseUrl should default when no workspace provided", () => {
    const url = getSlackBaseUrl();
    // Default should still work (uses fallback)
    expect(url).toMatch(/\.slack\.com$/);
  });

  it("buildSlackArchiveUrl should construct channel URL", () => {
    const url = buildSlackArchiveUrl("C0AMSV2SK4Z", undefined, "montecarloai");
    expect(url).toBe("https://montecarloai.slack.com/archives/C0AMSV2SK4Z");
  });

  it("buildSlackArchiveUrl should construct thread URL", () => {
    const url = buildSlackArchiveUrl("C0AMSV2SK4Z", "1711234567.890", "montecarloai");
    expect(url).toBe("https://montecarloai.slack.com/archives/C0AMSV2SK4Z/p1711234567890");
  });

  it("buildSlackArchiveUrl should handle thread_ts without dot", () => {
    const url = buildSlackArchiveUrl("C0AMSV2SK4Z", "1711234567890", "montecarloai");
    expect(url).toBe("https://montecarloai.slack.com/archives/C0AMSV2SK4Z/p1711234567890");
  });

  it("should accept enterprise workspace format", () => {
    const url = buildSlackArchiveUrl("D043DJB30DB", undefined, "montecarlo.enterprise");
    expect(url).toBe("https://montecarlo.enterprise.slack.com/archives/D043DJB30DB");
  });

  it("sanitizeUrl should preserve valid archive URLs from any workspace", () => {
    // Old workspace
    expect(sanitizeUrl("https://montecarlodata.slack.com/archives/C0AMSV2SK4Z")).toBe("https://montecarlodata.slack.com/archives/C0AMSV2SK4Z");
    // New workspace
    expect(sanitizeUrl("https://montecarloai.slack.com/archives/C0AMSV2SK4Z")).toBe("https://montecarloai.slack.com/archives/C0AMSV2SK4Z");
    // Enterprise
    expect(sanitizeUrl("https://montecarlo.enterprise.slack.com/archives/D043DJB30DB/p1774402910478749")).toBe("https://montecarlo.enterprise.slack.com/archives/D043DJB30DB/p1774402910478749");
  });
});
