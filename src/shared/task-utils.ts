/** Shared utility functions for task/notification processing. */

/** The 5-level priority system. */
export type Priority = "critical" | "high" | "medium" | "low" | "backlog";

/** All valid workflow stages. */
export const VALID_STAGES = [
  "new", "start_work", "plan_review", "hack", "ship",
  "code_review", "pr_feedback", "done", "backlog", "skipped",
  "preparing", "ready",
] as const;
export type Stage = typeof VALID_STAGES[number];

/** Stage ordering for consolidation — higher = more progress. */
export const STAGE_ORDER: Record<string, number> = {
  skipped: 0, backlog: 1, new: 2, preparing: 3, ready: 4,
  start_work: 5, plan_review: 6, hack: 7, ship: 8,
  code_review: 9, pr_feedback: 10, done: 11,
};

export const CONFIDENCE_THRESHOLD = 5;

/** Task type categorization. */
export const AGENT_ACTIONABLE_TYPES = new Set(["implementation"]);
export const HUMAN_ONLY_TYPES = new Set(["meeting_prep", "response", "review", "investigation"]);

/** Valid stage transitions — maps each stage to its allowed next stages. */
const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ["start_work"],
  start_work: ["hack"],          // drag from Planning → Hacking = approve plan
  plan_review: ["hack"],         // legacy: plan_review also goes to hack
  hack: ["ship"],
  ship: ["code_review"],
  code_review: ["pr_feedback", "done"],
  pr_feedback: ["code_review", "done"],
  preparing: ["ready"],
  ready: ["done"],
};

/** Check whether a stage transition is allowed. backlog, done, and skipped are always valid targets. */
export function isValidTransition(from: string, to: string): boolean {
  if (to === "backlog" || to === "done" || to === "skipped") return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Compute a parent task's stage from its subtask stages. Highest active stage wins; all done = done. */
export function computeParentStage(subtaskStages: string[]): string {
  if (subtaskStages.length === 0) return "new";
  if (subtaskStages.every(s => s === "done")) return "done";
  // Find the highest active (non-done, non-skipped) stage
  let maxOrder = 0;
  let maxStage = "new";
  for (const s of subtaskStages) {
    if (s === "done" || s === "skipped") continue;
    const order = STAGE_ORDER[s] ?? 0;
    if (order > maxOrder) { maxOrder = order; maxStage = s; }
  }
  return maxStage;
}

/** Normalize legacy/invalid priority values to the 5-level system. */
export function normalizePriority(p: string | undefined): Priority {
  if (!p) return "medium";
  const lower = p.toLowerCase().trim();
  if (lower === "critical" || lower === "urgent") return "critical";
  if (lower === "high" || lower === "today") return "high";
  if (lower === "medium" || lower === "actionable") return "medium";
  if (lower === "low" || lower === "fyi") return "low";
  if (lower === "backlog" || lower === "noise") return "backlog";
  return "medium";
}

/**
 * Extract a stable dedup key from a notification.
 * Checks all URLs (primary + links array) for known ID patterns.
 * Returns a string that's the same for duplicate items across sources.
 */
export function extractKey(n: { source: string; title: string; url?: string; links?: Array<{ url: string }> }): string {
  const urls: string[] = [];
  if (n.url) urls.push(n.url);
  if (n.links) for (const l of n.links) { if (l.url) urls.push(l.url); }

  for (const url of urls) {
    const prMatch = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
    if (prMatch) return `github:${prMatch[1]}:pr:${prMatch[2]}`;
    const linearMatch = url.match(/\/issue\/([A-Z]+-\d+)/);
    if (linearMatch) return `linear:${linearMatch[1]}`;
    const slackMatch = url.match(/archives\/([A-Z0-9]+)(?:\/p(\d+))?/);
    if (slackMatch) return slackMatch[2] ? `slack:${slackMatch[1]}:${slackMatch[2]}` : `slack:${slackMatch[1]}`;
  }
  const ticketMatch = n.title.match(/([A-Z]+-\d+)/);
  if (ticketMatch) return `linear:${ticketMatch[1]}`;
  const prTitleMatch = n.title.match(/PR\s*#?(\d+)/i);
  if (prTitleMatch) return `github:pr:${prTitleMatch[1]}`;
  return `${n.source}:${n.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

/** Convert fetch cadence config string to milliseconds. Returns null for manual. */
export function cadenceToMs(cadence: string): number | null {
  if (cadence === "manual") return null;
  if (cadence === "15min") return 15 * 60 * 1000;
  if (cadence === "30min") return 30 * 60 * 1000;
  if (cadence === "1hr") return 60 * 60 * 1000;
  return null;
}

// ── Slack workspace helpers ──

/** Default Slack workspace — overridden by config.slackWorkspace at startup */
let _slackWorkspace = "workspace";

/** Set the Slack workspace from config (call at startup). */
export function setSlackWorkspace(workspace: string): void {
  if (workspace) _slackWorkspace = workspace;
}

/** Get the base Slack URL for the configured workspace. */
export function getSlackBaseUrl(workspace?: string): string {
  return `https://${workspace ?? _slackWorkspace}.slack.com`;
}

/** Build a Slack archive URL for a channel or thread. */
export function buildSlackArchiveUrl(channelId: string, threadTs?: string, workspace?: string): string {
  const base = getSlackBaseUrl(workspace);
  const ts = threadTs ? `/p${threadTs.replace(".", "")}` : "";
  return `${base}/archives/${channelId}${ts}`;
}

/** Sanitize a URL — fix common malformations from AI-generated links. */
export function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  let u = url.trim();

  // Fix ALL broken Slack URL formats → proper archive permalink
  // The archive format (xxx.slack.com/archives/ID) is the only one that
  // opens the native Slack app AND navigates to the correct thread.
  // Leave valid archive URLs untouched (from ANY workspace).

  if (u.includes("slack") && !u.includes(".slack.com/archives/")) {
    // Extract a valid Slack ID (starts with C for channels, D for DMs, U for users)
    const idMatch = u.match(/([CDU][A-Z0-9]{8,})/);
    if (idMatch) {
      return buildSlackArchiveUrl(idMatch[1]);
    }
    // Fake channel IDs with underscores, channel names, bare "slack:dm" etc — remove
    return undefined;
  }

  // Ensure URL has proper protocol
  if (!u.startsWith("http://") && !u.startsWith("https://")) {
    u = `https://${u}`;
  }

  return u;
}
