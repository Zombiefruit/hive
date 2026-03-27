import { describe, it, expect } from "vitest";
import { parsePlanMd, type ParsedPlan } from "./plan-parser";

const SAMPLE_PLAN = `---
skill: start-work
ticket: VEC-24
branch: kwilliams/vec-24-chat-rendering
status: in-progress
---

## Context

VEC-24: Add conversation history and improve chat rendering for performance agent.

### Relevant Files

| File | Purpose |
|------|---------|
| src/components/Chat.tsx | Main chat component |
| src/api/agent.ts | Agent API client |

### Scope: Medium

## Phase 1: Add conversation history

### Task 1.1: Create history store
- [x] \`feat: add conversation history store\`
Implement a Zustand store for conversation history.

### Task 1.2: Wire up persistence
- [ ] \`feat: persist history to localStorage\`
Save and load conversation history.

## Phase 2: Improve chat rendering

### Task 2.1: Port TTSA chat UI
- [ ] \`feat: port chat rendering from TTSA\`
Copy and adapt the chat rendering component.
`;

describe("Plan Parser", () => {
  it("should parse frontmatter", () => {
    const plan = parsePlanMd(SAMPLE_PLAN);
    expect(plan.ticket).toBe("VEC-24");
    expect(plan.branch).toBe("kwilliams/vec-24-chat-rendering");
    expect(plan.status).toBe("in-progress");
  });

  it("should extract phases", () => {
    const plan = parsePlanMd(SAMPLE_PLAN);
    expect(plan.phases).toHaveLength(2);
    expect(plan.phases[0].name).toBe("Add conversation history");
    expect(plan.phases[1].name).toBe("Improve chat rendering");
  });

  it("should extract tasks within phases", () => {
    const plan = parsePlanMd(SAMPLE_PLAN);
    expect(plan.phases[0].tasks).toHaveLength(2);
    expect(plan.phases[0].tasks[0].commitMessage).toBe("feat: add conversation history store");
    expect(plan.phases[0].tasks[0].checked).toBe(true);
    expect(plan.phases[0].tasks[1].checked).toBe(false);
  });

  it("should extract relevant files", () => {
    const plan = parsePlanMd(SAMPLE_PLAN);
    expect(plan.relevantFiles).toHaveLength(2);
    expect(plan.relevantFiles[0].path).toBe("src/components/Chat.tsx");
  });

  it("should extract scope", () => {
    const plan = parsePlanMd(SAMPLE_PLAN);
    expect(plan.scope).toBe("Medium");
  });

  it("should compute progress", () => {
    const plan = parsePlanMd(SAMPLE_PLAN);
    expect(plan.totalTasks).toBe(3);
    expect(plan.completedTasks).toBe(1);
  });

  it("should handle empty/missing plan", () => {
    const plan = parsePlanMd("");
    expect(plan.phases).toHaveLength(0);
    expect(plan.totalTasks).toBe(0);
  });
});
