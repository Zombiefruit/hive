export type NotificationPriority = "critical" | "high" | "medium" | "low" | "backlog";
export type NotificationSource = "slack" | "linear" | "github" | "notion" | "email";
export type NotificationStatus = "new" | "in_progress" | "done" | "dismissed";

export interface Notification {
  id: string;
  source: NotificationSource;
  priority: NotificationPriority;
  status: NotificationStatus;
  title: string;
  summary: string;
  url?: string;
  resourceId?: string;
  agentId?: string; // If an agent is working on this
  createdAt: string;
  updatedAt: string;
}
