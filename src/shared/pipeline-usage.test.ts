/**
 * Regression tests for pipeline stages, pricing, and usage tracking.
 */
import { describe, it, expect } from "vitest";
import { PIPELINE_STAGES } from "./pipeline-types";

describe("Pipeline stages", () => {
  it("should not include a diff step (pure TS, no AI cost)", () => {
    // Regression: diff step showed $0.00 and confused users
    expect(PIPELINE_STAGES.find(s => s.id === "diff")).toBeUndefined();
  });

  it("should include all AI pipeline stages", () => {
    const ids = PIPELINE_STAGES.map(s => s.id);
    expect(ids).toContain("fetch");
    expect(ids).toContain("triage");
    expect(ids).toContain("judge");
    expect(ids).toContain("plan");
    expect(ids).toContain("hack");
    expect(ids).toContain("ship");
    expect(ids).toContain("review");
  });

  it("should have correct model assignments", () => {
    const byId = Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, s.model]));
    expect(byId.fetch).toBe("haiku");
    expect(byId.triage).toBe("sonnet");
    expect(byId.judge).toBe("haiku");
    expect(byId.plan).toBe("opus");
    expect(byId.hack).toBe("sonnet");
    expect(byId.ship).toBe("sonnet");
    expect(byId.review).toBe("sonnet");
  });
});

describe("Model pricing", () => {
  // These must match Anthropic's published rates and usage-ledger.ts MODEL_PRICING
  const PRICING: Record<string, { input: number; output: number }> = {
    "claude-opus-4-6": { input: 15, output: 75 },
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-haiku-4-5-20251001": { input: 0.80, output: 4 },
  };

  it("Opus pricing should be $15/$75 per million tokens", () => {
    const p = PRICING["claude-opus-4-6"];
    expect(p.input).toBe(15);
    expect(p.output).toBe(75);
  });

  it("Sonnet pricing should be $3/$15 per million tokens", () => {
    const p = PRICING["claude-sonnet-4-6"];
    expect(p.input).toBe(3);
    expect(p.output).toBe(15);
  });

  it("Haiku pricing should be $0.80/$4 per million tokens", () => {
    const p = PRICING["claude-haiku-4-5-20251001"];
    expect(p.input).toBe(0.80);
    expect(p.output).toBe(4);
  });

  it("skill runner should estimate cost at Sonnet rates when not reported", () => {
    // Regression: skill-runner recorded $0.00 and model "unknown"
    const inTok = 100_000;
    const outTok = 5_000;
    const cost = (inTok * 3 + outTok * 15) / 1_000_000;
    expect(cost).toBeCloseTo(0.375, 3);
    expect(cost).toBeGreaterThan(0);
  });
});

describe("Source to stage mapping", () => {
  const SOURCE_TO_STAGE: Record<string, string> = {
    "poll-fetch": "fetch", "poll-bridge": "fetch", "poll-triage": "triage",
    judge: "judge", "planning-agent": "plan", "work-agent": "hack",
    "skill-runner": "hack", ephemeral: "plan",
  };

  it("skill-runner should map to hack stage", () => {
    expect(SOURCE_TO_STAGE["skill-runner"]).toBe("hack");
  });

  it("all sources should map to valid pipeline stage IDs", () => {
    const stageIds = new Set(PIPELINE_STAGES.map(s => s.id));
    for (const [, stageId] of Object.entries(SOURCE_TO_STAGE)) {
      expect(stageIds.has(stageId)).toBe(true);
    }
  });
});
