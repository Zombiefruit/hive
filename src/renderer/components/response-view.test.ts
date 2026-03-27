/**
 * Tests for ResponseDetailView data parsing — key points + suggested replies from fetchedContext.
 */
import { describe, it, expect } from "vitest";
import { parseResponseContext, type ResponseData } from "../../shared/response-parser";

describe("Response View — parseResponseContext", () => {
  it("should parse key points from fetchedContext text events", () => {
    const events = [
      { type: "text", content: "Key points:\n- Yael wants chat polished\n- Ties into VEC-24\n- 3 interested accounts", timestamp: "" },
    ];
    const data = parseResponseContext(events);
    expect(data.keyPoints).toHaveLength(3);
    expect(data.keyPoints[0]).toContain("Yael");
  });

  it("should parse suggested replies from fetchedContext", () => {
    const events = [
      { type: "text", content: "Suggested replies:\n1. \"On it! Already working on VEC-24.\"\n2. \"Good timing — top priority.\"", timestamp: "" },
    ];
    const data = parseResponseContext(events);
    expect(data.suggestedReplies.length).toBeGreaterThanOrEqual(1);
  });

  it("should extract thread info from tool_use events", () => {
    const events = [
      { type: "tool_use", content: "Slack: slack_read_thread {\"channel_id\":\"D043DJB30DB\",\"thread_ts\":\"1774402910.478749\"}", timestamp: "" },
      { type: "text", content: "Key points:\n- Reply needed", timestamp: "" },
    ];
    const data = parseResponseContext(events);
    expect(data.threadChannel).toBe("D043DJB30DB");
    expect(data.threadTs).toBe("1774402910.478749");
  });

  it("should handle empty events gracefully", () => {
    const data = parseResponseContext([]);
    expect(data.keyPoints).toHaveLength(0);
    expect(data.suggestedReplies).toHaveLength(0);
    expect(data.threadChannel).toBeNull();
  });
});
