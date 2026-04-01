import { describe, it, expect, beforeEach } from "vitest";
import {
  createProject,
  addTaskToProject,
  removeTaskFromProject,
  getProject,
  getAllProjects,
  updateProjectContext,
  detectProjectFromSource,
  setProjectReasoning,
  getProjectReasoning,
  _resetForTest,
} from "./project-model";

describe("Project Model", () => {
  beforeEach(() => _resetForTest());

  it("should create a project", () => {
    const proj = createProject("Performance Agent Chat", "linear", "proj-abc");
    expect(proj.id).toBeTruthy();
    expect(proj.name).toBe("Performance Agent Chat");
    expect(proj.source).toBe("linear");
    expect(proj.tasks).toHaveLength(0);
  });

  it("should add tasks to project", () => {
    const proj = createProject("Test Project", "ai");
    addTaskToProject(proj.id, "task-1");
    addTaskToProject(proj.id, "task-2");
    const updated = getProject(proj.id);
    expect(updated?.tasks).toHaveLength(2);
    expect(updated?.tasks).toContain("task-1");
  });

  it("should not duplicate tasks", () => {
    const proj = createProject("Test", "ai");
    addTaskToProject(proj.id, "task-1");
    addTaskToProject(proj.id, "task-1");
    expect(getProject(proj.id)?.tasks).toHaveLength(1);
  });

  it("should remove tasks from project", () => {
    const proj = createProject("Test", "ai");
    addTaskToProject(proj.id, "task-1");
    addTaskToProject(proj.id, "task-2");
    removeTaskFromProject(proj.id, "task-1");
    expect(getProject(proj.id)?.tasks).toHaveLength(1);
    expect(getProject(proj.id)?.tasks).toContain("task-2");
  });

  it("should update project context", () => {
    const proj = createProject("Test", "linear");
    updateProjectContext(proj.id, {
      linearTickets: ["VEC-24"],
      prs: ["https://github.com/repo/pull/1"],
    });
    const updated = getProject(proj.id);
    expect(updated?.context.linearTickets).toContain("VEC-24");
    expect(updated?.context.prs).toContain("https://github.com/repo/pull/1");
  });

  it("should detect project from Linear project ID", () => {
    createProject("Existing Project", "linear", "proj-abc");
    const found = detectProjectFromSource("linear", "proj-abc");
    expect(found?.name).toBe("Existing Project");
  });

  it("should detect project from Slack channel", () => {
    createProject("TSA Upsell", "slack", "C0ANYETEVDE");
    const found = detectProjectFromSource("slack", "C0ANYETEVDE");
    expect(found?.name).toBe("TSA Upsell");
  });

  it("should return null for unknown source", () => {
    const found = detectProjectFromSource("linear", "nonexistent");
    expect(found).toBeNull();
  });

  it("should list all projects", () => {
    createProject("Project A", "linear");
    createProject("Project B", "slack");
    expect(getAllProjects()).toHaveLength(2);
  });
});

describe("Project creation reasoning (#116)", () => {
  beforeEach(() => _resetForTest());

  it("should store reasoning when provided at creation", () => {
    const proj = createProject("Performance Agent", "ai", undefined, "Grouped 3 tasks sharing VEC-50 prefix");
    expect(proj.reasoning).toBe("Grouped 3 tasks sharing VEC-50 prefix");
  });

  it("should default reasoning to undefined when not provided", () => {
    const proj = createProject("Manual Project", "linear", "proj-123");
    expect(proj.reasoning).toBeUndefined();
  });

  it("should update reasoning after creation via setProjectReasoning", () => {
    const proj = createProject("Slack Project", "slack", "C0AMSV2SK4Z");
    setProjectReasoning(proj.id, "Matched #proj-perf channel pattern");
    const updated = getProject(proj.id);
    expect(updated?.reasoning).toBe("Matched #proj-perf channel pattern");
  });

  it("should return null for unknown project reasoning", () => {
    expect(getProjectReasoning("nonexistent")).toBeNull();
  });
});
