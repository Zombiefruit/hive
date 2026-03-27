/**
 * Shared UI constants — centralized colors, labels, and metadata
 * for stages, sources, priorities, and task types.
 *
 * Import these instead of duplicating hex values across pages.
 */

import type { Stage, Priority } from "./task-utils";

// ── Stage metadata ──

export interface StageMeta {
  label: string;
  color: string;
  tip: string;
}

export const STAGE_META: Record<Stage, StageMeta> = {
  new:          { label: "Inbox",       color: "#3b82f6", tip: "New items from all sources." },
  start_work:   { label: "Planning",    color: "#a855f7", tip: "Agent running /start-work." },
  plan_review:  { label: "Plan Review", color: "#f59e0b", tip: "Plan reviewers assessing." },
  hack:         { label: "Building",    color: "#22c55e", tip: "Agent implementing plan." },
  ship:         { label: "Shipping",    color: "#06b6d4", tip: "Verifying, pushing, opening PR." },
  code_review:  { label: "Reviewing",   color: "#f97316", tip: "Code review agents running." },
  pr_feedback:  { label: "PR Feedback", color: "#ec4899", tip: "Addressing reviewer comments." },
  preparing:    { label: "Preparing",   color: "#a855f7", tip: "Gathering context." },
  ready:        { label: "Ready",       color: "#22c55e", tip: "Context ready — review and act." },
  backlog:      { label: "Backlog",     color: "#4b5563", tip: "Low priority — when you have time." },
  done:         { label: "Done",        color: "#6b7280", tip: "Completed." },
  skipped:      { label: "Reviewed",    color: "#525252", tip: "AI skipped. Drag to Inbox if wrong." },
};

// ── Source colors ──

export const SOURCE_COLORS: Record<string, string> = {
  linear:  "#5E6AD2",
  slack:   "#E01E5A",
  github:  "#FFFFFF",
  notion:  "#FFFFFF",
  email:   "#EA4335",
  manual:  "#A78BFA",
};

// ── Priority colors ──

export const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "#ef4444",
  high:     "#f59e0b",
  medium:   "#3b82f6",
  low:      "#6b7280",
  backlog:  "#4b5563",
};

/** Mantine color names for priorities (used by Badge/ThemeIcon). */
export const PRIORITY_MANTINE: Record<Priority, string> = {
  critical: "red",
  high:     "yellow",
  medium:   "blue",
  low:      "gray",
  backlog:  "gray",
};

/** Subtle background tints per priority (very low opacity). */
export const PRIORITY_BG_TINTS: Record<Priority, string> = {
  critical: "rgba(239, 68, 68, 0.08)",
  high:     "rgba(245, 158, 11, 0.06)",
  medium:   "rgba(59, 130, 246, 0.04)",
  low:      "transparent",
  backlog:  "transparent",
};

// ── Task type labels ──

export const TASK_TYPE_LABELS: Record<string, string> = {
  implementation: "Code",
  investigation:  "Research",
  review:         "Review",
  meeting_prep:   "Meeting",
  response:       "Reply",
  planning:       "Plan",
  follow_up:      "Follow up",
};
