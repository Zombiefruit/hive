/**
 * Slack hook service — periodically checks for new mentions/DMs via MCP bridge.
 *
 * Runs on a faster cadence than the full poll (every 60s vs 10min),
 * only checking Slack for direct mentions and DMs addressed to the user.
 * Creates notification entries that appear in the inbox immediately.
 */

import { parseSlackEvent, shouldCreateNotification, buildNotificationFromSlack, deduplicateSlackEvent, type SlackEvent } from "./slack-hook";
import { classifySlackUrgency, isQuietHour, type SlackConfig } from "../../shared/slack-utils";
import { upsertNotification } from "./poll-service";
import { askBridge } from "../mcp-bridge";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let interval: ReturnType<typeof setInterval> | null = null;
let seenEvents = new Set<string>();
const DEFAULT_CADENCE_MS = 60_000; // 1 minute

function logHook(msg: string): void {
  try {
    const logPath = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "slack-hook.log");
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

/**
 * Check Slack for recent mentions/DMs via the MCP bridge.
 * Returns the number of new notifications created.
 */
export async function checkSlackMentions(config: {
  userSlackId: string;
  channels: string[];
  slackConfig: SlackConfig;
}): Promise<number> {
  const { userSlackId, channels, slackConfig } = config;

  // Respect quiet hours
  if (isQuietHour(new Date(), slackConfig)) {
    logHook("Skipping — quiet hours");
    return 0;
  }

  // Ask bridge to search for recent mentions
  const prompt = `Search Slack for recent messages mentioning <@${userSlackId}> in the last 5 minutes using mcp__claude_ai_Slack__slack_search_public_and_private with query "to:<@${userSlackId}>". Also check for DMs using mcp__claude_ai_Slack__slack_read_channel on any active DM channels. Return ONLY a JSON array of messages, each with: { "channel": "C...", "user": "U...", "text": "...", "ts": "...", "thread_ts": "..." or null, "channel_name": "...", "user_name": "..." }. If no new messages, return [].`;

  let response: string;
  try {
    response = await askBridge(prompt, 30_000);
  } catch (err) {
    logHook(`Bridge error: ${err}`);
    return 0;
  }

  // Parse response
  let messages: Array<{
    channel: string;
    user: string;
    text: string;
    ts: string;
    thread_ts?: string | null;
    channel_name?: string;
    user_name?: string;
    bot_id?: string;
  }> = [];

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      messages = JSON.parse(jsonMatch[0]);
    }
  } catch {
    logHook(`Failed to parse response: ${response.slice(0, 200)}`);
    return 0;
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    logHook("No new messages");
    return 0;
  }

  let created = 0;

  for (const msg of messages) {
    const event: SlackEvent = {
      type: "message",
      channel: msg.channel,
      user: msg.user,
      text: msg.text,
      ts: msg.ts,
      thread_ts: msg.thread_ts ?? undefined,
      bot_id: msg.bot_id,
    };

    // Dedup
    if (deduplicateSlackEvent(event, seenEvents)) continue;

    // Parse and filter
    const parsed = parseSlackEvent(event, userSlackId);
    if (!shouldCreateNotification(parsed)) continue;

    // Classify urgency
    const priority = classifySlackUrgency(
      { author: msg.user, channel: msg.channel, text: msg.text, isDM: parsed.isDM },
      slackConfig,
    );

    // Build and inject notification
    const notif = buildNotificationFromSlack({
      event,
      channelName: msg.channel_name ?? msg.channel,
      userName: msg.user_name ?? msg.user,
      isDM: parsed.isDM,
    });

    // Override priority with classified value
    upsertNotification({
      id: notif.id,
      title: notif.title,
      summary: notif.summary,
      source: notif.source,
      taskType: notif.taskType,
      priority,
      url: notif.url,
      stage: "new",
      links: notif.links,
      createdAt: new Date().toISOString(),
    });

    logHook(`New: ${notif.title} (${priority})`);
    created++;
  }

  if (created > 0) {
    logHook(`Created ${created} notification(s)`);
  }

  return created;
}

/** Start the Slack hook polling loop. */
export function startSlackHook(config: {
  userSlackId: string;
  channels: string[];
  slackConfig: SlackConfig;
  cadenceMs?: number;
}): void {
  if (interval) return;
  const cadence = config.cadenceMs ?? DEFAULT_CADENCE_MS;
  logHook(`Starting slack hook (cadence: ${cadence}ms)`);

  // Don't run immediately — let the bridge warm up
  interval = setInterval(() => {
    checkSlackMentions(config).catch(err => {
      logHook(`Error: ${err}`);
    });
  }, cadence);
}

/** Stop the Slack hook polling loop. */
export function stopSlackHook(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
    logHook("Stopped");
  }
}

/** Reset seen events (for testing). */
export function _resetSeenEvents(): void {
  seenEvents = new Set();
}
