/**
 * Action types — structured actions that agents return for the UI to render.
 * Each action has a type, label, and risk level (except no_action).
 */

export type ActionRisk = "low" | "medium" | "high";

export type RunSkillAction = { type: "run_skill"; skill: string; label: string; description?: string; risk: ActionRisk; params?: Record<string, unknown> };
export type UpdateLinearAction = { type: "update_linear"; ticket: string; field: string; value: string; label: string; risk: "medium" };
export type OpenUrlAction = { type: "open_url"; url: string; label: string; risk: "low" };
export type SendSlackAction = { type: "send_slack"; channel: string; message: string; threadTs?: string; label: string; risk: "high" };
export type SendEmailAction = { type: "send_email"; to: string; subject: string; body: string; label: string; risk: "high" };
export type JoinMeetingAction = { type: "join_meeting"; url: string; label: string; risk: "low" };
export type ReviewPrAction = { type: "review_pr"; url: string; label: string; risk: "low" };
export type DismissAction = { type: "dismiss"; label: string; reason?: string; risk: "low" };
export type SnoozeAction = { type: "snooze"; label: string; reason?: string; risk: "low" };
export type NoAction = { type: "no_action"; label: string; description?: string };

export type Action =
  | RunSkillAction
  | UpdateLinearAction
  | OpenUrlAction
  | SendSlackAction
  | SendEmailAction
  | JoinMeetingAction
  | ReviewPrAction
  | DismissAction
  | SnoozeAction
  | NoAction;

export const KNOWN_ACTION_TYPES = [
  "run_skill", "update_linear", "open_url", "send_slack", "send_email",
  "join_meeting", "review_pr", "dismiss", "snooze", "no_action",
] as const;

export function isKnownActionType(type: string): boolean {
  return (KNOWN_ACTION_TYPES as readonly string[]).includes(type);
}

export function isValidAction(obj: unknown): obj is Action {
  if (!obj || typeof obj !== "object") return false;
  const a = obj as Record<string, unknown>;
  if (typeof a.type !== "string" || !isKnownActionType(a.type)) return false;
  if (typeof a.label !== "string" || a.label.length === 0) return false;
  if (a.type !== "no_action" && typeof a.risk !== "string") return false;
  return true;
}

export function getActionRisk(action: Action): ActionRisk | undefined {
  if (action.type === "no_action") return undefined;
  return (action as { risk: ActionRisk }).risk;
}
