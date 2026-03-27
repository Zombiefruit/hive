import { describe, it, expect } from "vitest";
import { VALID_STAGES, STAGE_ORDER, AGENT_ACTIONABLE_TYPES, HUMAN_ONLY_TYPES, isValidTransition } from "../../shared/task-utils";

describe("Stage System", () => {
  it("should define all 10 valid stages", () => {
    expect(VALID_STAGES).toContain("new");
    expect(VALID_STAGES).toContain("start_work");
    expect(VALID_STAGES).toContain("plan_review");
    expect(VALID_STAGES).toContain("hack");
    expect(VALID_STAGES).toContain("ship");
    expect(VALID_STAGES).toContain("code_review");
    expect(VALID_STAGES).toContain("pr_feedback");
    expect(VALID_STAGES).toContain("done");
    expect(VALID_STAGES).toContain("backlog");
    expect(VALID_STAGES).toContain("skipped");
    expect(VALID_STAGES).not.toContain("planning");
    expect(VALID_STAGES).not.toContain("prepared");
    expect(VALID_STAGES).not.toContain("working");
    expect(VALID_STAGES).not.toContain("follow_up");
  });

  it("should order stages correctly", () => {
    expect(STAGE_ORDER["new"]).toBeLessThan(STAGE_ORDER["start_work"]);
    expect(STAGE_ORDER["start_work"]).toBeLessThan(STAGE_ORDER["hack"]);
    expect(STAGE_ORDER["hack"]).toBeLessThan(STAGE_ORDER["ship"]);
    expect(STAGE_ORDER["ship"]).toBeLessThan(STAGE_ORDER["code_review"]);
    expect(STAGE_ORDER["code_review"]).toBeLessThan(STAGE_ORDER["done"]);
  });

  it("should include follow_up as a task type, not a stage", () => {
    expect(HUMAN_ONLY_TYPES.has("follow_up")).toBe(false);
    expect(HUMAN_ONLY_TYPES.has("response")).toBe(true);
    expect(HUMAN_ONLY_TYPES.has("meeting_prep")).toBe(true);
  });
});

describe("Stage Transitions", () => {
  it("should allow new → start_work", () => {
    expect(isValidTransition("new", "start_work")).toBe(true);
  });
  it("should allow start_work → hack", () => {
    expect(isValidTransition("start_work", "hack")).toBe(true);
  });
  it("should allow start_work → plan_review", () => {
    expect(isValidTransition("start_work", "plan_review")).toBe(true);
  });
  it("should allow plan_review → hack", () => {
    expect(isValidTransition("plan_review", "hack")).toBe(true);
  });
  it("should allow hack → ship", () => {
    expect(isValidTransition("hack", "ship")).toBe(true);
  });
  it("should allow ship → code_review", () => {
    expect(isValidTransition("ship", "code_review")).toBe(true);
  });
  it("should allow code_review → done", () => {
    expect(isValidTransition("code_review", "done")).toBe(true);
  });
  it("should allow code_review → pr_feedback", () => {
    expect(isValidTransition("code_review", "pr_feedback")).toBe(true);
  });
  it("should allow pr_feedback → done", () => {
    expect(isValidTransition("pr_feedback", "done")).toBe(true);
  });
  it("should reject new → hack (skipping start_work)", () => {
    expect(isValidTransition("new", "hack")).toBe(false);
  });
  it("should reject new → ship", () => {
    expect(isValidTransition("new", "ship")).toBe(false);
  });
  it("should always allow transition to backlog", () => {
    expect(isValidTransition("new", "backlog")).toBe(true);
    expect(isValidTransition("start_work", "backlog")).toBe(true);
    expect(isValidTransition("hack", "backlog")).toBe(true);
  });
  it("should always allow transition to done", () => {
    expect(isValidTransition("new", "done")).toBe(true);
    expect(isValidTransition("hack", "done")).toBe(true);
  });
});
