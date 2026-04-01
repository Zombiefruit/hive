import { describe, it, expect } from "vitest";
import { parseTriageResponse } from "../../shared/triage-parser";

describe("Triage Output — Projects", () => {
  it("should parse projects array from triage response", () => {
    const response = JSON.stringify({
      actionable: [
        { source: "linear", title: "VEC-24: Chat history", project: "Perf Agent Chat", project_source: "linear", project_source_id: "proj-abc", priority: "high", confidence: 8, task_type: "implementation", summary: "test", links: [], author: "Jane", action_needed: "implement" },
      ],
      projects: [
        { name: "Perf Agent Chat", source: "linear", source_id: "proj-abc", related_channels: ["C0ANYETEVDE"], related_tickets: ["VEC-24", "VEC-23"] },
      ],
      updates: [],
      follow_up: [],
      skipped: [],
    });
    const result = parseTriageResponse(response);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].name).toBe("Perf Agent Chat");
    expect(result.actionable[0].project).toBe("Perf Agent Chat");
  });

  it("should handle response without projects array", () => {
    const response = JSON.stringify({
      actionable: [
        { source: "slack", title: "Reply to DM", priority: "high", confidence: 8, task_type: "response", summary: "test", links: [], author: "Mor", action_needed: "reply" },
      ],
      updates: [],
      follow_up: [],
      skipped: [],
    });
    const result = parseTriageResponse(response);
    expect(result.projects).toHaveLength(0);
    expect(result.actionable[0].project).toBeUndefined();
  });

  it("should parse split tasks under same project", () => {
    const response = JSON.stringify({
      actionable: [
        { source: "linear", title: "VEC-24: Add history", project: "Perf Agent", priority: "high", confidence: 8, task_type: "implementation", summary: "a", links: [], author: "Jane", action_needed: "build" },
        { source: "linear", title: "VEC-24: Port UI", project: "Perf Agent", priority: "high", confidence: 8, task_type: "implementation", summary: "b", links: [], author: "Jane", action_needed: "build" },
      ],
      projects: [
        { name: "Perf Agent", source: "linear", source_id: "proj-abc", related_tickets: ["VEC-24"] },
      ],
      updates: [],
      follow_up: [],
      skipped: [],
    });
    const result = parseTriageResponse(response);
    expect(result.actionable).toHaveLength(2);
    expect(result.actionable[0].project).toBe("Perf Agent");
    expect(result.actionable[1].project).toBe("Perf Agent");
    expect(result.projects).toHaveLength(1);
  });

  it("should handle markdown-wrapped JSON", () => {
    const response = "```json\n" + JSON.stringify({
      actionable: [{ source: "slack", title: "Test", priority: "medium", confidence: 5, task_type: "response", summary: "t", links: [], author: "A", action_needed: "do" }],
      updates: [], follow_up: [], skipped: [],
    }) + "\n```";
    const result = parseTriageResponse(response);
    expect(result.actionable).toHaveLength(1);
  });

  it("should return empty result for invalid JSON", () => {
    const result = parseTriageResponse("not json at all");
    expect(result.actionable).toHaveLength(0);
    expect(result.projects).toHaveLength(0);
  });
});
