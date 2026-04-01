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
  new:          { label: "Inbox",              color: "var(--mantine-color-blue-filled)", tip: "New items from all sources." },
  start_work:   { label: "Planning",           color: "var(--mantine-color-violet-filled)", tip: "Agent creating implementation plan. Drag to Hacking to approve." },
  plan_review:  { label: "Planning",           color: "var(--mantine-color-violet-filled)", tip: "Plan ready — drag to Hacking to approve." },
  hack:         { label: "Hacking",            color: "var(--mantine-color-green-filled)", tip: "Agent implementing the plan." },
  ship:         { label: "Shipping",           color: "var(--mantine-color-cyan-filled)", tip: "Running tests, pushing branch, opening PR." },
  code_review:  { label: "Reviewing",          color: "var(--mantine-color-orange-filled)", tip: "Agent reviewing the pull request." },
  pr_feedback:  { label: "Fixing Feedback",    color: "var(--mantine-color-pink-filled)", tip: "Agent addressing PR reviewer comments." },
  preparing:    { label: "Preparing",          color: "var(--mantine-color-violet-filled)", tip: "Gathering context." },
  ready:        { label: "Ready",              color: "var(--mantine-color-green-filled)", tip: "Context ready — review and act." },
  backlog:      { label: "Backlog",            color: "var(--mantine-color-gray-6)", tip: "Low priority — when you have time." },
  done:         { label: "Done",               color: "var(--mantine-color-dimmed)", tip: "Completed." },
  skipped:      { label: "Reviewed",           color: "var(--mantine-color-gray-6)", tip: "AI skipped. Drag to Inbox if wrong." },
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
  critical: "var(--mantine-color-red-filled)",
  high:     "var(--mantine-color-yellow-filled)",
  medium:   "var(--mantine-color-blue-filled)",
  low:      "var(--mantine-color-dimmed)",
  backlog:  "var(--mantine-color-gray-6)",
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
  critical: "color-mix(in srgb, var(--mantine-color-red-filled) 8%, transparent)",
  high:     "color-mix(in srgb, var(--mantine-color-yellow-filled) 6%, transparent)",
  medium:   "color-mix(in srgb, var(--mantine-color-blue-filled) 4%, transparent)",
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
