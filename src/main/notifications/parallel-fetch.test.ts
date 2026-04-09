import { describe, it, expect, vi } from "vitest";
import {
  buildSourcePrompt,
  fetchSourcesParallel,
  type SourceFetchConfig,
  type SourceFetchResult,
} from "./parallel-fetch";

// ── buildSourcePrompt ──

describe("buildSourcePrompt", () => {
  const baseConfig: SourceFetchConfig = {
    userName: "Kieran",
    userSlackId: "U123",
    linearUser: "kwilliams",
    teamName: "Vector",
    slackBaseUrl: "https://montecarlodata.slack.com",
    channels: [{ id: "C0AMSV2SK4Z", name: "team-vector" }],
    managerSlackId: "U456",
    managerName: "Yael",
    hours: 24,
    cutoffStr: "2026-03-31T00:00:00Z",
  };

  it("builds a Slack fetch prompt with channels and searches", () => {
    const prompt = buildSourcePrompt("slack", baseConfig);
    expect(prompt).toContain("## SLACK");
    expect(prompt).toContain("team-vector");
    expect(prompt).toContain("U123");
    expect(prompt).toContain("after:");
  });

  it("builds a Linear fetch prompt with user and team", () => {
    const prompt = buildSourcePrompt("linear", baseConfig);
    expect(prompt).toContain("## LINEAR");
    expect(prompt).toContain("kwilliams");
  });

  it("builds a Calendar fetch prompt with current time", () => {
    const prompt = buildSourcePrompt("calendar", baseConfig);
    expect(prompt).toContain("## CALENDAR");
  });

  it("builds a Gmail fetch prompt with lookback window", () => {
    const prompt = buildSourcePrompt("gmail", baseConfig);
    expect(prompt).toContain("## GMAIL");
  });

  it("builds a Notion fetch prompt with user name", () => {
    const prompt = buildSourcePrompt("notion", baseConfig);
    expect(prompt).toContain("## NOTION");
    expect(prompt).toContain("Kieran");
  });

  it("scales limits for long lookback windows", () => {
    const longConfig = { ...baseConfig, hours: 72 };
    const prompt = buildSourcePrompt("linear", longConfig);
    // Should use higher limit for > 48h
    expect(prompt).toContain("250");
  });
});

// ── fetchSourcesParallel ──

describe("fetchSourcesParallel", () => {
  it("runs all sources in parallel and merges results", async () => {
    const askFn = vi.fn()
      .mockResolvedValueOnce("## SLACK\nSlack data here")
      .mockResolvedValueOnce("## LINEAR\nLinear data here");

    const onProgress = vi.fn();

    const result = await fetchSourcesParallel(
      ["slack", "linear"],
      askFn,
      onProgress,
    );

    // Both sources should have been called
    expect(askFn).toHaveBeenCalledTimes(2);
    // Results merged
    expect(result.mergedData).toContain("Slack data here");
    expect(result.mergedData).toContain("Linear data here");
    // No errors
    expect(result.errors).toHaveLength(0);
    // Both succeeded
    expect(result.succeeded).toEqual(["slack", "linear"]);
  });

  it("handles individual source failures gracefully", async () => {
    const askFn = vi.fn()
      .mockResolvedValueOnce("## SLACK\nSlack data here")
      .mockRejectedValueOnce(new Error("Linear API timeout"));

    const onProgress = vi.fn();

    const result = await fetchSourcesParallel(
      ["slack", "linear"],
      askFn,
      onProgress,
    );

    // Slack succeeded, Linear failed
    expect(result.succeeded).toEqual(["slack"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].source).toBe("linear");
    expect(result.errors[0].error).toContain("timeout");
    // Merged data still has Slack
    expect(result.mergedData).toContain("Slack data here");
    // Merged data does NOT have Linear
    expect(result.mergedData).not.toContain("Linear data");
  });

  it("reports per-source progress as each completes (sequential)", async () => {
    // Sources are fetched sequentially through the serial bridge
    const askFn = vi.fn()
      .mockResolvedValueOnce("## SLACK\nDone")
      .mockResolvedValueOnce("## LINEAR\nDone");

    const onProgress = vi.fn();

    const result = await fetchSourcesParallel(
      ["slack", "linear"],
      askFn,
      onProgress,
    );

    // Both sources complete in order
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, expect.objectContaining({ source: "slack", status: "done" }));
    expect(onProgress).toHaveBeenNthCalledWith(2, expect.objectContaining({ source: "linear", status: "done" }));
    expect(result.succeeded).toHaveLength(2);
  });

  it("returns empty merged data when all sources fail", async () => {
    const askFn = vi.fn().mockRejectedValue(new Error("fail"));
    const onProgress = vi.fn();

    const result = await fetchSourcesParallel(
      ["slack", "linear"],
      askFn,
      onProgress,
    );

    expect(result.succeeded).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
    expect(result.mergedData).toBe("");
  });

  it("handles empty source list", async () => {
    const askFn = vi.fn();
    const onProgress = vi.fn();

    const result = await fetchSourcesParallel([], askFn, onProgress);

    expect(askFn).not.toHaveBeenCalled();
    expect(result.mergedData).toBe("");
    expect(result.succeeded).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
