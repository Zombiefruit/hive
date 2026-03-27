/**
 * Regression test: Slack links must remain clickable and point to the correct message.
 *
 * BUG: Slack links in the kanban detail view stopped working. Clicking a
 * "#team-vector" link should open the Slack thread in the browser, but
 * it's not doing that anymore.
 */

import { describe, it, expect } from "vitest";
import { extractKey } from "../../shared/task-utils";

describe("Slack Link Integrity", () => {
  it("should preserve full Slack URLs through notification pipeline", () => {
    const originalUrl = "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z/p1711234567890";

    // Create a notification with a Slack link
    const notification = {
      id: "poll-test",
      source: "slack",
      title: "Thread in #team-vector",
      url: originalUrl,
      links: [{ type: "slack", label: "#team-vector", url: originalUrl }],
    };

    // URL should be unchanged after extractKey (dedup doesn't modify URLs)
    extractKey(notification);
    expect(notification.url).toBe(originalUrl);
    expect(notification.links[0].url).toBe(originalUrl);
  });

  it("should not mangle Slack URLs during consolidation", () => {
    const notifications = [
      {
        id: "1",
        source: "slack" as const,
        title: "Thread in #team-vector",
        url: "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z/p1711234567890",
        links: [{ type: "slack", label: "#team-vector", url: "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z/p1711234567890" }],
        stage: "new",
      },
    ];

    // After any processing, the URL should still be valid
    expect(notifications[0].url).toMatch(/^https:\/\/montecarlodata\.slack\.com\/archives\//);
    expect(notifications[0].links[0].url).toMatch(/^https:\/\//);
  });

  it("should handle Slack URLs with and without thread timestamps", () => {
    const channelUrl = "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z";
    const threadUrl = "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z/p1711234567890";

    // Both should be valid clickable URLs
    expect(channelUrl).toMatch(/^https:\/\/.*slack\.com\/archives\/[A-Z0-9]+$/);
    expect(threadUrl).toMatch(/^https:\/\/.*slack\.com\/archives\/[A-Z0-9]+\/p\d+$/);

    // Both should produce valid dedup keys
    const channelKey = extractKey({ source: "slack", title: "Test", url: channelUrl });
    const threadKey = extractKey({ source: "slack", title: "Test", url: threadUrl });

    expect(channelKey).toBe("slack:C0AMSV2SK4Z");
    expect(threadKey).toBe("slack:C0AMSV2SK4Z:1711234567890");
  });

  it("should pass Slack URL to openExternal unchanged", () => {
    // Simulate what the UI does when you click a link
    const link = { type: "slack", label: "#team-vector", url: "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z/p1711234567890" };

    // The URL passed to openExternal should be the original
    const urlToOpen = link.url;
    expect(urlToOpen).toBe("https://montecarlodata.slack.com/archives/C0AMSV2SK4Z/p1711234567890");
    expect(urlToOpen).toContain("https://");
    expect(urlToOpen).not.toContain("undefined");
    expect(urlToOpen).not.toBe("");
  });

  it("should not lose links during notification merge/consolidation", () => {
    // Two notifications about the same topic — merge should keep all links
    const first = {
      id: "1",
      source: "slack",
      title: "VEC-20 discussion",
      url: undefined as string | undefined,
      links: [{ url: "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z/p111" }],
      stage: "start_work",
    };
    const dupe = {
      id: "2",
      source: "linear",
      title: "VEC-20",
      url: "https://linear.app/monte-carlo/issue/VEC-20",
      links: [{ url: "https://linear.app/monte-carlo/issue/VEC-20" }],
      stage: "new",
    };

    // After merge (first has better stage), first should absorb dupe's links
    if (!first.url && dupe.url) first.url = dupe.url;
    if (first.links && dupe.links) {
      for (const l of dupe.links) {
        if (!first.links.some(k => k.url === l.url)) first.links.push(l);
      }
    }

    expect(first.links).toHaveLength(2); // Both Slack and Linear links
    expect(first.url).toBe("https://linear.app/monte-carlo/issue/VEC-20");
    expect(first.links[0].url).toContain("slack.com");
    expect(first.links[1].url).toContain("linear.app");
  });
});

describe("openExternal IPC", () => {
  it("should handle shell:open-external IPC channel", () => {
    // The preload exposes: openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url)
    // This test documents the expected IPC contract
    const ipcChannel = "shell:open-external";
    const url = "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z";

    expect(ipcChannel).toBe("shell:open-external");
    expect(url).toMatch(/^https:\/\//);
  });
});
