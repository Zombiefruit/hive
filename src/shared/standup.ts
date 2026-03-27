/**
 * Daily standup report generation.
 *
 * Reads notifications to produce a "what I did yesterday / what I'm doing today" report.
 * Output is Geekbot-compatible markdown text.
 */

export interface SummaryNotification {
  id: string;
  title: string;
  source: string;
  stage: string;
  taskType?: string;
  priority?: string;
  actionNeeded?: string;
  timeline?: Array<{ timestamp: string; event: string }>;
  completedAt?: string;
}

export interface StandupReport {
  yesterday: Array<{ title: string; source: string; event: string }>;
  today: Array<{ title: string; source: string; priority: string; actionNeeded?: string }>;
  blockers: string[];
  date: string;
}

/**
 * Build a standup report from notifications.
 * "Yesterday" = tasks completed or with significant progress yesterday.
 * "Today" = active tasks sorted by priority.
 */
export function buildStandupReport(
  notifications: SummaryNotification[],
  referenceDate: Date,
): StandupReport {
  const yesterday = new Date(referenceDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const todayStr = referenceDate.toISOString().slice(0, 10);

  const yesterdayItems: StandupReport["yesterday"] = [];
  for (const n of notifications) {
    if (n.stage === "done" && n.completedAt?.startsWith(yesterdayStr)) {
      yesterdayItems.push({ title: n.title, source: n.source, event: "Completed" });
      continue;
    }
    if (n.timeline) {
      for (const entry of n.timeline) {
        if (entry.timestamp.startsWith(yesterdayStr) && !entry.event.includes("Reset from planning")) {
          yesterdayItems.push({ title: n.title, source: n.source, event: entry.event });
          break;
        }
      }
    }
  }

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, backlog: 4 };
  const todayItems = notifications
    .filter(n => ["new", "start_work", "plan_review", "hack", "ship", "code_review", "pr_feedback", "preparing", "ready"].includes(n.stage))
    .sort((a, b) => (priorityOrder[a.priority ?? "medium"] ?? 2) - (priorityOrder[b.priority ?? "medium"] ?? 2))
    .map(n => ({ title: n.title, source: n.source, priority: n.priority ?? "medium", actionNeeded: n.actionNeeded }));

  return { yesterday: yesterdayItems, today: todayItems, blockers: [], date: todayStr };
}

/**
 * Format a standup report as copy-paste markdown text.
 */
export function formatStandupText(report: StandupReport): string {
  const lines: string[] = [];

  lines.push("**What did you do yesterday?**");
  if (report.yesterday.length === 0) {
    lines.push("- (no tracked activity)");
  } else {
    for (const item of report.yesterday) {
      lines.push(`- [${item.source}] ${item.title} — ${item.event}`);
    }
  }

  lines.push("");
  lines.push("**What are you doing today?**");
  if (report.today.length === 0) {
    lines.push("- (no active tasks)");
  } else {
    for (const item of report.today) {
      lines.push(`- [${item.priority}] ${item.title}`);
    }
  }

  lines.push("");
  lines.push("**Any blockers?**");
  if (report.blockers.length === 0) {
    lines.push("- None");
  } else {
    for (const b of report.blockers) {
      lines.push(`- ${b}`);
    }
  }

  return lines.join("\n");
}
