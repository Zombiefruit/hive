/**
 * Slack hook — real-time mention/DM monitoring (#43).
 *
 * Parses Slack events, filters relevant ones, and builds
 * PollNotification-compatible objects for the inbox.
 */

import { buildSlackArchiveUrl } from "../../shared/task-utils";

// ── Types ──

export interface SlackEvent {
  type: string;
  channel: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
}

export interface ParsedSlackEvent {
  isMention: boolean;
  isDM: boolean;
  isThreadReply: boolean;
  isBot: boolean;
  isSelf: boolean;
  channel: string;
  user: string;
}

// ── Parsing ──

/** Parse a raw Slack event and classify it. */
export function parseSlackEvent(event: SlackEvent, selfUserId: string): ParsedSlackEvent {
  const isDM = event.channel.startsWith("D");
  const isMention = event.text.includes(`<@${selfUserId}>`);
  const isThreadReply = !!event.thread_ts && event.thread_ts !== event.ts;
  const isBot = !!event.bot_id || event.subtype === "bot_message" || event.user === "USLACKBOT";
  const isSelf = event.user === selfUserId;

  return { isMention, isDM, isThreadReply, isBot, isSelf, channel: event.channel, user: event.user };
}

// ── Filtering ──

/** Determine if a parsed event should create a notification. */
export function shouldCreateNotification(parsed: ParsedSlackEvent): boolean {
  if (parsed.isBot) return false;
  if (parsed.isSelf) return false;
  return parsed.isDM || parsed.isMention;
}

// ── Notification building ──

interface BuildInput {
  event: SlackEvent;
  channelName: string;
  userName: string;
  isDM: boolean;
}

/** Build a PollNotification-shaped object from a Slack event. */
export function buildNotificationFromSlack(input: BuildInput) {
  const { event, channelName, userName, isDM } = input;
  const threadTs = event.thread_ts ?? event.ts;
  const url = buildSlackArchiveUrl(event.channel, threadTs);
  const snippet = event.text.length > 80 ? event.text.slice(0, 80) + "..." : event.text;

  const title = isDM
    ? `DM from ${userName}: ${snippet}`
    : `Mention in #${channelName}: ${snippet}`;

  const priority = isDM ? "high" : "medium";

  return {
    id: `slack-hook-${event.channel}-${event.ts}`,
    title,
    summary: event.text,
    source: "slack" as const,
    taskType: "response" as const,
    priority,
    url,
    stage: "new" as const,
    links: [{ type: "slack", label: isDM ? `DM with ${userName}` : `#${channelName}`, url }],
  };
}

// ── Dedup ──

/** Returns true if this event was already seen. Adds to seen set if new. */
export function deduplicateSlackEvent(event: SlackEvent, seen: Set<string>): boolean {
  const key = `${event.channel}:${event.ts}`;
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}
