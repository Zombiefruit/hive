/**
 * Reflect Service — weekly work analysis powered by MCP data from all sources.
 *
 * Architecture:
 * - Weekly background job fetches data from Slack, Linear, GitHub, Calendar via MCP
 * - Produces a structured assessment (ManagerTake) cached to disk
 * - Reflect page reads cached result instantly — no on-demand LLM calls
 * - Also computes fast signals from notification data (no LLM needed)
 */

import { getNotifications } from "../notifications/poll-service";
import type { PollNotification } from "../notifications/poll-service";
import { askMcpPlanningAgent, addDebugEntry } from "../mcp-bridge";
import { getConfig, hasConfig } from "../config";
import { loadBusinessContextSummary } from "../business-context";
import { loadSkillTemplate } from "../../shared/skill-loader";
import type {
  ResponseCadence, FocusScore, MeetingLoad, Throughput,
  WeeklySnapshot, ReflectSignals, ManagerTake, ReflectData,
} from "../../shared/reflect-types";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

function getDataDir(): string {
  return app.getPath("userData");
}

function getMondayISO(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setHours(0, 0, 0, 0);
  d.setDate(diff);
  return d.toISOString();
}

export function computeResponseCadence(notifications: PollNotification[], cutoffISO: string): ResponseCadence {
  const responseTasks = notifications.filter(
    n => n.taskType === "response" && n.createdAt >= cutoffISO,
  );

  if (responseTasks.length === 0) {
    return { medianReplyMinutes: 0, unansweredOver24h: 0, unansweredTitles: [], totalResponseTasks: 0, respondedWithin1h: 0 };
  }

  const now = Date.now();
  const diffs: number[] = [];
  let respondedWithin1h = 0;

  for (const t of responseTasks) {
    if (t.completedAt && t.createdAt) {
      const diffMin = (new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / 60000;
      diffs.push(diffMin);
      if (diffMin < 60) respondedWithin1h++;
    }
  }

  diffs.sort((a, b) => a - b);
  let medianReplyMinutes = 0;
  if (diffs.length > 0) {
    const mid = Math.floor(diffs.length / 2);
    medianReplyMinutes = diffs.length % 2 === 0
      ? (diffs[mid - 1] + diffs[mid]) / 2
      : diffs[mid];
  }

  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const unanswered = responseTasks.filter(
    t => t.stage !== "done" && t.stage !== "skipped" && new Date(t.createdAt).getTime() < twentyFourHoursAgo,
  );

  return {
    medianReplyMinutes: Math.round(medianReplyMinutes),
    unansweredOver24h: unanswered.length,
    unansweredTitles: unanswered.map(t => t.title),
    totalResponseTasks: responseTasks.length,
    respondedWithin1h,
  };
}

export function computeFocusScore(notifications: PollNotification[], cutoffISO: string): FocusScore {
  const activeStages = new Set(["hack", "ship", "code_review", "pr_feedback"]);
  const relevant = notifications.filter(n => n.createdAt >= cutoffISO);

  const now = new Date();
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }

  const dailyCounts: number[] = [];
  for (const day of days) {
    const dayStart = day.getTime();
    const dayEnd = dayStart + 86400000;
    let count = 0;
    for (const task of relevant) {
      const created = new Date(task.createdAt).getTime();
      const completed = task.completedAt ? new Date(task.completedAt).getTime() : Infinity;
      if (created <= dayEnd && completed >= dayStart && activeStages.has(task.stage ?? "")) {
        count++;
      }
      if (task.stage === "done" && task.timeline) {
        const hadActiveOnDay = task.timeline.some(ev => {
          const evTime = new Date(ev.timestamp).getTime();
          return evTime >= dayStart && evTime < dayEnd && Array.from(activeStages).some(s => ev.event.includes(s));
        });
        if (hadActiveOnDay && !(created <= dayEnd && completed >= dayStart && activeStages.has(task.stage ?? ""))) {
          count++;
        }
      }
    }
    dailyCounts.push(count);
  }

  const avgConcurrentWip = dailyCounts.length > 0
    ? Math.round((dailyCounts.reduce((s, c) => s + c, 0) / dailyCounts.length) * 10) / 10
    : 0;
  const maxConcurrentWip = Math.max(0, ...dailyCounts);

  let contextSwitchCount = 0;
  for (const task of relevant) {
    if (task.timeline) {
      const enteredHack = task.timeline.some(ev =>
        ev.event.includes("hack") && new Date(ev.timestamp).getTime() >= new Date(cutoffISO).getTime(),
      );
      if (enteredHack) contextSwitchCount++;
    } else if (task.stage === "hack") {
      contextSwitchCount++;
    }
  }

  const score = Math.max(0, Math.min(100, 100 - (avgConcurrentWip - 1) * 20 - contextSwitchCount * 5));

  return { avgConcurrentWip, maxConcurrentWip, contextSwitchCount, score: Math.round(score) };
}

