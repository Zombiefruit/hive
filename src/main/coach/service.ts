/**
 * Coach Service — analyzes work patterns, scores output, generates daily briefs.
 * Pure computation from notification history — no MCP tools needed.
 */

import { getNotifications } from "../notifications/poll-service";
import { askEphemeralProcess, addDebugEntry } from "../mcp-bridge";
import { getRelevantMemories, formatMemoriesForPrompt } from "../memory/service";

export interface DailyBrief {
  yesterday: string[];
  today: string[];
  blockers: string[];
  generatedAt: string;
}

export interface WorkPatterns {
  tasksByType: Record<string, number>;
  tasksByStage: Record<string, number>;
  completedThisWeek: number;
  completedLastWeek: number;
  avgCompletionHours: number;
  bottleneckStage: string;
  meetingLoad: number;
}

export interface OutputScore {
  overall: number;           // 0-100
  completionRate: number;    // 0-100
  responseSpeed: number;     // 0-100
  planQuality: number;       // 0-100
  suggestions: string[];
  weekLabel: string;
}

/** Analyze work patterns from notification history. */
export function analyzeWorkPatterns(days = 7): WorkPatterns {
  const notifications = getNotifications();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const lastWeekCutoff = new Date(Date.now() - days * 2 * 86400000).toISOString();

  const active = notifications.filter(n => n.stage !== "skipped");

  // Tasks by type
  const tasksByType: Record<string, number> = {};
  for (const n of active) {
    const type = n.taskType ?? "unknown";
    tasksByType[type] = (tasksByType[type] ?? 0) + 1;
  }

  // Tasks by stage
  const tasksByStage: Record<string, number> = {};
  for (const n of active) {
    const stage = n.stage ?? "new";
    tasksByStage[stage] = (tasksByStage[stage] ?? 0) + 1;
  }

  // Completed this week vs last week
  const completedThisWeek = notifications.filter(n =>
    n.stage === "done" && n.completedAt && n.completedAt >= cutoff,
  ).length;
  const completedLastWeek = notifications.filter(n =>
    n.stage === "done" && n.completedAt && n.completedAt >= lastWeekCutoff && n.completedAt < cutoff,
  ).length;

  // Average completion time (from createdAt to completedAt)
  const completedWithTimes = notifications.filter(n =>
    n.stage === "done" && n.completedAt && n.createdAt,
  );
  const avgMs = completedWithTimes.length > 0
    ? completedWithTimes.reduce((sum, n) => sum + (new Date(n.completedAt!).getTime() - new Date(n.createdAt).getTime()), 0) / completedWithTimes.length
    : 0;
  const avgCompletionHours = Math.round(avgMs / 3600000);

  // Bottleneck: which non-terminal stage has the most tasks?
  const nonTerminal = Object.entries(tasksByStage).filter(([s]) => s !== "done" && s !== "skipped" && s !== "new");
  const bottleneckStage = nonTerminal.sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";

  // Meeting load (count meeting_prep tasks)
  const meetingLoad = active.filter(n => n.taskType === "meeting_prep" && n.stage !== "done").length;

  return {
    tasksByType, tasksByStage,
    completedThisWeek, completedLastWeek,
    avgCompletionHours, bottleneckStage, meetingLoad,
  };
}

/** Score output quality for the current week. */
export function scoreOutput(): OutputScore {
  const patterns = analyzeWorkPatterns(7);
  const notifications = getNotifications();
  const active = notifications.filter(n => n.stage !== "skipped");

  // Completion rate: % of tasks that reached "done"
  const total = active.length || 1;
  const done = active.filter(n => n.stage === "done").length;
  const completionRate = Math.round((done / total) * 100);

  // Response speed: % of response tasks completed within 24h
  const responseTasks = active.filter(n => n.taskType === "response");
  const fastResponses = responseTasks.filter(n => {
    if (!n.completedAt || !n.createdAt) return false;
    return new Date(n.completedAt).getTime() - new Date(n.createdAt).getTime() < 86400000;
  });
  const responseSpeed = responseTasks.length > 0 ? Math.round((fastResponses.length / responseTasks.length) * 100) : 50;

  // Plan quality: average judge verdict confidence (if available)
  const withVerdicts = active.filter(n => n.verdict);
  const planQuality = withVerdicts.length > 0
    ? Math.round(withVerdicts.filter(n => n.verdict?.status === "approved").length / withVerdicts.length * 100)
    : 50;

  const overall = Math.round((completionRate * 0.4 + responseSpeed * 0.3 + planQuality * 0.3));

  // Generate suggestions
  const suggestions: string[] = [];
  const responseRatio = (patterns.tasksByType.response ?? 0) / total;
  if (responseRatio > 0.5) suggestions.push(`${Math.round(responseRatio * 100)}% of tasks are responses — consider batching Slack replies into 2-3 focus blocks.`);
  if (patterns.bottleneckStage === "plan_review") suggestions.push("Tasks are piling up in Plan Review — approve or reject plans to unblock progress.");
  if (patterns.bottleneckStage === "hack") suggestions.push("Multiple tasks in Hack stage — consider finishing one before starting another.");
  if (patterns.meetingLoad > 5) suggestions.push(`${patterns.meetingLoad} upcoming meetings — block focus time on your calendar.`);
  if (patterns.completedThisWeek < patterns.completedLastWeek) {
    suggestions.push(`Completed ${patterns.completedThisWeek} tasks this week vs ${patterns.completedLastWeek} last week — check if anything is blocking you.`);
  }
  if (suggestions.length === 0) suggestions.push("Looking good — keep it up!");

  const now = new Date();
  const weekLabel = `Week of ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return { overall, completionRate, responseSpeed, planQuality, suggestions, weekLabel };
}

/** Generate a daily brief using an ephemeral agent. */
export async function generateDailyBrief(): Promise<DailyBrief> {
  const notifications = getNotifications();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000).toISOString();

  const completedYesterday = notifications
    .filter(n => n.completedAt && n.completedAt >= yesterday && n.stage === "done")
    .map(n => n.title);

  const activeTasks = notifications
    .filter(n => n.stage && !["done", "skipped", "new"].includes(n.stage))
    .sort((a, b) => {
      const pOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, backlog: 4 };
      return (pOrder[a.priority] ?? 5) - (pOrder[b.priority] ?? 5);
    })
    .map(n => `[${n.priority}] ${n.title} (${n.stage})`);

  const blockers = notifications
    .filter(n => {
      if (n.stage === "done" || n.stage === "skipped") return false;
      // Stalled: no timeline event in 24h
      const lastEvent = n.timeline?.[n.timeline.length - 1];
      return lastEvent && new Date(lastEvent.timestamp).getTime() < now.getTime() - 86400000;
    })
    .map(n => n.title);

  return {
    yesterday: completedYesterday.length > 0 ? completedYesterday : ["No tasks completed yesterday"],
    today: activeTasks.length > 0 ? activeTasks : ["No active tasks — check your inbox"],
    blockers: blockers.length > 0 ? blockers : ["No blockers detected"],
    generatedAt: now.toISOString(),
  };
}
