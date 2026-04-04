import { describe, it, expect } from "vitest";
import type { Action } from "../../shared/action-types";
import { getActionIcon, getConfirmMessage } from "./NextStepsCard";

describe("getActionIcon", () => {
  it("should return icon names for each action type", () => {
    expect(getActionIcon("run_skill")).toBe("rocket");
    expect(getActionIcon("update_linear")).toBe("linear");
    expect(getActionIcon("open_url")).toBe("external-link");
    expect(getActionIcon("send_slack")).toBe("slack");
    expect(getActionIcon("send_email")).toBe("mail");
    expect(getActionIcon("join_meeting")).toBe("calendar");
    expect(getActionIcon("review_pr")).toBe("git-pull-request");
    expect(getActionIcon("dismiss")).toBe("check");
    expect(getActionIcon("snooze")).toBe("clock");
    expect(getActionIcon("no_action")).toBe("info-circle");
  });
});

describe("getConfirmMessage", () => {
  it("should generate confirm text for run_skill", () => {
    const action: Action = { type: "run_skill", skill: "/hack", label: "Implement Phase 1", risk: "medium", params: { phase: 1 } };
    expect(getConfirmMessage(action)).toContain("hacking");
  });

  it("should generate confirm text for update_linear", () => {
    const action: Action = { type: "update_linear", ticket: "VEC-50", field: "status", value: "In Review", label: "Move VEC-50", risk: "medium" };
    expect(getConfirmMessage(action)).toContain("VEC-50");
    expect(getConfirmMessage(action)).toContain("In Review");
  });

  it("should return empty string for low-risk actions", () => {
    const action: Action = { type: "open_url", url: "https://example.com", label: "Open", risk: "low" };
    expect(getConfirmMessage(action)).toBe("");
  });

  it("should return empty string for no_action", () => {
    const action: Action = { type: "no_action", label: "Done" };
    expect(getConfirmMessage(action)).toBe("");
  });
});
