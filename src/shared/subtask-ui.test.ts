/**
 * Tests for subtask UI logic — parent stage computation and kanban filtering.
 */
import { describe, it, expect } from "vitest";
import { computeParentStage } from "./task-utils";

describe("computeParentStage (UI integration)", () => {
  it("returns 'done' when all children are done", () => {
    expect(computeParentStage(["done", "done", "done"])).toBe("done");
  });

  it("returns highest active stage when mixed", () => {
    expect(computeParentStage(["new", "hack", "done"])).toBe("hack");
  });

  it("returns 'new' when all children are new", () => {
    expect(computeParentStage(["new", "new"])).toBe("new");
  });

  it("ignores skipped children when computing stage", () => {
    expect(computeParentStage(["skipped", "hack", "done"])).toBe("hack");
  });

  it("returns 'new' when remaining children are done+skipped (skipped blocks all-done)", () => {
    // computeParentStage only returns "done" when every child is literally "done".
    // If some are "skipped", the every() check fails and the loop finds no active stage => "new".
    expect(computeParentStage(["done", "done", "skipped"])).toBe("new");
  });
});

describe("subtask kanban filtering", () => {
  // These are pure logic tests that validate the filtering predicate
  // used in the notifications page to hide subtasks from top-level columns.

  it("items with parentTaskId should be excluded from top-level kanban", () => {
    const items = [
      { id: "parent-1", title: "Parent", stage: "hack", subtaskIds: ["child-1", "child-2"] },
      { id: "child-1", title: "Child 1", stage: "hack", parentTaskId: "parent-1" },
      { id: "child-2", title: "Child 2", stage: "new", parentTaskId: "parent-1" },
      { id: "standalone", title: "Regular task", stage: "hack" },
    ];

    // The filtering predicate used in notifications.tsx
    const topLevel = items.filter(n => !(n as { parentTaskId?: string }).parentTaskId);
    expect(topLevel).toHaveLength(2);
    expect(topLevel.map(n => n.id)).toEqual(["parent-1", "standalone"]);
  });

  it("parent items remain visible in top-level kanban", () => {
    const items = [
      { id: "parent-1", title: "Parent", stage: "hack", subtaskIds: ["child-1"] },
      { id: "child-1", title: "Child 1", stage: "hack", parentTaskId: "parent-1" },
    ];

    const topLevel = items.filter(n => !(n as { parentTaskId?: string }).parentTaskId);
    expect(topLevel).toHaveLength(1);
    expect(topLevel[0].id).toBe("parent-1");
  });

  it("items without parentTaskId or subtaskIds pass through unchanged", () => {
    const items = [
      { id: "a", title: "A", stage: "new" },
      { id: "b", title: "B", stage: "hack" },
    ];

    const topLevel = items.filter(n => !(n as { parentTaskId?: string }).parentTaskId);
    expect(topLevel).toHaveLength(2);
  });
});
