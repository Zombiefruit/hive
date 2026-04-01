import { describe, it, expect, beforeEach } from "vitest";
import {
  createProject,
  addTaskToProject,
  removeTaskFromProject,
  getProject,
  getAllProjects,
  updateProjectContext,
  detectProjectFromSource,
  findProjectByName,
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

describe("findProjectByName — fuzzy matching (#duplicate-consolidation)", () => {
  beforeEach(() => _resetForTest());

  it("should match 'Performance Agent Chat' to existing 'Performance Agent'", () => {
    createProject("Performance Agent", "linear");
    const found = findProjectByName("Performance Agent Chat");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Performance Agent");
  });

  it("should match 'VEC Dashboard Improvements' to existing 'VEC Dashboard'", () => {
    createProject("VEC Dashboard", "linear");
    const found = findProjectByName("VEC Dashboard Improvements");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("VEC Dashboard");
  });

  it("should return best match: 'Performance Agent' over 'Agent' for query 'Performance Agent Chat'", () => {
    createProject("Agent", "ai");
    createProject("Performance Agent", "linear");
    const found = findProjectByName("Performance Agent Chat");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Performance Agent");
  });

  it("should use exact word matching, not substring matching in word overlap", () => {
    // "testing" should NOT match "test" via substring — they are different words
    createProject("Test Dashboard", "ai");
    const found = findProjectByName("Testing Dashboard Phase");
    // After normalization: "testing dashboard phase" vs "test dashboard"
    // Neither contains the other, and word overlap is only 1 ("dashboard") — not 2
    // With the old substring logic, "testing".includes("test") would inflate overlap to 2
    // With exact word matching, this correctly returns null (no sufficient match)
    expect(found).toBeNull();
  });

  it("should not conflate substring words in overlap scoring", () => {
    // Given two projects, substring matching could pick the wrong one
    createProject("API Testing Framework", "ai");
    createProject("API Test Runner", "ai");
    // Search for "API Test" — should match "API Test Runner" (exact words) over "API Testing Framework" (substring)
    const found = findProjectByName("API Test");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("API Test Runner");
  });

  it("should strip extended noise words during normalization", () => {
    createProject("Dashboard", "ai");
    // "Dashboard Epic Phase 2 Work" normalizes to "dashboard" after stripping
    const found = findProjectByName("Dashboard Epic Phase 2 Work");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Dashboard");
  });

  it("should return null when no project matches", () => {
    createProject("Performance Agent", "linear");
    const found = findProjectByName("Totally Unrelated Thing");
    expect(found).toBeNull();
  });

  it("should prefer exact normalized match over contains match", () => {
    createProject("VEC Dashboard Overview", "ai");
    createProject("VEC Dashboard", "linear");
    const found = findProjectByName("VEC Dashboard");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("VEC Dashboard");
  });
});
