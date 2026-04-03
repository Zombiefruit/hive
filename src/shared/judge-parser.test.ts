import { describe, it, expect } from "vitest";
import { parseTriageVerdict, parsePlanVerdict, parseWorkVerdict } from "./judge-parser";

// ── Triage Verdict ──

const VALID_TRIAGE_VERDICT = `\`\`\`json
{
  "type": "triage",
  "status": "concerns",
  "confidence": 8,
  "summary": "Triage mostly correct, 1 missed item",
  "concerns": [
    {"severity": "warning", "category": "missed_item", "description": "DM from Sarah about deploy was not triaged", "suggestion": "Add as response type, high priority"}
  ],
  "missedItems": [
    {"source": "slack", "title": "Sarah DM about deploy", "reason": "Direct message was skipped but contains action request"}
  ],
  "priorityCorrections": [
    {"title": "VEC-50 review", "was": "medium", "shouldBe": "high", "reason": "Manager requested this directly"}
  ],
  "classificationCorrections": []
}
\`\`\``;

const VALID_TRIAGE_APPROVED = `{
  "type": "triage",
  "status": "approved",
  "confidence": 9,
  "summary": "All items correctly triaged",
  "concerns": [],
  "missedItems": [],
  "priorityCorrections": [],
  "classificationCorrections": []
}`;

describe("parseTriageVerdict", () => {
  it("parses a valid triage verdict with concerns", () => {
    const verdict = parseTriageVerdict(VALID_TRIAGE_VERDICT);
    expect(verdict).not.toBeNull();
    expect(verdict!.type).toBe("triage");
    expect(verdict!.status).toBe("concerns");
    expect(verdict!.confidence).toBe(8);
    expect(verdict!.missedItems).toHaveLength(1);
    expect(verdict!.missedItems[0].source).toBe("slack");
    expect(verdict!.priorityCorrections).toHaveLength(1);
    expect(verdict!.concerns).toHaveLength(1);
    expect(verdict!.concerns[0].severity).toBe("warning");
  });

  it("parses an approved verdict without markdown fences", () => {
    const verdict = parseTriageVerdict(VALID_TRIAGE_APPROVED);
    expect(verdict).not.toBeNull();
    expect(verdict!.status).toBe("approved");
    expect(verdict!.confidence).toBe(9);
    expect(verdict!.missedItems).toHaveLength(0);
  });

  it("returns null for empty input", () => {
    expect(parseTriageVerdict("")).toBeNull();
    expect(parseTriageVerdict("  ")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseTriageVerdict("not json at all")).toBeNull();
    expect(parseTriageVerdict("{broken")).toBeNull();
  });

  it("defaults missing arrays to empty", () => {
    const minimal = `{"type":"triage","status":"approved","confidence":7,"summary":"ok"}`;
    const verdict = parseTriageVerdict(minimal);
    expect(verdict).not.toBeNull();
    expect(verdict!.missedItems).toEqual([]);
    expect(verdict!.priorityCorrections).toEqual([]);
    expect(verdict!.classificationCorrections).toEqual([]);
    expect(verdict!.concerns).toEqual([]);
  });

  it("clamps confidence to 1-10 range", () => {
    const over = `{"type":"triage","status":"approved","confidence":15,"summary":"ok"}`;
    expect(parseTriageVerdict(over)!.confidence).toBe(10);
    const under = `{"type":"triage","status":"approved","confidence":-3,"summary":"ok"}`;
    expect(parseTriageVerdict(under)!.confidence).toBe(1);
  });

  it("normalizes invalid status to concerns", () => {
    const bad = `{"type":"triage","status":"maybe","confidence":5,"summary":"ok"}`;
    expect(parseTriageVerdict(bad)!.status).toBe("concerns");
  });
});

// ── Plan Verdict ──

const VALID_PLAN_VERDICT = `Some preamble text
\`\`\`json
{
  "type": "plan",
  "status": "rejected",
  "confidence": 6,
  "summary": "Plan is incomplete — missing error handling",
  "concerns": [
    {"severity": "blocker", "category": "incomplete_plan", "description": "No error handling for API failures"}
  ],
  "feasibilityScore": 7,
  "completenessScore": 4,
  "risks": ["API rate limiting not addressed"],
  "missingSteps": ["Add retry logic", "Handle auth expiry"]
}
\`\`\``;

describe("parsePlanVerdict", () => {
  it("parses a valid plan verdict with preamble text", () => {
    const verdict = parsePlanVerdict(VALID_PLAN_VERDICT);
    expect(verdict).not.toBeNull();
    expect(verdict!.type).toBe("plan");
    expect(verdict!.status).toBe("rejected");
    expect(verdict!.feasibilityScore).toBe(7);
    expect(verdict!.completenessScore).toBe(4);
    expect(verdict!.risks).toHaveLength(1);
    expect(verdict!.missingSteps).toHaveLength(2);
  });

  it("defaults missing scores to 5", () => {
    const minimal = `{"type":"plan","status":"approved","confidence":8,"summary":"ok"}`;
    const verdict = parsePlanVerdict(minimal);
    expect(verdict!.feasibilityScore).toBe(5);
    expect(verdict!.completenessScore).toBe(5);
    expect(verdict!.risks).toEqual([]);
    expect(verdict!.missingSteps).toEqual([]);
  });

  it("clamps scores to 1-10", () => {
    const bad = `{"type":"plan","status":"approved","confidence":8,"summary":"ok","feasibilityScore":0,"completenessScore":12}`;
    const verdict = parsePlanVerdict(bad);
    expect(verdict!.feasibilityScore).toBe(1);
    expect(verdict!.completenessScore).toBe(10);
  });

  it("returns null for non-JSON", () => {
    expect(parsePlanVerdict("just plain text")).toBeNull();
  });
});

// ── Work Verdict ──

const VALID_WORK_VERDICT = `{
  "type": "work",
  "status": "approved",
  "confidence": 9,
  "summary": "Work completed successfully, follows plan",
  "concerns": [
    {"severity": "suggestion", "category": "code_style", "description": "Could use early returns in handler"}
  ],
  "planAdherence": 9,
  "completionScore": 10,
  "codeQualityConcerns": ["Nested ternary in line 42"],
  "unfinishedSteps": []
}`;

describe("parseWorkVerdict", () => {
  it("parses a valid work verdict", () => {
    const verdict = parseWorkVerdict(VALID_WORK_VERDICT);
    expect(verdict).not.toBeNull();
    expect(verdict!.type).toBe("work");
    expect(verdict!.status).toBe("approved");
    expect(verdict!.planAdherence).toBe(9);
    expect(verdict!.completionScore).toBe(10);
    expect(verdict!.codeQualityConcerns).toHaveLength(1);
    expect(verdict!.unfinishedSteps).toHaveLength(0);
  });

  it("defaults missing scores and arrays", () => {
    const minimal = `{"type":"work","status":"rejected","confidence":3,"summary":"Incomplete"}`;
    const verdict = parseWorkVerdict(minimal);
    expect(verdict!.planAdherence).toBe(5);
    expect(verdict!.completionScore).toBe(5);
    expect(verdict!.codeQualityConcerns).toEqual([]);
    expect(verdict!.unfinishedSteps).toEqual([]);
  });

  it("handles JSON embedded in markdown", () => {
    const wrapped = `Here is my review:\n\n\`\`\`json\n${VALID_WORK_VERDICT}\n\`\`\`\n\nHope this helps!`;
    const verdict = parseWorkVerdict(wrapped);
    expect(verdict).not.toBeNull();
    expect(verdict!.status).toBe("approved");
  });
});
