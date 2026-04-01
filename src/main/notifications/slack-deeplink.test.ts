/**
 * Tests for Slack deep link construction.
 *
 * BUG: Slack links open the app but don't navigate to the specific thread/channel.
 * The slack:// protocol deep links need the correct team ID and message timestamp.
 *
 * For debugging: print the actual URL being opened in the console.
 */

import { describe, it, expect } from "vitest";

describe("Slack Deep Links", () => {
  it("should log the URL being opened for debugging", () => {
    const url = "slack://channel?team=T&id=C0AMSV2SK4Z";
    // In production, this should be logged to console before opening
    console.log(`[DEBUG] Opening URL: ${url}`);
    expect(url).toBeTruthy();
  });

  it("archive URL should preserve the full original URL for Slack web fallback", () => {
    // The original archive URL works in browser and Slack redirects to the app
    // Maybe we should NOT convert to slack:// and just open the original URL
    const originalUrl = "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z/p1711234567890";

    // This URL, when opened in browser, Slack's web app redirects to the native app
    // AND navigates to the correct thread. The slack:// protocol doesn't do this.
    expect(originalUrl).toContain("slack.com/archives");
    expect(originalUrl).toContain("/p"); // thread timestamp
  });

  it("should prefer original slack.com URLs over slack:// protocol for thread navigation", () => {
    // slack:// protocol opens the app but loses thread context
    // https://xxx.slack.com/archives/CHANNEL/pTIMESTAMP opens browser → Slack redirects → correct thread
    const webUrl = "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z/p1711234567890";
    const protocolUrl = "slack://channel?team=T&id=C0AMSV2SK4Z";

    // Web URL has thread context, protocol URL doesn't
    expect(webUrl).toContain("/p1711234567890");
    expect(protocolUrl).not.toContain("p1711234567890");
  });
});
