/**
 * Routes task types to the correct detail view component.
 */

export type DetailViewType = "implementation" | "review" | "response" | "meeting_prep";

const TASK_TYPE_MAP: Record<string, DetailViewType> = {
  implementation: "implementation",
  investigation: "implementation",
  review: "review",
  response: "response",
  meeting_prep: "meeting_prep",
  follow_up: "response", // merged into response
};

export function getDetailViewType(taskType: string | undefined): DetailViewType {
  return TASK_TYPE_MAP[taskType ?? ""] ?? "implementation";
}
