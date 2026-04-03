import { describe, it, expect } from "vitest";
import { shouldAutoExpand, getInputPlaceholder, deriveActions, getEmptyStateMessage } from "./AgentTab";
import type { Action } from "../../shared/action-types";

describe("shouldAutoExpand", () => {
  it("should expand activity log when loading", () => {
    expect(shouldAutoExpand(true, 5)).toBe(true);
  });

  it("should not expand when not loading and has events", () => {
    expect(shouldAutoExpand(false, 5)).toBe(false);
  });

  it("should not expand when no events", () => {
    expect(shouldAutoExpand(false, 0)).toBe(false);
  });
});

describe("getInputPlaceholder", () => {
  it("should show disabled message when no agent and no conversation", () => {
    expect(getInputPlaceholder(false, false)).toBe("Start work to begin a conversation...");
  });

  it("should show active prompt when skill running", () => {
    expect(getInputPlaceholder(true, true)).toBe("Reply to agent...");
  });

  it("should show feedback prompt when conversation exists", () => {
    expect(getInputPlaceholder(false, true)).toBe("Push back, ask questions, or refine the plan...");
  });
});

describe("deriveActions", () => {
  const noAction: Action = { type: "no_action", label: "Already responded" };
  const runSkill: Action = { type: "run_skill", skill: "/hack", label: "Hack", risk: "medium" };

  it("should add Mark Done when all actions are no_action and stage is not done", () => {
    const actions = deriveActions([noAction], "ready");
    expect(actions).toHaveLength(2);
    expect(actions[1].type).toBe("dismiss");
    expect(actions[1].label).toBe("Mark Done");
  });

  it("should NOT add Mark Done when stage is done", () => {
    const actions = deriveActions([noAction], "done");
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("no_action");
  });

  it("should NOT add Mark Done when stage is backlog", () => {
    const actions = deriveActions([noAction], "backlog");
    expect(actions).toHaveLength(1);
  });

  it("should NOT add Mark Done when there are real actions", () => {
    const actions = deriveActions([noAction, runSkill], "ready");
    expect(actions).toHaveLength(2);
    expect(actions.find(a => a.type === "dismiss")).toBeUndefined();
  });

  it("should return empty array for no actions", () => {
    expect(deriveActions([], "new")).toEqual([]);
  });

  it("should pass through non-no_action actions unchanged", () => {
    const actions = deriveActions([runSkill], "start_work");
    expect(actions).toHaveLength(1);
    expect(actions[0]).toBe(runSkill);
  });
});

describe("getEmptyStateMessage", () => {
  it("returns 'Move to Planning' for new stage", () => {
    expect(getEmptyStateMessage("new")).toContain("Move to Planning");
  });

  it("returns 'Move to Planning' for skipped stage", () => {
    expect(getEmptyStateMessage("skipped")).toContain("Move to Planning");
  });

  it("returns null for start_work (should show loader, not static text)", () => {
    expect(getEmptyStateMessage("start_work")).toBeNull();
  });

  it("returns null for preparing (should show loader, not static text)", () => {
    expect(getEmptyStateMessage("preparing")).toBeNull();
  });

  it("returns null for plan_review (plan exists, agent tab shows conversation)", () => {
    expect(getEmptyStateMessage("plan_review")).toBeNull();
  });

  it("returns null for hack (work agent should be running)", () => {
    expect(getEmptyStateMessage("hack")).toBeNull();
  });

  it("returns generic message for unknown/done stages with no conversation", () => {
    const msg = getEmptyStateMessage("done");
    expect(msg).toBeTruthy();
    expect(msg).toContain("No conversation");
  });

  it("returns generic message for undefined stage", () => {
    expect(getEmptyStateMessage(undefined)).toContain("No conversation");
  });
});
