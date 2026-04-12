export interface PipelineStage {
  id: string;
  label: string;
  model: "haiku" | "sonnet" | "opus" | "none";
  description: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { id: "fetch", label: "Fetch", model: "haiku", description: "MCP tools fetch Slack, Linear, Calendar" },
  { id: "triage", label: "Triage", model: "sonnet", description: "Classify, prioritize, create tasks" },
  { id: "judge", label: "Judge", model: "haiku", description: "Verify triage quality" },
  { id: "plan", label: "Plan", model: "opus", description: "Multi-source context + implementation plan" },
  { id: "hack", label: "Hack", model: "sonnet", description: "Execute plan in worktree" },
  { id: "ship", label: "Ship", model: "sonnet", description: "Tests, push, open PR" },
  { id: "review", label: "Review", model: "sonnet", description: "Analyze PR, suggest changes" },
];

export const MODEL_COLORS: Record<string, string> = {
  haiku: "var(--aegen-success)",
  sonnet: "var(--aegen-cosmic-blue)",
  opus: "var(--aegen-stellar-purple)",
  none: "var(--aegen-dim-gray)",
};
