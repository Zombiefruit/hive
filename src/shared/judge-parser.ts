/**
 * Judge parser — extracts and validates verdict JSON from judge agent output.
 * Follows the same pattern as triage-parser.ts.
 */

import type { TriageVerdict, PlanVerdict, WorkVerdict, BusinessContextVerdict, VerdictStatus, JudgeConcern } from "./judge-types";

const VALID_STATUSES: VerdictStatus[] = ["approved", "concerns", "rejected"];

function stripCodeFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  return fenced ? fenced[1] : raw;
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;

  const start = raw.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") depth--;
    if (depth === 0) return raw.slice(start, i + 1);
  }
  return null;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeStatus(raw: unknown): VerdictStatus {
  if (typeof raw === "string" && VALID_STATUSES.includes(raw as VerdictStatus)) {
    return raw as VerdictStatus;
  }
  return "concerns";
}

function parseConcerns(raw: unknown): JudgeConcern[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is JudgeConcern =>
      typeof c === "object" && c !== null && typeof c.description === "string",
  );
}

function safeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string");
}

export function parseTriageVerdict(raw: string): TriageVerdict | null {
  if (!raw?.trim()) return null;
  try {
    const stripped = stripCodeFences(raw);
    const jsonStr = extractJsonObject(stripped);
    if (!jsonStr) return null;

    const p = JSON.parse(jsonStr);
    if (!p || typeof p !== "object") return null;

    return {
      type: "triage",
      status: normalizeStatus(p.status),
      confidence: clamp(p.confidence, 1, 10, 5),
      summary: String(p.summary ?? ""),
      concerns: parseConcerns(p.concerns),
      judgedAt: typeof p.judgedAt === "string" ? p.judgedAt : new Date().toISOString(),
      durationMs: typeof p.durationMs === "number" ? p.durationMs : 0,
      missedItems: Array.isArray(p.missedItems) ? p.missedItems : [],
      priorityCorrections: Array.isArray(p.priorityCorrections) ? p.priorityCorrections : [],
      classificationCorrections: Array.isArray(p.classificationCorrections) ? p.classificationCorrections : [],
    };
  } catch {
    return null;
  }
}

export function parsePlanVerdict(raw: string): PlanVerdict | null {
  if (!raw?.trim()) return null;
  try {
    const stripped = stripCodeFences(raw);
    const jsonStr = extractJsonObject(stripped);
    if (!jsonStr) return null;

    const p = JSON.parse(jsonStr);
    if (!p || typeof p !== "object") return null;

    return {
      type: "plan",
      status: normalizeStatus(p.status),
      confidence: clamp(p.confidence, 1, 10, 5),
      summary: String(p.summary ?? ""),
      concerns: parseConcerns(p.concerns),
      judgedAt: typeof p.judgedAt === "string" ? p.judgedAt : new Date().toISOString(),
      durationMs: typeof p.durationMs === "number" ? p.durationMs : 0,
      feasibilityScore: clamp(p.feasibilityScore, 1, 10, 5),
      completenessScore: clamp(p.completenessScore, 1, 10, 5),
      risks: safeStringArray(p.risks),
      missingSteps: safeStringArray(p.missingSteps),
    };
  } catch {
    return null;
  }
}

export function parseWorkVerdict(raw: string): WorkVerdict | null {
  if (!raw?.trim()) return null;
  try {
    const stripped = stripCodeFences(raw);
    const jsonStr = extractJsonObject(stripped);
    if (!jsonStr) return null;

    const p = JSON.parse(jsonStr);
    if (!p || typeof p !== "object") return null;

    return {
      type: "work",
      status: normalizeStatus(p.status),
      confidence: clamp(p.confidence, 1, 10, 5),
      summary: String(p.summary ?? ""),
      concerns: parseConcerns(p.concerns),
      judgedAt: typeof p.judgedAt === "string" ? p.judgedAt : new Date().toISOString(),
      durationMs: typeof p.durationMs === "number" ? p.durationMs : 0,
      planAdherence: clamp(p.planAdherence, 1, 10, 5),
      completionScore: clamp(p.completionScore, 1, 10, 5),
      codeQualityConcerns: safeStringArray(p.codeQualityConcerns),
      unfinishedSteps: safeStringArray(p.unfinishedSteps),
    };
  } catch {
    return null;
  }
}

export function parseBusinessContextVerdict(raw: string): BusinessContextVerdict | null {
  if (!raw?.trim()) return null;
  try {
    const stripped = stripCodeFences(raw);
    const jsonStr = extractJsonObject(stripped);
    if (!jsonStr) return null;

    const p = JSON.parse(jsonStr);
    if (!p || typeof p !== "object") return null;

    return {
      type: "business_context",
      status: normalizeStatus(p.status),
      confidence: clamp(p.confidence, 1, 10, 5),
      summary: String(p.summary ?? ""),
      concerns: parseConcerns(p.concerns),
      judgedAt: typeof p.judgedAt === "string" ? p.judgedAt : new Date().toISOString(),
      durationMs: typeof p.durationMs === "number" ? p.durationMs : 0,
      staleTeamMembers: Array.isArray(p.staleTeamMembers) ? p.staleTeamMembers : [],
      missingPeople: Array.isArray(p.missingPeople) ? p.missingPeople : [],
      staleReferences: Array.isArray(p.staleReferences) ? p.staleReferences : [],
      completenessScore: clamp(p.completenessScore, 1, 10, 5),
    };
  } catch {
    return null;
  }
}
