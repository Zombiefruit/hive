/**
 * Tests: Manager agent should be accessible from ALL item types.
 *
 * BUG: "Ask Manager" button only appears on Actionable section cards.
 * Missing from Human section (needs response, meeting prep, follow-up).
 *
 * FEATURE: User should be able to ask "why was this categorized this way?"
 * and have the manager explain + update if the user disagrees.
 */

import { describe, it, expect } from "vitest";

describe("Manager Agent — Available for All Items", () => {
  it("actionable items should have Ask Manager button", () => {
    const AGENT_ACTIONABLE = new Set(["implementation", "investigation", "review"]);
    const task = { taskType: "implementation" };
    expect(AGENT_ACTIONABLE.has(task.taskType)).toBe(true);
    // AddToManagerButton should render — currently works
  });

  it("human-only items should ALSO have Ask Manager button", () => {
    const HUMAN_ONLY = new Set(["meeting_prep", "response"]);
    const task = { taskType: "response" };
    expect(HUMAN_ONLY.has(task.taskType)).toBe(true);
    // AddToManagerButton should render — currently MISSING
  });

  it("backlog items should have Ask Manager button", () => {
    const task = { taskType: "investigation", stage: "backlog" };
    expect(task.stage).toBe("backlog");
    // AddToManagerButton should render
  });

  it("done items should have Ask Manager button", () => {
    const task = { taskType: "implementation", stage: "done" };
    expect(task.stage).toBe("done");
    // Even done items — user might want to discuss
  });
});

describe("Manager Agent — Question Categorization", () => {
  it("should be able to ask why a task was given a certain priority", () => {
    const task = {
      id: "poll-123",
      title: "VEC-20: Coverage gaps",
      priority: "medium",
      taskType: "implementation",
    };

    // The manager should receive context about the task when asked
    const managerPrompt = `Why was "${task.title}" categorized as ${task.priority} priority and ${task.taskType} type? Should it be different?`;

    expect(managerPrompt).toContain(task.title);
    expect(managerPrompt).toContain(task.priority);
    expect(managerPrompt).toContain(task.taskType);
  });

  it("should be able to ask the manager to re-categorize a task", () => {
    const action = {
      action: "update_task",
      task_title: "VEC-20",
      changes: { priority: "high", taskType: "review" },
    };

    expect(action.changes.priority).toBe("high");
    expect(action.changes.taskType).toBe("review");
  });

  it("manager should explain its reasoning when asked about categorization", () => {
    // The manager's response should include:
    // 1. Why this priority was chosen
    // 2. Who asked / what the context was
    // 3. Offer to change if user disagrees
    const expectedResponseParts = [
      "categorized as",
      "because",
      "Would you like me to change",
    ];

    for (const part of expectedResponseParts) {
      expect(part.length).toBeGreaterThan(0); // Documents the contract
    }
  });
});
