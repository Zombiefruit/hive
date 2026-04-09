import { describe, it, expect } from "vitest";
import {
  canDropTo, getNextStage, getStageCTA, skillToStage,
  isTerminalStage, isHumanTask, getTrack, STAGE_ACTIONS,
} from "./stage-machine";

describe("stage-machine", () => {
  describe("getNextStage", () => {
    it("new → start_work for agent tasks", () => {
      expect(getNextStage("new", "implementation")).toBe("start_work");
    });
    it("new → preparing for human tasks", () => {
      expect(getNextStage("new", "response")).toBe("preparing");
    });
    it("plan_review → hack", () => {
      expect(getNextStage("plan_review", "implementation")).toBe("hack");
    });
    it("done returns null", () => {
      expect(getNextStage("done")).toBeNull();
    });
  });

  describe("canDropTo", () => {
    it("allows forward moves", () => {
      expect(canDropTo("new", "start_work", "implementation")).toBe(true);
      expect(canDropTo("plan_review", "hack", "implementation")).toBe(true);
    });
    it("blocks large backward jumps (except to new which is always allowed as reset)", () => {
      expect(canDropTo("ship", "new", "implementation")).toBe(true); // reset always allowed
      expect(canDropTo("code_review", "start_work", "implementation")).toBe(false);
      expect(canDropTo("done", "new", "implementation")).toBe(true); // reset always allowed
    });
    it("allows specific backward revisions", () => {
      expect(canDropTo("hack", "start_work", "implementation")).toBe(true);     // revise plan
      expect(canDropTo("code_review", "hack", "implementation")).toBe(true);    // rework code
      expect(canDropTo("pr_feedback", "hack", "implementation")).toBe(true);    // rework from feedback
    });
    it("always allows done/backlog/skipped", () => {
      expect(canDropTo("hack", "done", "implementation")).toBe(true);
      expect(canDropTo("hack", "backlog", "implementation")).toBe(true);
      expect(canDropTo("new", "skipped", "implementation")).toBe(true);
    });
    it("blocks same stage", () => {
      expect(canDropTo("hack", "hack", "implementation")).toBe(false);
    });

    // Regression tests for drag scenarios
    it("drag: new → start_work (forward one step)", () => {
      expect(canDropTo("new", "start_work", "implementation")).toBe(true);
    });
    it("drag: new → hack (skip stages — should block)", () => {
      expect(canDropTo("new", "hack", "implementation")).toBe(false);
    });
    it("drag: any stage → new (reset — always allowed)", () => {
      expect(canDropTo("start_work", "new", "implementation")).toBe(true);
      expect(canDropTo("hack", "new", "implementation")).toBe(true);
      expect(canDropTo("preparing", "new", "response")).toBe(true);
    });
    it("drag: hack → start_work (allowed backward for re-plan)", () => {
      expect(canDropTo("hack", "start_work", "implementation")).toBe(true);
    });
    it("drag: any → backlog (archive always allowed)", () => {
      expect(canDropTo("new", "backlog", "implementation")).toBe(true);
      expect(canDropTo("hack", "backlog", "implementation")).toBe(true);
      expect(canDropTo("plan_review", "backlog", "implementation")).toBe(true);
    });
    it("human task: new → preparing (forward)", () => {
      expect(canDropTo("new", "preparing", "response")).toBe(true);
    });
    it("human task: preparing → new (reset — always allowed)", () => {
      expect(canDropTo("preparing", "new", "response")).toBe(true);
    });
    it("new → preparing with undefined taskType uses agent track (preparing not found → blocks)", () => {
      expect(canDropTo("new", "preparing", undefined)).toBe(false);
      expect(canDropTo("new", "preparing", "response")).toBe(true);
      expect(canDropTo("new", "preparing", "meeting_prep")).toBe(true);
    });
    it("review/investigation tasks use human track (can drop to preparing)", () => {
      // review and investigation are human tasks — they use the HUMAN_TRACK
      expect(canDropTo("new", "preparing", "review")).toBe(true);
      expect(canDropTo("new", "preparing", "investigation")).toBe(true);
      // implementation is the only agent task — uses AGENT_TRACK, no "preparing"
      expect(canDropTo("new", "preparing", "implementation")).toBe(false);
      expect(canDropTo("new", "start_work", "implementation")).toBe(true);
    });
  });

  describe("getStageCTA", () => {
    it("new → Move to Planning", () => {
      const cta = getStageCTA("new", "implementation");
      expect(cta).toEqual({ label: "Move to Planning", targetStage: "start_work" });
    });
    it("new + response → Prepare", () => {
      const cta = getStageCTA("new", "response");
      expect(cta).toEqual({ label: "Prepare", targetStage: "preparing" });
    });
    it("plan_review → Approve & Start", () => {
      const cta = getStageCTA("plan_review", "implementation");
      expect(cta).toEqual({ label: "Approve & Start", targetStage: "hack" });
    });
    it("hack returns Ship CTA", () => {
      const cta = getStageCTA("hack", "implementation");
      expect(cta).not.toBeNull();
      expect(cta!.label).toBe("Ship");
    });
  });

  describe("skillToStage", () => {
    it("/hack → hack", () => expect(skillToStage("/hack")).toBe("hack"));
    it("/ship → ship", () => expect(skillToStage("/ship")).toBe("ship"));
    it("/code-review → code_review", () => expect(skillToStage("/code-review")).toBe("code_review"));
    it("unknown returns null", () => expect(skillToStage("/unknown")).toBeNull());
  });

  describe("isTerminalStage", () => {
    it("done is terminal", () => expect(isTerminalStage("done")).toBe(true));
    it("backlog is terminal", () => expect(isTerminalStage("backlog")).toBe(true));
    it("skipped is terminal", () => expect(isTerminalStage("skipped")).toBe(true));
    it("hack is not terminal", () => expect(isTerminalStage("hack")).toBe(false));
  });

  describe("isHumanTask", () => {
    it("response is human", () => expect(isHumanTask("response")).toBe(true));
    it("meeting_prep is human", () => expect(isHumanTask("meeting_prep")).toBe(true));
    it("review is human", () => expect(isHumanTask("review")).toBe(true));
    it("investigation is human", () => expect(isHumanTask("investigation")).toBe(true));
    it("implementation is not human", () => expect(isHumanTask("implementation")).toBe(false));
  });
});
