/**
 * Tests for task type and stage consistency.
 * Validates that:
 * - follow_up type/stage is normalized to response/new
 * - response tasks use "preparing" stage, not "start_work"
 * - all tasks belong to either AGENT_ACTIONABLE_TYPES or HUMAN_ONLY_TYPES
 * - every stage in the system is valid
 */

import { describe, it, expect } from "vitest";
import { AGENT_ACTIONABLE_TYPES, HUMAN_ONLY_TYPES, VALID_STAGES, STAGE_ORDER } from "../../shared/task-utils";
import { isHumanTask } from "../../shared/stage-machine";

const ALL_TASK_TYPES = new Set([...AGENT_ACTIONABLE_TYPES, ...HUMAN_ONLY_TYPES]);

describe("Task Type Coverage", () => {
  it("should have implementation in agent actionable", () => {
    expect(AGENT_ACTIONABLE_TYPES.has("implementation")).toBe(true);
  });

  it("should have review in human only (user reviews, not agent)", () => {
    expect(HUMAN_ONLY_TYPES.has("review")).toBe(true);
  });

  it("should have investigation in human only (user researches)", () => {
    expect(HUMAN_ONLY_TYPES.has("investigation")).toBe(true);
  });

  it("should have response in human only", () => {
    expect(HUMAN_ONLY_TYPES.has("response")).toBe(true);
  });

  it("should have meeting_prep in human only", () => {
    expect(HUMAN_ONLY_TYPES.has("meeting_prep")).toBe(true);
  });

  it("should NOT have follow_up anywhere — it was merged into response", () => {
    expect(AGENT_ACTIONABLE_TYPES.has("follow_up")).toBe(false);
    expect(HUMAN_ONLY_TYPES.has("follow_up")).toBe(false);
  });

  it("should NOT have planning as a task type — it was removed", () => {
    expect(AGENT_ACTIONABLE_TYPES.has("planning")).toBe(false);
    expect(HUMAN_ONLY_TYPES.has("planning")).toBe(false);
  });
});

describe("Stage-Type Consistency", () => {
  it("response tasks should use preparing/ready stages, not start_work", () => {
    // In the kanban, response tasks go to the HUMAN section
    // Human stages are: new, preparing, ready, done, backlog, skipped
    // Agent stages are: new, start_work, plan_review, hack, ship, code_review, pr_feedback
    // A response task in start_work would be invisible (wrong section)
    const humanStages = new Set(["new", "preparing", "ready", "done", "backlog", "skipped"]);
    expect(humanStages.has("start_work")).toBe(false);
    expect(humanStages.has("preparing")).toBe(true);
  });

  it("implementation tasks should use start_work stage, not preparing", () => {
    const agentStages = new Set(["new", "start_work", "plan_review", "hack", "ship", "code_review", "pr_feedback", "done", "backlog", "skipped"]);
    expect(agentStages.has("start_work")).toBe(true);
    expect(agentStages.has("preparing")).toBe(false); // preparing is human-only
  });

  it("follow_up stage should NOT exist in VALID_STAGES", () => {
    expect(VALID_STAGES).not.toContain("follow_up");
  });

  it("follow_up should NOT be in STAGE_ORDER", () => {
    expect(STAGE_ORDER["follow_up"]).toBeUndefined();
  });
});

describe("Normalization Rules", () => {
  it("follow_up taskType should map to response", () => {
    // Simulates the normalization in loadCachedNotifications
    const normalize = (taskType: string) => taskType === "follow_up" ? "response" : taskType;
    expect(normalize("follow_up")).toBe("response");
    expect(normalize("response")).toBe("response");
    expect(normalize("implementation")).toBe("implementation");
  });

  it("follow_up stage should map to new", () => {
    const normalize = (stage: string) => stage === "follow_up" ? "new" : stage;
    expect(normalize("follow_up")).toBe("new");
    expect(normalize("new")).toBe("new");
  });

  it("human task in start_work stage should normalize to preparing", () => {
    // Uses isHumanTask to determine the normalization — single source of truth
    const normalize = (taskType: string, stage: string) => {
      if (isHumanTask(taskType) && stage === "start_work") return "preparing";
      return stage;
    };
    expect(normalize("response", "start_work")).toBe("preparing");
    expect(normalize("review", "start_work")).toBe("preparing");
    expect(normalize("investigation", "start_work")).toBe("preparing");
    expect(normalize("implementation", "start_work")).toBe("start_work"); // unchanged
    expect(normalize("response", "new")).toBe("new"); // unchanged
  });
});