export function computeMeetingLoad(notifications: PollNotification[], cutoffISO: string): MeetingLoad {
  const meetings = notifications.filter(
    n => n.taskType === "meeting_prep" && n.createdAt >= cutoffISO,
  );

  const meetingCount = meetings.length;
  const meetingHoursThisWeek = meetings.reduce((sum, m) => sum + (m.estimatedMinutes ?? 30), 0) / 60;

  let longestDeepWorkBlock = 480; // 8h working day in minutes
  if (meetings.length > 0) {
    const sorted = [...meetings].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    let maxGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = (new Date(sorted[i].createdAt).getTime() - new Date(sorted[i - 1].createdAt).getTime()) / 60000;
      if (gap > maxGap) maxGap = gap;
    }
    longestDeepWorkBlock = Math.min(480, Math.round(maxGap) || 480);
  }

  const meetingFocusRatio = Math.round((meetingHoursThisWeek / 40) * 1000) / 1000;

  return { meetingHoursThisWeek: Math.round(meetingHoursThisWeek * 10) / 10, longestDeepWorkBlock, meetingFocusRatio, meetingCount };
}

export function computeThroughput(notifications: PollNotification[], history: WeeklySnapshot[]): Throughput {
  const mondayISO = getMondayISO();
  const completedThisWeek = notifications.filter(
    n => n.stage === "done" && n.completedAt && n.completedAt >= mondayISO,
  ).length;

  const lastFour = history.slice(-4);
  const rollingFourWeekAvg = lastFour.length > 0
    ? Math.round((lastFour.reduce((s, h) => s + h.completed, 0) / lastFour.length) * 10) / 10
    : completedThisWeek;

  let weekOverWeekDelta = 0;
  if (history.length >= 1) {
    const lastWeek = history[history.length - 1].completed;
    weekOverWeekDelta = lastWeek > 0
      ? Math.round(((completedThisWeek - lastWeek) / lastWeek) * 100)
      : 0;
  }

  const completed = notifications.filter(n => n.stage === "done" && n.completedAt && n.createdAt);
  const byType: Record<string, number[]> = {};
  for (const t of completed) {
    const type = t.taskType ?? "unknown";
    const hours = (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / 3600000;
    if (!byType[type]) byType[type] = [];
    byType[type].push(hours);
  }
  const cycleTimeByType: Record<string, number> = {};
  for (const [type, hours] of Object.entries(byType)) {
    cycleTimeByType[type] = Math.round((hours.reduce((s, h) => s + h, 0) / hours.length) * 10) / 10;
  }

  return { completedThisWeek, rollingFourWeekAvg, weekOverWeekDelta, cycleTimeByType };
}

export function loadHistory(): WeeklySnapshot[] {
  const filePath = join(getDataDir(), "reflect-history.json");
  try {
    if (!existsSync(filePath)) return [];
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as WeeklySnapshot[];
  } catch {
    return [];
  }
}

export function saveHistory(history: WeeklySnapshot[]): void {
  const filePath = join(getDataDir(), "reflect-history.json");
  const trimmed = history.slice(-8);
  writeFileSync(filePath, JSON.stringify(trimmed, null, 2), "utf-8");
}

export function maybeSnapshotWeek(signals: ReflectSignals): void {
  const mondayISO = getMondayISO();
  const history = loadHistory();
  const alreadyExists = history.some(h => h.weekStartISO === mondayISO);
  if (alreadyExists) return;

  const completed = signals.throughput.completedThisWeek;
  const cycleHours = Object.values(signals.throughput.cycleTimeByType);
  const avgCycleHours = cycleHours.length > 0
    ? Math.round((cycleHours.reduce((s, h) => s + h, 0) / cycleHours.length) * 10) / 10
    : 0;

  const snapshot: WeeklySnapshot = {
    weekLabel: signals.weekLabel.replace("Week of ", ""),
    weekStartISO: mondayISO,
    completed,
    avgCycleHours,
    meetingHours: signals.meetingLoad.meetingHoursThisWeek,
    focusScore: signals.focus.score,
    responseCadenceMinutes: signals.responseCadence.medianReplyMinutes,
  };

  history.push(snapshot);
  saveHistory(history);
}

export function computeAllSignals(): ReflectSignals {
  const notifications = getNotifications();
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const history = loadHistory();

  const responseCadence = computeResponseCadence(notifications, cutoff);
  const focus = computeFocusScore(notifications, cutoff);
  const meetingLoad = computeMeetingLoad(notifications, cutoff);
  const throughput = computeThroughput(notifications, history);

  const now = new Date();
  const weekLabel = `Week of ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return { responseCadence, focus, meetingLoad, throughput, weekLabel };
}

const REFLECT_CACHE_PATH = () => join(getDataDir(), "reflect-cache.json");
const REFLECT_REFRESH_INTERVAL = 7 * 86400000; // 7 days

/** Check if the cached reflect analysis needs refreshing. */
export function reflectNeedsRefresh(): boolean {
  try {
    const stat = require("node:fs").statSync(REFLECT_CACHE_PATH());
    return Date.now() - stat.mtimeMs > REFLECT_REFRESH_INTERVAL;
  } catch {
    return true;
  }
}

/** Load cached manager take from disk. */
function loadCachedManagerTake(): ManagerTake | null {
  try {
    const raw = readFileSync(REFLECT_CACHE_PATH(), "utf-8");
    return JSON.parse(raw) as ManagerTake;
  } catch {
    return null;
  }
}

/** Save manager take to disk cache. */
function saveCachedManagerTake(take: ManagerTake): void {
  writeFileSync(REFLECT_CACHE_PATH(), JSON.stringify(take, null, 2), "utf-8");
}

/**
 * Run the weekly reflect analysis via MCP agent.
 * Fetches live data from Slack, Linear, GitHub, Calendar and produces
 * a structured assessment. Cached for 7 days.
 */
export async function refreshReflectAnalysis(): Promise<ManagerTake> {
  const generatedAt = new Date().toISOString();
  addDebugEntry("out", "[reflect] Starting weekly analysis via MCP", "coach");

  try {
    const cfg = hasConfig() ? getConfig() : null;
    const userName = cfg?.name ?? "the user";
    const businessContext = loadBusinessContextSummary();

    // Load the weekly-reflect skill template
    let skillPrompt = "";
    try {
      skillPrompt = loadSkillTemplate("weekly-reflect", { USER_NAME: userName });
    } catch {
      skillPrompt = "";
    }

    const prompt = `${skillPrompt}

## User
Name: ${userName}
${businessContext ? `\n## Business Context\n${businessContext}\n` : ""}

## Inbox Summary (from notification data)
${(() => {
  const notifs = getNotifications();
  const done = notifs.filter(n => n.stage === "done").length;
  const active = notifs.filter(n => n.stage === "hack" || n.stage === "ship" || n.stage === "code_review").length;
  const pending = notifs.filter(n => n.stage === "new" || n.stage === "start_work" || n.stage === "preparing").length;
  const unanswered = notifs.filter(n => n.taskType === "response" && n.stage !== "done" && n.stage !== "skipped").length;
  return `Completed: ${done}, Active work: ${active}, Pending: ${pending}, Unanswered responses: ${unanswered}`;
})()}

Analyze this engineer's work week. Use your MCP tools to fetch live data from Slack, Linear, GitHub, and Calendar. Return ONLY the JSON specified in the skill instructions.`;

    const raw = await askMcpPlanningAgent(prompt, undefined, (event) => {
      if (event.type === "tool_use") {
        addDebugEntry("out", `[reflect] ${event.content.slice(0, 80)}`, "coach");
      }
    }, "claude-sonnet-4-6");

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    const parsed = JSON.parse(jsonMatch[0]) as {
      summary: string;
      rating: string;
      wins?: string[];
      risks?: string[];
      focusAreas?: string[];
    };

    // Map the new format to ManagerTake (callouts = wins + risks + focusAreas)
    const callouts = [
      ...(parsed.wins ?? []),
      ...(parsed.risks ?? []),
      ...(parsed.focusAreas ?? []),
    ];

    const take: ManagerTake = {
      summary: parsed.summary,
      callouts,
      rating: parsed.rating,
      generatedAt,
    };

    saveCachedManagerTake(take);
    addDebugEntry("out", `[reflect] Analysis complete: ${take.rating}`, "coach");
    return take;
  } catch (err) {
    addDebugEntry("out", `[reflect] Analysis failed: ${err}`, "coach");
    return { summary: "Assessment unavailable — analysis failed.", callouts: [], rating: "Unknown", generatedAt };
  }
}

/** Get manager take — returns cached if fresh, otherwise returns null (caller triggers refresh). */
export function getCachedManagerTake(): ManagerTake | null {
  return loadCachedManagerTake();
}

export function getReflectSignals(): ReflectSignals {
  const signals = computeAllSignals();
  maybeSnapshotWeek(signals);
  return signals;
}

export async function getReflectData(): Promise<ReflectData> {
  const signals = computeAllSignals();
  maybeSnapshotWeek(signals);
  const history = loadHistory();

  // Return cached take if fresh, otherwise trigger background refresh
  let managerTake = getCachedManagerTake();
  if (!managerTake || reflectNeedsRefresh()) {
    // Try to generate now — if it fails, return cached or empty
    try {
      managerTake = await refreshReflectAnalysis();
    } catch {
      managerTake = managerTake ?? { summary: "Generating analysis...", callouts: [], rating: "Unknown", generatedAt: new Date().toISOString() };
    }
  }

  return { signals, managerTake, history };
}
