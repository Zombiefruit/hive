/**
 * Stage Machine — single source of truth for task workflow transitions.
 *
 * Every stage change in the app — drag-and-drop, CTA click, skill completion,
 * agent suggestion — must go through this module. This ensures consistent
 * behavior, valid transitions, and correct skill execution.
 */

import { isValidTransition, STAGE_ORDER } from "./task-utils";

// ── Stage metadata ──

export interface StageAction {
  skill?: string;           // skill to run on entry (e.g. "/hack")
  usePlanAgent?: boolean;   // uses prepareWorkPlan instead of a skill
  label: string;            // human-readable label
  ctaLabel?: string;        // CTA button text (if this stage needs user action to advance)
  inProgress?: boolean;     // true = an agent is actively working, no CTA shown
}

/** What happens when a task enters each stage. */
export const STAGE_ACTIONS: Record<string, StageAction> = {
  new:          { label: "Inbox", ctaLabel: "Move to Planning" },
  start_work:   { usePlanAgent: true, label: "Planning", inProgress: true },
  plan_review:  { label: "Plan Review", ctaLabel: "Approve & Start" },
  hack:         { skill: "/hack", label: "Hacking", inProgress: true },
  ship:         { skill: "/ship", label: "Shipping", inProgress: true },
  code_review:  { skill: "/code-review", label: "Reviewing", inProgress: true },
  pr_feedback:  { skill: "/handle-pr-feedback", label: "Fixing Feedback", inProgress: true },
  preparing:    { usePlanAgent: true, label: "Preparing", inProgress: true },
  ready:        { label: "Ready", ctaLabel: "Mark Done" },
  done:         { label: "Done" },
  backlog:      { label: "Backlog" },
  skipped:      { label: "Skipped" },
};

// ── Agent vs Human track ──

const AGENT_TRACK = ["new", "start_work", "plan_review", "hack", "ship", "code_review", "pr_feedback", "done"];
const HUMAN_TRACK = ["new", "preparing", "ready", "done"];

export function isHumanTask(taskType?: string): boolean {
  return taskType === "response" || taskType === "meeting_prep";
}

/** Get the ordered track for a task type. */
export function getTrack(taskType?: string): string[] {
  return isHumanTask(taskType) ? HUMAN_TRACK : AGENT_TRACK;
}

// ── Next stage ──

/** Get the single next stage for a task, or null if it's at a terminal/in-progress stage. */
export function getNextStage(currentStage: string, taskType?: string): string | null {
  const track = getTrack(taskType);
  const idx = track.indexOf(currentStage);
  if (idx === -1 || idx >= track.length - 1) return null;
  return track[idx + 1];
}

/** Get the CTA label for the current stage, or null if no user action is needed. */
export function getStageCTA(currentStage: string, taskType?: string): { label: string; targetStage: string } | null {
  const action = STAGE_ACTIONS[currentStage];
  if (!action?.ctaLabel) return null;

  const next = getNextStage(currentStage, taskType);
  if (!next) return null;

  // Special case: "new" for human tasks says "Prepare" not "Move to Planning"
  if (currentStage === "new" && isHumanTask(taskType)) {
    return { label: "Prepare", targetStage: next };
  }

  return { label: action.ctaLabel, targetStage: next };
}

// ── Transition validation ──

/**
 * Can the user drop a task from `from` stage to `to` stage?
 * Allows: one step forward on the track, plus backlog/done/skipped from anywhere.
 */
export function canDropTo(from: string, to: string, taskType?: string): boolean {
  // Always allowed targets
  if (to === "backlog" || to === "done" || to === "skipped") return true;
  // Same stage = no-op
  if (from === to) return false;

  const track = getTrack(taskType);
  const fromIdx = track.indexOf(from);
  const toIdx = track.indexOf(to);

  // Must be on the same track
  if (fromIdx === -1 || toIdx === -1) return false;

  // Allow moving forward by exactly 1 step on the track
  // Special: plan_review→hack is valid (plan_review is a sub-stage of the start_work→hack transition)
  if (from === "plan_review" && to === "hack") return true;

  return toIdx === fromIdx + 1;
}

/**
 * Get what skill/action to trigger when transitioning to a stage.
 * Returns the STAGE_ACTIONS entry for the target stage.
 */
export function getStageAction(targetStage: string): StageAction | null {
  return STAGE_ACTIONS[targetStage] ?? null;
}

/**
 * Map a skill name to the stage it belongs to.
 * Used by NextStepsCard to determine stage from agent-suggested skills.
 */
export function skillToStage(skill: string): string | null {
  for (const [stage, action] of Object.entries(STAGE_ACTIONS)) {
    if (action.skill === skill) return stage;
  }
  return null;
}
