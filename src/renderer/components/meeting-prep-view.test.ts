/**
 * Tests for MeetingPrepDetailView data parsing — talking points + attendees from fetchedContext.
 */
import { describe, it, expect } from "vitest";
import { parseMeetingPrepContext, type MeetingPrepData } from "../../shared/meeting-prep-parser";

describe("Meeting Prep View — parseMeetingPrepContext", () => {
  it("should parse talking points from text events", () => {
    const events = [
      { type: "text", content: "Talking points:\n1. VEC-24 progress — history done, UI porting\n2. Mor's perf agent feedback — 3 accounts interested\n3. Fig Intelligence UI status", timestamp: "" },
    ];
    const data = parseMeetingPrepContext(events);
    expect(data.talkingPoints.length).toBeGreaterThanOrEqual(2);
    expect(data.talkingPoints[0].point).toContain("VEC-24");
  });

  it("should parse attendees from text events", () => {
    const events = [
      { type: "text", content: "Attendees: Yael Chemla (manager), Kieran Williams\n\nTalking points:\n1. Status update", timestamp: "" },
    ];
    const data = parseMeetingPrepContext(events);
    expect(data.attendees.length).toBeGreaterThanOrEqual(1);
    expect(data.attendees[0].name).toContain("Yael");
  });

  it("should extract related doc links from tool_use events", () => {
    const events = [
      { type: "tool_use", content: "Linear: get_issue {\"id\":\"VEC-24\"}", timestamp: "" },
      { type: "tool_use", content: "Slack: slack_read_thread {\"channel_id\":\"C0AMSV2SK4Z\"}", timestamp: "" },
      { type: "text", content: "Talking points:\n1. Discuss progress", timestamp: "" },
    ];
    const data = parseMeetingPrepContext(events);
    expect(data.relatedDocs.length).toBeGreaterThanOrEqual(1);
  });

  it("should handle empty events gracefully", () => {
    const data = parseMeetingPrepContext([]);
    expect(data.talkingPoints).toHaveLength(0);
    expect(data.attendees).toHaveLength(0);
    expect(data.relatedDocs).toHaveLength(0);
  });
});
