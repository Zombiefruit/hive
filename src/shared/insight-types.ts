/**
 * Proactive insights types — feature ideas, customer pain points, trends
 * surfaced from Slack channels, Gong calls, and other sources.
 */

export type InsightType = "feature_idea" | "customer_pain" | "trend" | "proactive_task" | "optimization";
export type InsightStatus = "new" | "acknowledged" | "converted" | "dismissed";
export type ImpactEstimate = "high" | "medium" | "low";

export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  sources: Array<{ type: string; label: string; url?: string }>;
  relevanceScore: number;    // 0-1
  impactEstimate: ImpactEstimate;
  frequency: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: InsightStatus;
  convertedToTaskId?: string;
}

export interface InsightSource {
  channelId: string;
  channelName: string;
  usefulness: number;  // 0-1, learned over time
  lastScannedAt?: string;
}
