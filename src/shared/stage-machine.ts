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
  usePlanAgent?: boolean;   // uses prepareWorkPlan instead of a skill (human tasks only)
  label: string;            // human-readable label
  ctaLabel?: string;        // CTA button text (if this stage needs user action to advance)
  inProgress?: boolean;     // true = an agent is actively working, no CTA shown
}

/** What happens when a task enters each stage. */
export const STAGE_ACTIONS: Record<string, StageAction> = {
  new:          { label: "Inbox", ctaLabel: "Move to Planning" },
  start_work:   { skill: "/start-work", label: "Planning", inProgress: true },
  plan_review:  { label: "Plan Review", ctaLabel: "Approve & Start" },
  hack:         { skill: "/hack", label: "Hacking", inProgress: true },
  ship:         { skill: "/ship", label: "Shipping", inProgress: true },
  code_review:  { skill: "/code-review", label: "Reviewing", inProgress: true },
  pr_feedback:  { skill: "/handle-pr-feedback", label: "Fixing Feedback", inProgress: true },
  preparing:    { usePlanAgent: true, label: "Preparing", inProgress: true },
  ready:        { label: "Ready", ctaLabel: "Mark Done" },
  done:         { skill: "/done", label: "Done" },
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
 * Allows: one step forward OR one step backward on the track,
 * plus backlog/done/skipped from anywhere.
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

  // Allow one step forward
  if (toIdx === fromIdx + 1) return true;

  // Special: plan_review→hack (plan_review is between start_work and hack in the track)
  if (from === "plan_review" && to === "hack") return true;

  // Specific backward transitions that make sense:
  // hack → start_work: go back to revise/redo the plan
  // code_review → hack: reviewer feedback needs code changes
  // pr_feedback → hack: same — need to rework
  if (from === "hack" && to === "start_work") return true;
  if (from === "code_review" && to === "hack") return true;
  if (from === "pr_feedback" && to === "hack") return true;

  return false;
}

/**
 * Get what skill/action to trigger when transitioning to a stage.
 * Returns the STAGE_ACTIONS entry for the target stage.
 */
export function getStageAction(targetStage: string): StageAction | null {
  return STAGE_ACTIONS[targetStage] ?? null;
}

/** Is this stage terminal (task resolved — no further workflow actions)? */
export function isTerminalStage(stage: string): boolean {
  return stage === "done" || stage === "backlog" || stage === "skipped";
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
