/**
 * Agent-as-Judge verdict types — structured output from judge agents
 * that verify triage, plans, and work output.
 */

export type VerdictStatus = "approved" | "concerns" | "rejected";

export interface JudgeConcern {
  severity: "blocker" | "warning" | "suggestion";
  category: string;
  description: string;
  suggestion?: string;
}

export interface BaseVerdict {
  status: VerdictStatus;
  confidence: number;       // 1-10
  summary: string;
  concerns: JudgeConcern[];
  judgedAt: string;         // ISO timestamp
  durationMs: number;
}

export interface TriageVerdict extends BaseVerdict {
  type: "triage";
  missedItems: Array<{ source: string; title: string; reason: string }>;
  priorityCorrections: Array<{ title: string; was: string; shouldBe: string; reason: string }>;
  classificationCorrections: Array<{ title: string; was: string; shouldBe: string; reason: string }>;
}

export interface PlanVerdict extends BaseVerdict {
  type: "plan";
  feasibilityScore: number;   // 1-10
  completenessScore: number;  // 1-10
  risks: string[];
  missingSteps: string[];
}

export interface WorkVerdict extends BaseVerdict {
  type: "work";
  planAdherence: number;      // 1-10
  completionScore: number;    // 1-10
  codeQualityConcerns: string[];
  unfinishedSteps: string[];
}

export type Verdict = TriageVerdict | PlanVerdict | WorkVerdict;
