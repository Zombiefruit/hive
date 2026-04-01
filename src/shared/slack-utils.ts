/** Slack message classification and filtering utilities. */

export interface SlackMessage {
  author: string;
  channel: string;
  text: string;
  isDM: boolean;
  botId?: string;
  subtype?: string;
}

export interface SlackConfig {
  managerSlackId: string;
  coworkerIds: Set<string>;
  workStart: string;
  workEnd: string;
  timezone: string;
}

/** Classify a Slack message by urgency based on who sent it. */
export function classifySlackUrgency(
  msg: SlackMessage,
  config: { managerSlackId: string; coworkerIds: Set<string> },
): "critical" | "high" | "medium" | "low" {
  if (msg.isDM && msg.author === config.managerSlackId) return "critical";
  if (msg.isDM && config.coworkerIds.has(msg.author)) return "high";
  if (msg.text.includes(`<@${config.managerSlackId}>`)) return "high";
  if (msg.isDM) return "medium";
  return "low";
}

/** Check if a message is from a bot. */
export function isBot(msg: { author: string; botId?: string; subtype?: string }): boolean {
  return !!msg.botId || msg.subtype === "bot_message" || msg.author === "USLACKBOT";
}

/** Check if the current time is outside working hours (quiet hours). */
export function isQuietHour(
  now: Date,
  config: { workStart: string; workEnd: string; timezone: string },
): boolean {
  const timeStr = now.toLocaleString("en-US", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = timeStr.split(":").map(Number);
  const nowMins = h * 60 + m;
  const [startH, startM] = config.workStart.split(":").map(Number);
  const [endH, endM] = config.workEnd.split(":").map(Number);
  return nowMins < startH * 60 + startM || nowMins > endH * 60 + endM;
}

/** Determine if a critical mention should auto-spawn a planning agent. */
export function shouldAutoSpawn(priority: string, taskType: string): boolean {
  return priority === "critical" && taskType === "implementation";
}
