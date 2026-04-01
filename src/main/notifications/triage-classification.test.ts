/**
 * Tests for triage task type classification.
 * Validates that the triage rules skill correctly defines when each task_type should be used.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AGENT_ACTIONABLE_TYPES, HUMAN_ONLY_TYPES } from "../../shared/task-utils";
import { loadSkill } from "../../shared/skill-loader";

describe("Triage Classification — Skill Content", () => {
  const triageRules = loadSkill("triage-rules");
  const triageFormat = loadSkill("triage-output-format");

  it("should load triage-rules skill", () => {
    expect(triageRules.length).toBeGreaterThan(100);
  });

  it("should load triage-output-format skill", () => {
    expect(triageFormat.length).toBeGreaterThan(100);
  });

  it("should define response as a task type for unanswered messages", () => {
    expect(triageRules).toContain("response");
    expect(triageRules.toLowerCase()).toMatch(/response.*unanswered|response.*dm|response.*hasn.*replied/);
  });

  it("should define meeting_prep as a task type for upcoming events", () => {
    expect(triageRules).toContain("meeting_prep");
    expect(triageRules.toLowerCase()).toMatch(/meeting_prep.*calendar|meeting_prep.*upcoming/);
  });

  it("should warn against defaulting everything to implementation", () => {
    expect(triageRules.toLowerCase()).toMatch(/do not.*default.*implementation|do not.*classify.*everything.*implementation/);
  });

  it("should define review as a task type for PR reviews", () => {
    expect(triageRules).toContain("review");
    expect(triageRules.toLowerCase()).toMatch(/review.*pr|review.*code review/);
  });

  it("should include all valid task types", () => {
    for (const type of [...AGENT_ACTIONABLE_TYPES, ...HUMAN_ONLY_TYPES]) {
      expect(triageRules).toContain(type);
    }
  });
});

describe("Triage Classification — Type Sets", () => {
  it("should have response in HUMAN_ONLY_TYPES", () => {
    expect(HUMAN_ONLY_TYPES.has("response")).toBe(true);
  });

  it("should have meeting_prep in HUMAN_ONLY_TYPES", () => {
    expect(HUMAN_ONLY_TYPES.has("meeting_prep")).toBe(true);
  });

  it("should have implementation in AGENT_ACTIONABLE_TYPES", () => {
    expect(AGENT_ACTIONABLE_TYPES.has("implementation")).toBe(true);
  });

  it("should have review in AGENT_ACTIONABLE_TYPES", () => {
    expect(AGENT_ACTIONABLE_TYPES.has("review")).toBe(true);
  });

  it("should have investigation in AGENT_ACTIONABLE_TYPES", () => {
    expect(AGENT_ACTIONABLE_TYPES.has("investigation")).toBe(true);
  });

  it("should NOT have follow_up or planning as task types", () => {
    expect(AGENT_ACTIONABLE_TYPES.has("follow_up")).toBe(false);
    expect(AGENT_ACTIONABLE_TYPES.has("planning")).toBe(false);
    expect(HUMAN_ONLY_TYPES.has("follow_up")).toBe(false);
  });
});

describe("Triage Classification — Output Format Skill", () => {
  const triageFormat = loadSkill("triage-output-format");

  it("should define task_type field in actionable items", () => {
    expect(triageFormat).toContain("task_type");
  });

  it("should define projects array format", () => {
    expect(triageFormat).toContain("projects");
    expect(triageFormat).toContain("project_source");
  });

  it("should define subtasks format for multi-repo", () => {
    expect(triageFormat).toContain("parent_task");
    expect(triageFormat).toContain("subtasks");
    expect(triageFormat).toContain("repo_hint");
  });
});

describe("Triage Classification — Triage Linking Skill", () => {
  const linkingSkill = loadSkill("triage-linking");

  it("should load triage-linking skill", () => {
    expect(linkingSkill.length).toBeGreaterThan(50);
  });

  it("should warn about never inventing URLs", () => {
    expect(linkingSkill).toContain("NEVER INVENT");
  });

  it("should require cross-source linking", () => {
    expect(linkingSkill.toLowerCase()).toMatch(/cross.source|both.*url/);
  });

  it("should require DM permalinks", () => {
    expect(linkingSkill.toLowerCase()).toMatch(/dm.*permalink|dm.*link/);
  });
});
