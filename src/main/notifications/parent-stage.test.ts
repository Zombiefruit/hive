/**
 * Tests for parent task stage computation from subtask stages.
 */
import { describe, it, expect } from "vitest";
import { computeParentStage } from "../../shared/task-utils";

describe("Parent Stage Computation", () => {
  it("should return 'done' when all subtasks are done", () => {
    const subtasks = [
      { stage: "done" },
      { stage: "done" },
      { stage: "done" },
    ];
    expect(computeParentStage(subtasks.map(s => s.stage))).toBe("done");
  });

  it("should return the highest active stage", () => {
    const stages = ["new", "hack", "done"];
    expect(computeParentStage(stages)).toBe("hack");
  });

  it("should return 'new' for all new subtasks", () => {
    expect(computeParentStage(["new", "new"])).toBe("new");
  });

  it("should return 'ship' when one is shipping and others are done", () => {
    expect(computeParentStage(["ship", "done", "done"])).toBe("ship");
  });

  it("should handle single subtask", () => {
    expect(computeParentStage(["hack"])).toBe("hack");
  });

  it("should handle empty subtasks as 'new'", () => {
    expect(computeParentStage([])).toBe("new");
  });

  it("should return start_work when one is planning and one is new", () => {
    expect(computeParentStage(["start_work", "new"])).toBe("start_work");
  });
});
