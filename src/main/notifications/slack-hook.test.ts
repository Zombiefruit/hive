/** Tests for Slack hook — real-time mention/DM monitoring (#43). */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  parseSlackEvent,
  shouldCreateNotification,
  buildNotificationFromSlack,
  deduplicateSlackEvent,
  type SlackEvent,
} from "./slack-hook";

const baseEvent: SlackEvent = {
  type: "message",
  channel: "C0AMSV2SK4Z",
  user: "UEXAMPLE01",
  text: "Hey <@U02PKBZSB9Q> can you look at this?",
  ts: "1711234567.890",
  thread_ts: undefined,
};

describe("parseSlackEvent", () => {
  it("should detect direct mentions", () => {
    const parsed = parseSlackEvent(baseEvent, "U02PKBZSB9Q");
    expect(parsed.isMention).toBe(true);
    expect(parsed.isDM).toBe(false);
  });

  it("should detect DMs by channel prefix", () => {
    const dm: SlackEvent = { ...baseEvent, channel: "D0AMSCHANNEL" };
    const parsed = parseSlackEvent(dm, "U02PKBZSB9Q");
    expect(parsed.isDM).toBe(true);
  });

  it("should detect thread replies", () => {
    const reply: SlackEvent = { ...baseEvent, thread_ts: "1711234560.000" };
    const parsed = parseSlackEvent(reply, "U02PKBZSB9Q");
    expect(parsed.isThreadReply).toBe(true);
  });

  it("should not flag messages without mention in channels", () => {
    const noMention: SlackEvent = { ...baseEvent, text: "general discussion" };
    const parsed = parseSlackEvent(noMention, "U02PKBZSB9Q");
    expect(parsed.isMention).toBe(false);
    expect(parsed.isDM).toBe(false);
  });

  it("should ignore bot messages", () => {
    const bot: SlackEvent = { ...baseEvent, bot_id: "B456" };
    const parsed = parseSlackEvent(bot, "U02PKBZSB9Q");
    expect(parsed.isBot).toBe(true);
  });

  it("should ignore own messages", () => {
    const self: SlackEvent = { ...baseEvent, user: "U02PKBZSB9Q" };
    const parsed = parseSlackEvent(self, "U02PKBZSB9Q");
    expect(parsed.isSelf).toBe(true);
  });
});

describe("shouldCreateNotification", () => {
  it("should create notification for DMs from non-bots", () => {
    const parsed = {
      isMention: false, isDM: true, isThreadReply: false,
      isBot: false, isSelf: false, channel: "D123", user: "U999",
    };
    expect(shouldCreateNotification(parsed)).toBe(true);
  });

  it("should create notification for direct mentions", () => {
    const parsed = {
      isMention: true, isDM: false, isThreadReply: false,
      isBot: false, isSelf: false, channel: "C123", user: "U999",
    };
    expect(shouldCreateNotification(parsed)).toBe(true);
  });

  it("should NOT create for bot messages", () => {
    const parsed = {
      isMention: true, isDM: false, isThreadReply: false,
      isBot: true, isSelf: false, channel: "C123", user: "UBOT",
    };
    expect(shouldCreateNotification(parsed)).toBe(false);
  });

  it("should NOT create for own messages", () => {
    const parsed = {
      isMention: false, isDM: true, isThreadReply: false,
      isBot: false, isSelf: true, channel: "D123", user: "U02PKBZSB9Q",
    };
    expect(shouldCreateNotification(parsed)).toBe(false);
  });

  it("should NOT create for unmentioned channel messages", () => {
    const parsed = {
      isMention: false, isDM: false, isThreadReply: false,
      isBot: false, isSelf: false, channel: "C123", user: "U999",
    };
    expect(shouldCreateNotification(parsed)).toBe(false);
  });
});

describe("buildNotificationFromSlack", () => {
  it("should build a response-type notification for DMs", () => {
    const notif = buildNotificationFromSlack({
      event: baseEvent,
      channelName: "team-vector",
      userName: "Jane Smith",
      isDM: true,
    });
    expect(notif.taskType).toBe("response");
    expect(notif.source).toBe("slack");
    expect(notif.title).toContain("Jane Smith");
    expect(notif.priority).toBeDefined();
  });

  it("should build a response-type notification for mentions", () => {
    const notif = buildNotificationFromSlack({
      event: baseEvent,
      channelName: "team-vector",
      userName: "Jane Smith",
      isDM: false,
    });
    expect(notif.taskType).toBe("response");
    expect(notif.source).toBe("slack");
    expect(notif.title).toContain("team-vector");
  });

  it("should include thread URL when available", () => {
    const withThread: SlackEvent = { ...baseEvent, thread_ts: "1711234560.000" };
    const notif = buildNotificationFromSlack({
      event: withThread,
      channelName: "team-vector",
      userName: "Jane Smith",
      isDM: false,
    });
    expect(notif.url).toContain("archives");
    expect(notif.url).toContain(baseEvent.channel);
  });
});

describe("deduplicateSlackEvent", () => {
  it("should detect duplicate events by channel + ts", () => {
    const seen = new Set<string>();
    expect(deduplicateSlackEvent(baseEvent, seen)).toBe(false);
    expect(deduplicateSlackEvent(baseEvent, seen)).toBe(true);
  });

  it("should allow different messages through", () => {
    const seen = new Set<string>();
    const other: SlackEvent = { ...baseEvent, ts: "9999999.000" };
    deduplicateSlackEvent(baseEvent, seen);
    expect(deduplicateSlackEvent(other, seen)).toBe(false);
  });
});
