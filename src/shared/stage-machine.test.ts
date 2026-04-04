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
    it("blocks backward moves", () => {
      expect(canDropTo("hack", "start_work", "implementation")).toBe(false);
      expect(canDropTo("ship", "hack", "implementation")).toBe(false);
    });
    it("always allows done/backlog/skipped", () => {
      expect(canDropTo("hack", "done", "implementation")).toBe(true);
      expect(canDropTo("hack", "backlog", "implementation")).toBe(true);
      expect(canDropTo("new", "skipped", "implementation")).toBe(true);
    });
    it("blocks same stage", () => {
      expect(canDropTo("hack", "hack", "implementation")).toBe(false);
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
    it("hack returns null (in progress)", () => {
      expect(getStageCTA("hack", "implementation")).toBeNull();
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
    it("implementation is not human", () => expect(isHumanTask("implementation")).toBe(false));
  });
});
