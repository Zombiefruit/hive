# MC Skills Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom planning agents with Monte Carlo's shared engineering skills (`/start-work` → `/hack` → `/ship` → `/code-review`), add project-based task grouping, and render structured UI at every stage.

**Architecture:** Fresh Claude Code process per skill invocation via stream-json (full MCP access). `--resume <sessionId>` for conversation continuity across skills. Projects auto-detected by triage from Linear/Slack/AI grouping. Parsers read `.work/<slug>/plan.md` and review files into typed data for structured React components.

**Tech Stack:** Electron + TypeScript + React 19 + Mantine 8.x + Vitest

---

## Phase 1: Skill Runner + Stage System

### Task 1: Update stage constants

**Files:**
- Modify: `src/shared/task-utils.ts:4-17`
- Test: `src/main/notifications/stage-transitions.test.ts` (new)

- [ ] **Step 1: Write the failing test for new stages**

```typescript
// src/main/notifications/stage-transitions.test.ts
import { describe, it, expect } from "vitest";
import { VALID_STAGES, STAGE_ORDER, AGENT_ACTIONABLE_TYPES, HUMAN_ONLY_TYPES, isValidTransition } from "../../shared/task-utils";

describe("Stage System", () => {
  it("should define all 10 valid stages", () => {
    expect(VALID_STAGES).toContain("new");
    expect(VALID_STAGES).toContain("start_work");
    expect(VALID_STAGES).toContain("plan_review");
    expect(VALID_STAGES).toContain("hack");
    expect(VALID_STAGES).toContain("ship");
    expect(VALID_STAGES).toContain("code_review");
    expect(VALID_STAGES).toContain("pr_feedback");
    expect(VALID_STAGES).toContain("done");
    expect(VALID_STAGES).toContain("backlog");
    expect(VALID_STAGES).toContain("skipped");
    // Old stages should NOT be present
    expect(VALID_STAGES).not.toContain("planning");
    expect(VALID_STAGES).not.toContain("prepared");
    expect(VALID_STAGES).not.toContain("working");
    expect(VALID_STAGES).not.toContain("follow_up");
  });

  it("should order stages correctly", () => {
    expect(STAGE_ORDER["new"]).toBeLessThan(STAGE_ORDER["start_work"]);
    expect(STAGE_ORDER["start_work"]).toBeLessThan(STAGE_ORDER["hack"]);
    expect(STAGE_ORDER["hack"]).toBeLessThan(STAGE_ORDER["ship"]);
    expect(STAGE_ORDER["ship"]).toBeLessThan(STAGE_ORDER["code_review"]);
    expect(STAGE_ORDER["code_review"]).toBeLessThan(STAGE_ORDER["done"]);
  });

  it("should include follow_up as a task type, not a stage", () => {
    expect(HUMAN_ONLY_TYPES.has("follow_up")).toBe(false);
    expect(HUMAN_ONLY_TYPES.has("response")).toBe(true);
    expect(HUMAN_ONLY_TYPES.has("meeting_prep")).toBe(true);
  });
});

describe("Stage Transitions", () => {
  it("should allow new → start_work", () => {
    expect(isValidTransition("new", "start_work")).toBe(true);
  });

  it("should allow start_work → hack", () => {
    expect(isValidTransition("start_work", "hack")).toBe(true);
  });

  it("should allow start_work → plan_review", () => {
    expect(isValidTransition("start_work", "plan_review")).toBe(true);
  });

  it("should allow plan_review → hack", () => {
    expect(isValidTransition("plan_review", "hack")).toBe(true);
  });

  it("should allow hack → ship", () => {
    expect(isValidTransition("hack", "ship")).toBe(true);
  });

  it("should allow ship → code_review", () => {
    expect(isValidTransition("ship", "code_review")).toBe(true);
  });

  it("should allow code_review → done", () => {
    expect(isValidTransition("code_review", "done")).toBe(true);
  });

  it("should allow code_review → pr_feedback", () => {
    expect(isValidTransition("code_review", "pr_feedback")).toBe(true);
  });

  it("should allow pr_feedback → done", () => {
    expect(isValidTransition("pr_feedback", "done")).toBe(true);
  });

  it("should reject new → hack (skipping start_work)", () => {
    expect(isValidTransition("new", "hack")).toBe(false);
  });

  it("should reject new → ship", () => {
    expect(isValidTransition("new", "ship")).toBe(false);
  });

  it("should always allow transition to backlog", () => {
    expect(isValidTransition("new", "backlog")).toBe(true);
    expect(isValidTransition("start_work", "backlog")).toBe(true);
    expect(isValidTransition("hack", "backlog")).toBe(true);
  });

  it("should always allow transition to done", () => {
    expect(isValidTransition("new", "done")).toBe(true);
    expect(isValidTransition("hack", "done")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/notifications/stage-transitions.test.ts`
Expected: FAIL — `isValidTransition` not exported, old stages still in VALID_STAGES

- [ ] **Step 3: Update stage constants in task-utils.ts**

Replace lines 4-17 in `src/shared/task-utils.ts`:

```typescript
export type Priority = "critical" | "high" | "medium" | "low" | "backlog";

export const VALID_STAGES = [
  "new", "start_work", "plan_review", "hack", "ship",
  "code_review", "pr_feedback", "done", "backlog", "skipped",
  // Human task stages
  "preparing", "ready",
] as const;
export type Stage = typeof VALID_STAGES[number];

export const STAGE_ORDER: Record<string, number> = {
  skipped: 0, backlog: 1, new: 2, preparing: 3, ready: 3,
  start_work: 4, plan_review: 5, hack: 6, ship: 7,
  code_review: 8, pr_feedback: 9, done: 10,
};

export const CONFIDENCE_THRESHOLD = 5;

export const AGENT_ACTIONABLE_TYPES = new Set(["implementation", "investigation", "review"]);
export const HUMAN_ONLY_TYPES = new Set(["meeting_prep", "response"]);

/** Valid stage transitions for actionable tasks. Backlog and done are always allowed. */
const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ["start_work"],
  start_work: ["plan_review", "hack"],
  plan_review: ["hack", "start_work"],
  hack: ["ship"],
  ship: ["code_review"],
  code_review: ["pr_feedback", "done"],
  pr_feedback: ["code_review", "done"],
  // Human tasks
  preparing: ["ready"],
  ready: ["done"],
};

export function isValidTransition(from: string, to: string): boolean {
  if (to === "backlog" || to === "done" || to === "skipped") return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/notifications/stage-transitions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/task-utils.ts src/main/notifications/stage-transitions.test.ts
git commit -m "feat: replace stage system with MC skills workflow stages"
```

---

### Task 2: Add notification fields for skill runner

**Files:**
- Modify: `src/main/notifications/poll-service.ts:13-32`
- Modify: `src/shared/config-types.ts:35-66`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/notifications/skill-fields.test.ts
import { describe, it, expect } from "vitest";

describe("Notification Fields for Skill Runner", () => {
  it("should define PollNotification with skill runner fields", async () => {
    // Dynamically import to check the type exists at runtime
    const notification = {
      id: "test-1",
      source: "linear" as const,
      priority: "high" as const,
      status: "new" as const,
      title: "VEC-24",
      summary: "Test",
      createdAt: new Date().toISOString(),
      // New fields
      sessionId: "abc-123-def",
      repoPath: "/Users/kieran/repos/monolith-django",
      branch: "kwilliams/vec-24-chat-rendering",
      workSlug: "vec-24-chat-rendering",
      projectId: "proj-perf-agent",
    };
    expect(notification.sessionId).toBe("abc-123-def");
    expect(notification.repoPath).toContain("monolith-django");
    expect(notification.branch).toContain("vec-24");
    expect(notification.workSlug).toBe("vec-24-chat-rendering");
    expect(notification.projectId).toBe("proj-perf-agent");
  });

  it("should define repoMappings in DeckConfig", () => {
    const config = {
      repoMappings: [
        { pattern: "VEC-*", repoPath: "/Users/kieran/repos/monolith-django" },
        { pattern: "#monolith-*", repoPath: "/Users/kieran/repos/monolith-django" },
      ],
    };
    expect(config.repoMappings).toHaveLength(2);
    expect(config.repoMappings[0].pattern).toBe("VEC-*");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/notifications/skill-fields.test.ts`
Expected: PASS (these are runtime shape tests — they'll pass, but the TypeScript types need updating for type safety across the codebase)

- [ ] **Step 3: Add fields to PollNotification**

In `src/main/notifications/poll-service.ts`, add after line 31 (`pollCycle?: number;`):

```typescript
  sessionId?: string;        // Claude Code session for --resume
  repoPath?: string;         // absolute path to target repo
  branch?: string;           // git branch created by /start-work
  workSlug?: string;         // .work/<slug> directory name
  projectId?: string;        // link to parent project
```

- [ ] **Step 4: Add repoMappings to DeckConfig**

In `src/shared/config-types.ts`, add after `workingHoursEnd: string;` (line 60):

```typescript
  /** Repo detection — maps ticket prefixes/channel names to local repo paths */
  repoMappings?: Array<{
    pattern: string;      // "VEC-*", "#monolith-*", "monte-carlo-data/repo-*"
    repoPath: string;     // absolute path to local repo
  }>;
```

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors)

- [ ] **Step 6: Commit**

```bash
git add src/main/notifications/poll-service.ts src/shared/config-types.ts src/main/notifications/skill-fields.test.ts
git commit -m "feat: add skill runner fields to PollNotification and repoMappings to config"
```

---

### Task 3: Build the skill runner module

**Files:**
- Create: `src/main/skill-runner.ts`
- Test: `src/main/skill-runner.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/skill-runner.test.ts
import { describe, it, expect } from "vitest";
import { buildSkillArgs, buildSkillEnv, extractSessionId, type SkillInvocation, type SkillResult } from "./skill-runner";

describe("Skill Runner — buildSkillArgs", () => {
  it("should build args without --resume on first invocation", () => {
    const args = buildSkillArgs(null);
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--input-format");
    expect(args).toContain("--verbose");
    expect(args).toContain("--no-chrome");
    expect(args).not.toContain("--resume");
  });

  it("should include --resume when sessionId is provided", () => {
    const args = buildSkillArgs("session-abc-123");
    expect(args).toContain("--resume");
    expect(args).toContain("session-abc-123");
  });

  it("should not include --no-session-persistence", () => {
    const args = buildSkillArgs(null);
    expect(args).not.toContain("--no-session-persistence");
  });
});

describe("Skill Runner — buildSkillEnv", () => {
  it("should set CLAUDE_HIVE=1", () => {
    const env = buildSkillEnv();
    expect(env.CLAUDE_HIVE).toBe("1");
  });

  it("should preserve existing env vars", () => {
    const env = buildSkillEnv();
    expect(env.PATH).toBeDefined();
  });
});

describe("Skill Runner — extractSessionId", () => {
  it("should extract session_id from init message", () => {
    const msg = { type: "system", subtype: "init", session_id: "sess-abc-123", tools: [] };
    expect(extractSessionId(msg)).toBe("sess-abc-123");
  });

  it("should return null for non-init messages", () => {
    const msg = { type: "assistant", message: { content: [] } };
    expect(extractSessionId(msg)).toBeNull();
  });

  it("should return null when session_id is missing", () => {
    const msg = { type: "system", subtype: "init", tools: [] };
    expect(extractSessionId(msg)).toBeNull();
  });
});

describe("Skill Runner — SkillInvocation type", () => {
  it("should define correct invocation shape", () => {
    const invocation: SkillInvocation = {
      skill: "/start-work",
      args: "VEC-24",
      repoPath: "/Users/kieran/repos/monolith-django",
      sessionId: null,
      notificationId: "poll-123-abc",
      timeoutMs: 300000,
    };
    expect(invocation.skill).toBe("/start-work");
    expect(invocation.sessionId).toBeNull();
  });
});

describe("Skill Runner — SkillResult type", () => {
  it("should define correct result shape", () => {
    const result: SkillResult = {
      success: true,
      sessionId: "sess-abc-123",
      events: [{ type: "init", content: "ready", timestamp: new Date().toISOString() }],
      resultText: "Plan created",
      error: null,
    };
    expect(result.success).toBe(true);
    expect(result.sessionId).toBe("sess-abc-123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/skill-runner.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement skill-runner.ts**

```typescript
// src/main/skill-runner.ts
import { spawn, ChildProcess } from "node:child_process";
import { getClaudeCodePath } from "./claude-path";
import { trackProcess, untrackProcess } from "./process-monitor";
import { addDebugEntry, type PlanningEvent } from "./mcp-bridge";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const LOG_PATH = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "skill-runner.log");

function log(msg: string): void {
  try { fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`); } catch {}
}

export interface SkillInvocation {
  skill: string;          // "/start-work", "/hack", "/ship", "/code-review"
  args: string;           // "VEC-24", "full auto", "", etc.
  repoPath: string;       // absolute path to target repo
  sessionId: string | null; // null on first run, set for --resume
  notificationId: string;
  timeoutMs?: number;     // default 300000 (5 min)
}

export interface SkillResult {
  success: boolean;
  sessionId: string | null;  // extracted from init message
  events: PlanningEvent[];
  resultText: string;
  error: string | null;
}

export function buildSkillArgs(sessionId: string | null): string[] {
  const args = [
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--verbose",
    "--no-chrome",
  ];
  if (sessionId) {
    args.push("--resume", sessionId);
  }
  return args;
}

export function buildSkillEnv(): Record<string, string> {
  return { ...process.env as Record<string, string>, CLAUDE_HIVE: "1" };
}

export function extractSessionId(msg: Record<string, unknown>): string | null {
  if (msg.type === "system" && msg.subtype === "init" && typeof msg.session_id === "string") {
    return msg.session_id;
  }
  return null;
}

/**
 * Run an MC skill in a target repo.
 * Spawns a fresh Claude Code process, sends the skill command, streams events.
 */
export function runSkill(
  invocation: SkillInvocation,
  onEvent?: (event: PlanningEvent) => void,
): Promise<SkillResult> {
  return new Promise((resolve) => {
    const claudePath = getClaudeCodePath();
    const args = buildSkillArgs(invocation.sessionId);
    const env = buildSkillEnv();
    const timeoutMs = invocation.timeoutMs ?? 300000;

    const proc = spawn(claudePath, args, {
      cwd: invocation.repoPath,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let outputBuffer = "";
    let resultText = "";
    let assistantText = "";
    let sessionId = invocation.sessionId;
    let done = false;
    const events: PlanningEvent[] = [];

    const emit = (type: PlanningEvent["type"], content: string) => {
      const event: PlanningEvent = { type, content, timestamp: new Date().toISOString() };
      events.push(event);
      onEvent?.(event);
    };

    if (proc.pid) trackProcess(proc.pid, "planning", `${invocation.skill} ${invocation.args}`.trim().slice(0, 40));
    log(`SPAWN pid=${proc.pid} skill=${invocation.skill} repo=${invocation.repoPath} session=${invocation.sessionId ?? "new"}`);
    emit("status", `Spawning agent for ${invocation.skill}...`);

    // Send skill command
    const message = `${invocation.skill}${invocation.args ? " " + invocation.args : ""}`;
    proc.stdin?.write(JSON.stringify({
      type: "user",
      message: { role: "user", content: message },
      parent_tool_use_id: null,
      session_id: sessionId ?? "",
    }) + "\n");

    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        emit("error", `Timed out after ${Math.round(timeoutMs / 1000)}s`);
        log(`TIMEOUT pid=${proc.pid} after ${Math.round(timeoutMs / 1000)}s`);
        proc.kill();
        if (proc.pid) untrackProcess(proc.pid);
        resolve({ success: false, sessionId, events, resultText: resultText || assistantText, error: "timeout" });
      }
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      outputBuffer += chunk.toString("utf-8");
      const lines = outputBuffer.split("\n");
      outputBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);

          // Extract session ID from init
          if (msg.type === "system" && msg.subtype === "init") {
            const newSessionId = extractSessionId(msg);
            if (newSessionId) sessionId = newSessionId;
            const tools: string[] = msg.tools ?? [];
            const mcpCount = tools.filter((t: string) => t.includes("mcp__claude_ai")).length;
            emit("init", `Agent ready — ${tools.length} tools (${mcpCount} MCP)`);
            log(`INIT pid=${proc.pid} session=${sessionId} tools=${tools.length} mcp=${mcpCount}`);
          }

          // Collect assistant text + tool use events
          if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
            for (const block of msg.message.content as Array<{ type: string; name?: string; text?: string; input?: Record<string, unknown> }>) {
              if (block.type === "tool_use" && block.name) {
                const input = block.input ?? {};
                let detail = block.name;
                if (block.name.includes("Slack")) detail = `Slack: ${block.name.split("__").pop()} ${JSON.stringify(input).slice(0, 80)}`;
                else if (block.name.includes("Linear")) detail = `Linear: ${block.name.split("__").pop()} ${JSON.stringify(input).slice(0, 80)}`;
                else if (block.name.includes("Notion")) detail = `Notion: ${block.name.split("__").pop()}`;
                else if (block.name === "Bash") detail = `Bash: ${String(input.command ?? "").slice(0, 80)}`;
                else if (block.name === "Read") detail = `Read: ${input.file_path}`;
                else if (block.name === "Write") detail = `Write: ${input.file_path}`;
                else if (block.name === "Edit") detail = `Edit: ${input.file_path}`;
                emit("tool_use", detail);
              }
              if (block.type === "text" && block.text?.trim()) {
                assistantText += (assistantText ? "\n" : "") + block.text;
                emit("text", block.text.slice(0, 500));
              }
            }
          }

          // Result
          if (msg.type === "result" && !done) {
            resultText = String(msg.result ?? "");
            const finalText = resultText.trim() || assistantText.trim();
            // Check for premature result (same logic as askMcpPlanningAgent)
            if (!finalText.includes("---") && finalText.length < 200) {
              log(`PREMATURE result pid=${proc.pid} (${finalText.length} chars) — waiting`);
              emit("status", `Agent still working... (${finalText.length} chars)`);
              return; // Don't resolve yet
            }
            emit("result", `Skill complete (${finalText.length} chars)`);
            log(`RESULT pid=${proc.pid} ${finalText.length} chars`);
            done = true;
            clearTimeout(timeout);
            proc.kill();
            if (proc.pid) untrackProcess(proc.pid);
            resolve({ success: true, sessionId, events, resultText: finalText, error: null });
          }
        } catch {}
      }
    });

    proc.stderr?.on("data", () => {});
    proc.on("exit", (code) => {
      if (proc.pid) untrackProcess(proc.pid);
      if (!done) {
        done = true;
        clearTimeout(timeout);
        const finalText = resultText.trim() || assistantText.trim();
        log(`EXIT pid=${proc.pid} code=${code} text=${finalText.length}`);
        emit(code === 0 ? "result" : "error", code === 0 ? `Skill complete (${finalText.length} chars)` : `Agent exited (code ${code})`);
        resolve({
          success: code === 0 && finalText.length > 0,
          sessionId,
          events,
          resultText: finalText || "Process exited without result",
          error: code !== 0 ? `exit code ${code}` : null,
        });
      }
    });
  });
}

/** Check if required MC skills are installed. */
export function checkRequiredSkills(): { installed: boolean; missing: string[] } {
  const required = ["start-work", "hack", "ship", "code-review"];
  const missing: string[] = [];
  for (const skill of required) {
    const skillPath = path.join(os.homedir(), ".claude", "skills", skill, "SKILL.md");
    if (!fs.existsSync(skillPath)) missing.push(skill);
  }
  return { installed: missing.length === 0, missing };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/skill-runner.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: Some existing tests will fail (old stage references). That's expected — we'll fix those in Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/main/skill-runner.ts src/main/skill-runner.test.ts
git commit -m "feat: add skill runner module for MC skill invocation"
```

---

### Task 4: Fix broken existing tests

**Files:**
- Delete: `src/main/notifications/mcp-planning.test.ts`
- Delete: `src/main/notifications/orchestrated-planning.test.ts`
- Delete: `src/main/notifications/planner-system-prompt.test.ts`
- Delete: `src/main/notifications/unified-stages.test.ts`
- Modify: `src/main/notifications/priority-dedup-timeline.test.ts`
- Modify: `src/main/notifications/stage-reconciliation.test.ts`
- Modify: `src/main/notifications/e2e-pipeline.test.ts`

- [ ] **Step 1: Delete obsolete test files**

```bash
rm src/main/notifications/mcp-planning.test.ts
rm src/main/notifications/orchestrated-planning.test.ts
rm src/main/notifications/planner-system-prompt.test.ts
rm src/main/notifications/unified-stages.test.ts
```

- [ ] **Step 2: Update priority-dedup-timeline.test.ts**

Read the file first, then update any references to `VALID_STAGES` to match the new stage list. Replace `"planning"` with `"start_work"`, `"working"` with `"hack"`, `"prepared"` with `"plan_review"`, `"follow_up"` stage with appropriate new stage.

- [ ] **Step 3: Update stage-reconciliation.test.ts**

Replace `"planning"` with `"start_work"` in all assertions. The reconciliation logic (preserve stage when plan exists) still applies — just with new stage names.

- [ ] **Step 4: Update e2e-pipeline.test.ts**

Update stage progression assertions from `new → planning → working → done` to `new → start_work → hack → ship → code_review → done`. Add new notification fields to test data fixtures.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL tests pass

- [ ] **Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS — may have errors in notifications.tsx (stage references). Fix any stage-related type errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix: update/remove tests for new MC skills stage system"
```

---

### Task 5: Update kanban stage configs in notifications.tsx

**Files:**
- Modify: `src/renderer/pages/notifications.tsx:40-73`

- [ ] **Step 1: Update stage configs**

Replace SHARED_STAGES, AGENT_STAGES, HUMAN_STAGES, END_STAGES with:

```typescript
const SHARED_STAGES: StageConfig[] = [
  { key: "new", label: "Inbox", Icon: IconInbox, color: "#3b82f6", tip: "New items from all sources." },
];

const AGENT_STAGES: StageConfig[] = [
  { key: "start_work", label: "Planning", Icon: IconSparkles, color: "#a855f7", tip: "Agent running /start-work — discovering code and creating plan." },
  { key: "plan_review", label: "Plan Review", Icon: IconEye, color: "#f59e0b", tip: "Plan reviewers assessing the plan." },
  { key: "hack", label: "Building", Icon: IconPlayerPlay, color: "#22c55e", tip: "Agent implementing the plan." },
  { key: "ship", label: "Shipping", Icon: IconRocket, color: "#06b6d4", tip: "Verifying, pushing, opening PR." },
  { key: "code_review", label: "Reviewing", Icon: IconGitPullRequest, color: "#f97316", tip: "Code review agents running." },
  { key: "pr_feedback", label: "PR Feedback", Icon: IconMessageCircle, color: "#ec4899", tip: "Addressing reviewer comments." },
];

const HUMAN_STAGES: StageConfig[] = [
  { key: "preparing", label: "Preparing", Icon: IconSparkles, color: "#a855f7", tip: "Gathering context." },
  { key: "ready", label: "Ready", Icon: IconCircleCheck, color: "#22c55e", tip: "Context ready — review and act." },
];

const END_STAGES: StageConfig[] = [
  { key: "backlog", label: "Backlog", Icon: IconArchive, color: "#4b5563", tip: "Low priority." },
  { key: "done", label: "Done", Icon: IconCircleCheck, color: "#6b7280", tip: "Completed." },
];
```

Add missing icon imports: `IconEye, IconRocket, IconMessageCircle` from `@tabler/icons-react`.

- [ ] **Step 2: Update ACTIONABLE_ROW and HUMAN_ROW**

```typescript
const ACTIONABLE_ROW = [...SHARED_STAGES, ...AGENT_STAGES, ...END_STAGES];
const HUMAN_ROW = [...SHARED_STAGES, ...HUMAN_STAGES, ...END_STAGES];
```

- [ ] **Step 3: Update stage transition buttons**

Find the `handleStageButton` and `onAdvance` callbacks. Update the stage transitions to use new names. The "Analyze" button should become "Start Work", "Start Agent" should become "Start Hack", etc.

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/notifications.tsx
git commit -m "feat: update kanban stages to MC skills workflow"
```

---

### Task 6: Wire up skill runner to stage transitions

**Files:**
- Modify: `src/main/notifications/work-dispatcher.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/preload.ts`

- [ ] **Step 1: Add IPC handlers for skill invocation**

In `src/main/index.ts`, add:

```typescript
import { runSkill, checkRequiredSkills, type SkillInvocation } from "./skill-runner";

ipcMain.handle("skill:run", async (_event, invocation: SkillInvocation) => {
  const onEvent = (event: PlanningEvent) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("planning:event", { notificationId: invocation.notificationId, event });
      }
    }
  };
  return runSkill(invocation, onEvent);
});

ipcMain.handle("skill:check", () => checkRequiredSkills());
```

- [ ] **Step 2: Expose in preload**

In `src/preload/preload.ts`, add:

```typescript
runSkill: (invocation: unknown) => ipcRenderer.invoke("skill:run", invocation),
checkSkills: () => ipcRenderer.invoke("skill:check"),
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/preload.ts
git commit -m "feat: wire up skill runner IPC handlers"
```

---

### Task 7: Startup skill check

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/renderer/pages/settings.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/skill-check.test.ts
import { describe, it, expect } from "vitest";
import { checkRequiredSkills } from "./skill-runner";

describe("Startup Skill Check", () => {
  it("should return installed: true when all skills exist", () => {
    const result = checkRequiredSkills();
    // This test depends on the user having skills installed
    // In CI, we'd mock fs.existsSync. For local dev, skills should be installed.
    expect(result).toHaveProperty("installed");
    expect(result).toHaveProperty("missing");
    expect(Array.isArray(result.missing)).toBe(true);
  });

  it("should list start-work, hack, ship, code-review as required", () => {
    // The function checks these four skills
    const result = checkRequiredSkills();
    if (!result.installed) {
      // All missing skills should be from the required set
      for (const skill of result.missing) {
        expect(["start-work", "hack", "ship", "code-review"]).toContain(skill);
      }
    }
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/main/skill-check.test.ts`
Expected: PASS (skills are installed locally)

- [ ] **Step 3: Add skill check to Settings page**

In `src/renderer/pages/settings.tsx`, in the MCP Connections section, add a skill status check:

```tsx
const [skillStatus, setSkillStatus] = useState<{ installed: boolean; missing: string[] } | null>(null);

useEffect(() => {
  window.deck.checkSkills?.().then(setSkillStatus).catch(() => {});
}, []);

// In the MCP Connections section, after the bridge status:
{skillStatus && !skillStatus.installed && (
  <div style={{ padding: 12, borderRadius: 8, backgroundColor: "color-mix(in srgb, var(--mantine-color-yellow-9) 15%, transparent)", border: "1px solid var(--mantine-color-yellow-7)" }}>
    <Text size="sm" fw={500} c="yellow">MC Skills Missing</Text>
    <Text size="xs" c="dimmed" mt={4}>
      Required skills not found: {skillStatus.missing.join(", ")}. Run <code>configure-claude</code> to install them.
    </Text>
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/skill-check.test.ts src/renderer/pages/settings.tsx
git commit -m "feat: startup skill check with warning in Settings"
```

---

## Phase 2: Structured Output Parsers

### Task 8: Plan parser

**Files:**
- Create: `src/shared/plan-parser.ts`
- Test: `src/shared/plan-parser.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// src/shared/plan-parser.test.ts
import { describe, it, expect } from "vitest";
import { parsePlanMd, type ParsedPlan, type PlanPhase, type PlanTask } from "./plan-parser";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/plan-parser.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement plan-parser.ts**

```typescript
// src/shared/plan-parser.ts

export interface PlanTask {
  id: string;           // "1.1", "2.3", etc.
  commitMessage: string;
  description: string;
  checked: boolean;
}

export interface PlanPhase {
  number: number;
  name: string;
  tasks: PlanTask[];
}

export interface RelevantFile {
  path: string;
  purpose: string;
}

export interface ParsedPlan {
  ticket: string;
  branch: string;
  status: string;
  pr?: string;
  scope: string;
  phases: PlanPhase[];
  relevantFiles: RelevantFile[];
  totalTasks: number;
  completedTasks: number;
  context: string;
}

export function parsePlanMd(raw: string): ParsedPlan {
  const plan: ParsedPlan = {
    ticket: "", branch: "", status: "", scope: "", phases: [],
    relevantFiles: [], totalTasks: 0, completedTasks: 0, context: "",
  };

  if (!raw.trim()) return plan;

  // Parse frontmatter
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const field = (key: string) => fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
    plan.ticket = field("ticket");
    plan.branch = field("branch");
    plan.status = field("status");
    plan.pr = field("pr") || undefined;
  }

  // Extract scope
  const scopeMatch = raw.match(/###?\s*Scope:\s*(Small|Medium|Large)/i);
  if (scopeMatch) plan.scope = scopeMatch[1];

  // Extract relevant files table
  const tableMatch = raw.match(/\|\s*File\s*\|\s*Purpose\s*\|[\s\S]*?\n((?:\|.*\|.*\n)*)/);
  if (tableMatch) {
    const rows = tableMatch[1].trim().split("\n");
    for (const row of rows) {
      const cols = row.split("|").map(c => c.trim()).filter(Boolean);
      if (cols.length >= 2 && !cols[0].startsWith("-")) {
        plan.relevantFiles.push({ path: cols[0], purpose: cols[1] });
      }
    }
  }

  // Extract context (first ## Context section)
  const ctxMatch = raw.match(/## Context\n\n([\s\S]*?)(?=\n##|\n---)/);
  if (ctxMatch) plan.context = ctxMatch[1].trim();

  // Extract phases
  const phaseRegex = /## Phase (\d+):\s*(.+)/g;
  let phaseMatch;
  const phaseStarts: Array<{ number: number; name: string; startIndex: number }> = [];
  while ((phaseMatch = phaseRegex.exec(raw)) !== null) {
    phaseStarts.push({ number: parseInt(phaseMatch[1], 10), name: phaseMatch[2].trim(), startIndex: phaseMatch.index });
  }

  for (let i = 0; i < phaseStarts.length; i++) {
    const start = phaseStarts[i].startIndex;
    const end = i + 1 < phaseStarts.length ? phaseStarts[i + 1].startIndex : raw.length;
    const phaseText = raw.slice(start, end);

    const tasks: PlanTask[] = [];
    const taskRegex = /### Task (\d+\.\d+):\s*(.+)\n- \[([ x])\]\s*`([^`]+)`\n([\s\S]*?)(?=\n### Task|\n## Phase|$)/g;
    let taskMatch;
    while ((taskMatch = taskRegex.exec(phaseText)) !== null) {
      tasks.push({
        id: taskMatch[1],
        commitMessage: taskMatch[4],
        description: taskMatch[5].trim(),
        checked: taskMatch[3] === "x",
      });
    }

    plan.phases.push({
      number: phaseStarts[i].number,
      name: phaseStarts[i].name,
      tasks,
    });
  }

  plan.totalTasks = plan.phases.reduce((sum, p) => sum + p.tasks.length, 0);
  plan.completedTasks = plan.phases.reduce((sum, p) => sum + p.tasks.filter(t => t.checked).length, 0);

  return plan;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/plan-parser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/plan-parser.ts src/shared/plan-parser.test.ts
git commit -m "feat: plan.md parser for structured UI rendering"
```

---

### Task 9: Review parser

**Files:**
- Create: `src/shared/review-parser.ts`
- Test: `src/shared/review-parser.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// src/shared/review-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseReviewMd, type ReviewFinding } from "./review-parser";

const SAMPLE_REVIEW = `# Code Review

## Findings

### [x] F1 — BLOCKER — security
**File:** src/api/auth.ts:45
**Reviewer:** security
**Description:** SQL injection in query parameter
**Why it matters:** User input directly interpolated into SQL query
**Suggestion:** Use parameterized queries
**Confidence:** 95%

### [x] F2 — ISSUE — correctness
**File:** src/utils/parse.ts:12
**Reviewer:** correctness
**Description:** Off-by-one error in pagination
**Why it matters:** Last page shows duplicate items
**Suggestion:** Change <= to <
**Confidence:** 85%

### [ ] F3 — NIT — architecture
**File:** src/components/Header.tsx:8
**Reviewer:** architecture
**Description:** Component does too much
**Why it matters:** Hard to test
**Suggestion:** Extract navigation into separate component
**Confidence:** 70%
`;

describe("Review Parser", () => {
  it("should parse findings with severity", () => {
    const review = parseReviewMd(SAMPLE_REVIEW);
    expect(review.findings).toHaveLength(3);
    expect(review.findings[0].severity).toBe("BLOCKER");
    expect(review.findings[1].severity).toBe("ISSUE");
    expect(review.findings[2].severity).toBe("NIT");
  });

  it("should extract finding details", () => {
    const review = parseReviewMd(SAMPLE_REVIEW);
    const f1 = review.findings[0];
    expect(f1.id).toBe("F1");
    expect(f1.file).toBe("src/api/auth.ts:45");
    expect(f1.reviewer).toBe("security");
    expect(f1.description).toContain("SQL injection");
    expect(f1.suggestion).toContain("parameterized");
    expect(f1.confidence).toBe(95);
  });

  it("should track checked/unchecked status", () => {
    const review = parseReviewMd(SAMPLE_REVIEW);
    expect(review.findings[0].checked).toBe(true);
    expect(review.findings[2].checked).toBe(false);
  });

  it("should count by severity", () => {
    const review = parseReviewMd(SAMPLE_REVIEW);
    expect(review.blockerCount).toBe(1);
    expect(review.issueCount).toBe(1);
    expect(review.nitCount).toBe(1);
  });

  it("should handle empty review", () => {
    const review = parseReviewMd("");
    expect(review.findings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/review-parser.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement review-parser.ts**

```typescript
// src/shared/review-parser.ts

export type Severity = "BLOCKER" | "ISSUE" | "SUGGESTION" | "NIT";

export interface ReviewFinding {
  id: string;
  severity: Severity;
  file: string;
  reviewer: string;
  description: string;
  whyItMatters: string;
  suggestion: string;
  confidence: number;
  checked: boolean;
}

export interface ParsedReview {
  findings: ReviewFinding[];
  blockerCount: number;
  issueCount: number;
  suggestionCount: number;
  nitCount: number;
}

export function parseReviewMd(raw: string): ParsedReview {
  const findings: ReviewFinding[] = [];

  if (!raw.trim()) return { findings, blockerCount: 0, issueCount: 0, suggestionCount: 0, nitCount: 0 };

  // Match finding blocks: ### [x] F1 — BLOCKER — security
  const findingRegex = /### \[([ x])\]\s*(F\d+)\s*—\s*(BLOCKER|ISSUE|SUGGESTION|NIT)\s*—\s*(\w+)\n([\s\S]*?)(?=\n### \[|$)/g;
  let match;
  while ((match = findingRegex.exec(raw)) !== null) {
    const body = match[5];
    const field = (key: string) => body.match(new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`))?.[1]?.trim() ?? "";

    findings.push({
      id: match[2],
      severity: match[3] as Severity,
      file: field("File"),
      reviewer: match[4],
      description: field("Description"),
      whyItMatters: field("Why it matters"),
      suggestion: field("Suggestion"),
      confidence: parseInt(field("Confidence"), 10) || 0,
      checked: match[1] === "x",
    });
  }

  return {
    findings,
    blockerCount: findings.filter(f => f.severity === "BLOCKER").length,
    issueCount: findings.filter(f => f.severity === "ISSUE").length,
    suggestionCount: findings.filter(f => f.severity === "SUGGESTION").length,
    nitCount: findings.filter(f => f.severity === "NIT").length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/review-parser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/review-parser.ts src/shared/review-parser.test.ts
git commit -m "feat: review.md parser for structured findings UI"
```

---

## Phase 3: Project Model + Triage

### Task 10: Project data model

**Files:**
- Create: `src/shared/project-model.ts`
- Test: `src/shared/project-model.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// src/shared/project-model.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createProject, addTaskToProject, removeTaskFromProject, getProject, getAllProjects, updateProjectContext, detectProjectFromSource, _resetForTest, type Project } from "./project-model";

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
    updateProjectContext(proj.id, { linearTickets: ["VEC-24"], prs: ["https://github.com/repo/pull/1"] });
    const updated = getProject(proj.id);
    expect(updated?.context.linearTickets).toContain("VEC-24");
    expect(updated?.context.prs).toContain("https://github.com/repo/pull/1");
  });

  it("should detect project from Linear project ID", () => {
    createProject("Existing Project", "linear", "proj-abc");
    const found = detectProjectFromSource("linear", "proj-abc");
    expect(found?.name).toBe("Existing Project");
  });

  it("should detect project from Slack #proj-* channel", () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/project-model.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement project-model.ts**

```typescript
// src/shared/project-model.ts

export interface Project {
  id: string;
  name: string;
  source: "linear" | "slack" | "ai";
  sourceId?: string;
  tasks: string[];
  context: {
    linearTickets: string[];
    slackChannels: string[];
    prs: string[];
    notionDocs: string[];
  };
  createdAt: string;
  updatedAt: string;
}

const projects = new Map<string, Project>();

export function createProject(name: string, source: Project["source"], sourceId?: string): Project {
  const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const project: Project = {
    id, name, source, sourceId, tasks: [],
    context: { linearTickets: [], slackChannels: [], prs: [], notionDocs: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  projects.set(id, project);
  return project;
}

export function getProject(id: string): Project | null {
  return projects.get(id) ?? null;
}

export function getAllProjects(): Project[] {
  return Array.from(projects.values());
}

export function addTaskToProject(projectId: string, taskId: string): void {
  const proj = projects.get(projectId);
  if (proj && !proj.tasks.includes(taskId)) {
    proj.tasks.push(taskId);
    proj.updatedAt = new Date().toISOString();
  }
}

export function removeTaskFromProject(projectId: string, taskId: string): void {
  const proj = projects.get(projectId);
  if (proj) {
    proj.tasks = proj.tasks.filter(t => t !== taskId);
    proj.updatedAt = new Date().toISOString();
  }
}

export function updateProjectContext(projectId: string, ctx: Partial<Project["context"]>): void {
  const proj = projects.get(projectId);
  if (!proj) return;
  if (ctx.linearTickets) {
    for (const t of ctx.linearTickets) if (!proj.context.linearTickets.includes(t)) proj.context.linearTickets.push(t);
  }
  if (ctx.slackChannels) {
    for (const c of ctx.slackChannels) if (!proj.context.slackChannels.includes(c)) proj.context.slackChannels.push(c);
  }
  if (ctx.prs) {
    for (const p of ctx.prs) if (!proj.context.prs.includes(p)) proj.context.prs.push(p);
  }
  if (ctx.notionDocs) {
    for (const d of ctx.notionDocs) if (!proj.context.notionDocs.includes(d)) proj.context.notionDocs.push(d);
  }
  proj.updatedAt = new Date().toISOString();
}

export function detectProjectFromSource(source: string, sourceId: string): Project | null {
  for (const proj of projects.values()) {
    if (proj.source === source && proj.sourceId === sourceId) return proj;
  }
  return null;
}

export function _resetForTest(): void {
  projects.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/project-model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/project-model.ts src/shared/project-model.test.ts
git commit -m "feat: project data model with CRUD and source detection"
```

---

### Task 11: Repo detection

**Files:**
- Create: `src/shared/repo-detection.ts`
- Test: `src/shared/repo-detection.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// src/shared/repo-detection.test.ts
import { describe, it, expect } from "vitest";
import { detectRepo, type RepoMapping } from "./repo-detection";

const MAPPINGS: RepoMapping[] = [
  { pattern: "VEC-*", repoPath: "/Users/kieran/repos/monolith-django" },
  { pattern: "DX-*", repoPath: "/Users/kieran/repos/claude-skills" },
  { pattern: "#monolith-*", repoPath: "/Users/kieran/repos/monolith-django" },
  { pattern: "monte-carlo-data/monolith-*", repoPath: "/Users/kieran/repos/monolith-django" },
];

describe("Repo Detection", () => {
  it("should detect repo from Linear ticket prefix", () => {
    const repo = detectRepo({ title: "VEC-24: Fix chat", links: [] }, MAPPINGS);
    expect(repo).toBe("/Users/kieran/repos/monolith-django");
  });

  it("should detect repo from DX ticket prefix", () => {
    const repo = detectRepo({ title: "DX-100: Add skill", links: [] }, MAPPINGS);
    expect(repo).toBe("/Users/kieran/repos/claude-skills");
  });

  it("should detect repo from GitHub PR URL", () => {
    const repo = detectRepo({
      title: "Review PR",
      links: [{ type: "github_pr", label: "PR #42", url: "https://github.com/monte-carlo-data/monolith-django/pull/42" }],
    }, MAPPINGS);
    expect(repo).toBe("/Users/kieran/repos/monolith-django");
  });

  it("should detect repo from Slack channel name", () => {
    const repo = detectRepo({
      title: "Check thread",
      links: [{ type: "slack_channel", label: "#monolith-prs", url: "https://slack.com/archives/C123" }],
    }, MAPPINGS);
    expect(repo).toBe("/Users/kieran/repos/monolith-django");
  });

  it("should return null when no mapping matches", () => {
    const repo = detectRepo({ title: "Random task", links: [] }, MAPPINGS);
    expect(repo).toBeNull();
  });

  it("should return null with empty mappings", () => {
    const repo = detectRepo({ title: "VEC-24: Fix chat", links: [] }, []);
    expect(repo).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/repo-detection.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement repo-detection.ts**

```typescript
// src/shared/repo-detection.ts

export interface RepoMapping {
  pattern: string;   // "VEC-*", "#monolith-*", "monte-carlo-data/repo-*"
  repoPath: string;  // absolute path
}

interface DetectionInput {
  title: string;
  links: Array<{ type: string; label: string; url: string }>;
}

/**
 * Detect which repo a task belongs to based on title, links, and configured mappings.
 * Returns the absolute path to the repo, or null if no match.
 */
export function detectRepo(input: DetectionInput, mappings: RepoMapping[]): string | null {
  if (!mappings.length) return null;

  for (const mapping of mappings) {
    const pattern = mapping.pattern;

    // Ticket prefix pattern: "VEC-*" matches "VEC-24" in title
    if (pattern.match(/^[A-Z]+-\*$/)) {
      const prefix = pattern.replace("-*", "-");
      if (input.title.includes(prefix)) return mapping.repoPath;
    }

    // Slack channel pattern: "#monolith-*" matches label "#monolith-prs"
    if (pattern.startsWith("#")) {
      const channelPrefix = pattern.replace("*", "");
      for (const link of input.links) {
        if (link.label.startsWith(channelPrefix)) return mapping.repoPath;
      }
    }

    // GitHub org/repo pattern: "monte-carlo-data/monolith-*" matches PR URLs
    if (pattern.includes("/") && !pattern.startsWith("#")) {
      const [org, repoPrefix] = pattern.split("/");
      const prefix = repoPrefix.replace("*", "");
      for (const link of input.links) {
        if (link.url.includes(`github.com/${org}/${prefix}`)) return mapping.repoPath;
      }
    }
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/repo-detection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/repo-detection.ts src/shared/repo-detection.test.ts
git commit -m "feat: repo detection from ticket prefix, channel name, and PR URL"
```

---

### Task 12: Update triage skill for projects + task splitting

**Files:**
- Modify: `.claude/skills/triage-rules/SKILL.md`
- Modify: `.claude/skills/triage-output-format/SKILL.md`
- Modify: `src/main/notifications/poll-service.ts` (triage parsing)

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/notifications/triage-projects.test.ts
import { describe, it, expect } from "vitest";
import { parseTriageResponse } from "../../shared/triage-parser";

describe("Triage Output — Projects", () => {
  it("should parse projects array from triage response", () => {
    const response = JSON.stringify({
      actionable: [
        { source: "linear", title: "VEC-24: Chat history", project: "Perf Agent Chat", project_source: "linear", project_source_id: "proj-abc", priority: "high", confidence: 8, task_type: "implementation", summary: "test", links: [], author: "Yael", action_needed: "implement" },
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
        { source: "linear", title: "VEC-24: Add history", project: "Perf Agent", priority: "high", confidence: 8, task_type: "implementation", summary: "a", links: [], author: "Yael", action_needed: "build" },
        { source: "linear", title: "VEC-24: Port UI", project: "Perf Agent", priority: "high", confidence: 8, task_type: "implementation", summary: "b", links: [], author: "Yael", action_needed: "build" },
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/notifications/triage-projects.test.ts`
Expected: FAIL — `parseTriageResponse` doesn't exist

- [ ] **Step 3: Create triage-parser.ts**

Extract the triage response parsing from `poll-service.ts` into a shared module `src/shared/triage-parser.ts`:

```typescript
// src/shared/triage-parser.ts

export interface TriageProject {
  name: string;
  source: string;
  source_id?: string;
  related_channels?: string[];
  related_tickets?: string[];
}

export interface TriageActionableItem {
  source: string;
  title: string;
  summary: string;
  priority: string;
  confidence: number;
  task_type: string;
  links: Array<{ type: string; label: string; url: string }>;
  author: string;
  action_needed: string;
  project?: string;
  project_source?: string;
  project_source_id?: string;
}

export interface TriageUpdateItem {
  existing_id: string;
  changes: Record<string, unknown>;
  timeline_event?: string;
}

export interface TriageResult {
  actionable: TriageActionableItem[];
  updates: TriageUpdateItem[];
  follow_up: TriageActionableItem[];
  skipped: Array<{ source?: string; title?: string; reason?: string; url?: string }>;
  projects: TriageProject[];
}

export function parseTriageResponse(raw: string): TriageResult {
  const empty: TriageResult = { actionable: [], updates: [], follow_up: [], skipped: [], projects: [] };

  let cleaned = raw.trim();
  // Strip markdown code blocks
  cleaned = cleaned.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "");

  const objMatch = cleaned.match(/\{[\s\S]*"actionable"[\s\S]*\}/);
  if (!objMatch) return empty;

  try {
    const parsed = JSON.parse(objMatch[0]);
    return {
      actionable: Array.isArray(parsed.actionable) ? parsed.actionable : [],
      updates: Array.isArray(parsed.updates) ? parsed.updates : [],
      follow_up: Array.isArray(parsed.follow_up) ? parsed.follow_up : [],
      skipped: Array.isArray(parsed.skipped) ? parsed.skipped : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    };
  } catch {
    return empty;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/notifications/triage-projects.test.ts`
Expected: PASS

- [ ] **Step 5: Update triage skills with project instructions**

Add to `.claude/skills/triage-rules/SKILL.md`:

```markdown
## Project Grouping

Group related tasks into projects:
- Linear tickets in the same Linear project → one project
- Tasks from Slack `#proj-*` or `#project-*` channels → one project per channel
- Multiple tickets/threads about the same topic → AI-detected project
- If a ticket has a parent issue or belongs to an initiative, that's the project

## Task Splitting

When a ticket describes multiple independent deliverables, split it into separate tasks under the same project. Each task should be a single `/start-work` → `/hack` → `/ship` cycle.
```

Add to `.claude/skills/triage-output-format/SKILL.md` the `projects` array and `project` field on actionable items (as shown in the spec).

- [ ] **Step 6: Commit**

```bash
git add src/shared/triage-parser.ts src/main/notifications/triage-projects.test.ts .claude/skills/triage-rules/SKILL.md .claude/skills/triage-output-format/SKILL.md
git commit -m "feat: triage parser with project grouping and task splitting"
```

---

## Phase 4: Projects Page + Structured UI Components

### Task 13: Projects page — list view

**Files:**
- Create: `src/renderer/pages/projects.tsx`
- Modify: `src/renderer/routes.tsx`
- Modify: `src/renderer/components/AppHeader.tsx`

This task creates the Projects page list view and wires up routing. The detail view with per-project kanban is Task 14.

- [ ] **Step 1: Create projects page with list view**

Create `src/renderer/pages/projects.tsx` with:
- Fetches all projects via a new IPC call `projects:get-all`
- Shows a card for each project: name, source badge, task count, progress bar (done/total), latest activity timestamp
- Click on a card navigates to `/projects/:projectId`
- Uses AppHeader with consistent nav

- [ ] **Step 2: Add route and nav tab**

In `src/renderer/routes.tsx`, add:
```typescript
import ProjectsPage from "./pages/projects";
// In routes:
{ path: "/projects", element: <ProjectsPage /> },
{ path: "/projects/:projectId", element: <ProjectsPage /> },
```

In `src/renderer/components/AppHeader.tsx`, add "Projects" tab between "Inbox" and "Schedule".

- [ ] **Step 3: Add IPC handlers**

In `src/main/index.ts`:
```typescript
import { getAllProjects, getProject } from "../shared/project-model";
ipcMain.handle("projects:get-all", () => getAllProjects());
ipcMain.handle("projects:get", (_e, id: string) => getProject(id));
```

In `src/preload/preload.ts`:
```typescript
getAllProjects: () => ipcRenderer.invoke("projects:get-all"),
getProject: (id: string) => ipcRenderer.invoke("projects:get", id),
```

- [ ] **Step 4: Run TypeScript check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/projects.tsx src/renderer/routes.tsx src/renderer/components/AppHeader.tsx src/main/index.ts src/preload/preload.ts
git commit -m "feat: projects page with list view and routing"
```

---

### Task 14: Start Work modal — repo confirmation UI

**Files:**
- Create: `src/renderer/components/StartWorkModal.tsx`

- [ ] **Step 1: Create StartWorkModal component**

A modal shown when the user clicks "Start Work" on a task. Contains:
- **Detected repo** (from `detectRepo()`): shown as a dropdown of configured repos, with the detected one pre-selected. If no match, shows "Select a repo..."
- **Branch name**: auto-derived from ticket ID, editable text input
- **Scope override**: Small/Medium/Large radio buttons (optional, can leave as "Auto")
- **Confirm** button: triggers `window.deck.runSkill({ skill: "/start-work", args: ticketId, repoPath, ... })`
- **Cancel** button

Uses Mantine's `Modal`, `Select`, `TextInput`, `Radio`, `Button`, `Group`.

- [ ] **Step 2: Wire up to kanban stage transition**

In `notifications.tsx`, when "Start Work" is clicked on an `implementation` or `investigation` task:
- Open StartWorkModal instead of directly calling prepareWorkPlan
- On confirm: move card to `start_work` stage, invoke skill runner

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/StartWorkModal.tsx src/renderer/pages/notifications.tsx
git commit -m "feat: Start Work modal with repo confirmation and branch preview"
```

---

### Task 15: Plan view component

**Files:**
- Create: `src/renderer/components/PlanView.tsx`

- [ ] **Step 1: Create PlanView component**

A structured rendering of `ParsedPlan` (from `plan-parser.ts`):
- **Header**: ticket badge, scope badge (Small/Medium/Large with color), branch name (monospace, copyable)
- **Progress bar**: X of Y tasks complete
- **Context section**: collapsible, shows relevant files as a table
- **Phases**: collapsible accordion. Each phase shows:
  - Phase name + task count
  - Task checklist with checkboxes (checked = green, unchecked = default)
  - Each task shows commit message in monospace
- **Actions bar**: "Start Hack" button (primary), "Review Plan" button (outline), "Edit in Editor" button (opens plan.md in VS Code via `code` CLI)

Props: `plan: ParsedPlan`, `onStartHack: () => void`, `onReviewPlan: () => void`

- [ ] **Step 2: Integrate into task detail pane**

In the `DetailPane` component in `notifications.tsx`, when a task is in `start_work` stage and has a plan:
- Read `.work/<slug>/plan.md` from disk (via new IPC: `skill:read-plan`)
- Parse with `parsePlanMd()`
- Render `<PlanView plan={parsed} onStartHack={...} onReviewPlan={...} />`

- [ ] **Step 3: Add IPC for reading plan files**

```typescript
// In index.ts:
ipcMain.handle("skill:read-plan", async (_e, repoPath: string, workSlug: string) => {
  const planPath = path.join(repoPath, ".work", workSlug, "plan.md");
  try { return fs.readFileSync(planPath, "utf-8"); } catch { return null; }
});
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PlanView.tsx src/renderer/pages/notifications.tsx src/main/index.ts src/preload/preload.ts
git commit -m "feat: structured plan view component with phases, tasks, and progress"
```

---

### Task 16: Review findings component

**Files:**
- Create: `src/renderer/components/ReviewView.tsx`

- [ ] **Step 1: Create ReviewView component**

A structured rendering of `ParsedReview` (from `review-parser.ts`):
- **Summary bar**: BLOCKER count (red), ISSUE count (orange), SUGGESTION count (blue), NIT count (gray)
- **Findings list**: card per finding with:
  - Severity badge (colored)
  - File reference (clickable → opens in browser/editor)
  - Reviewer name badge
  - Description text
  - Suggestion text (in a code block or quote)
  - Confidence percentage
  - Checkbox: checked = will fix, unchecked = skip
- **Actions bar**: "Fix Selected" button, "Post to PR" button

Props: `review: ParsedReview`, `onFixSelected: (findingIds: string[]) => void`, `onPostToPR: () => void`

- [ ] **Step 2: Integrate into task detail pane**

When a task is in `code_review` stage:
- Read `.work/<slug>/reviews/*.md` from disk
- Parse each with `parseReviewMd()`
- Render `<ReviewView review={merged} ... />`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ReviewView.tsx src/renderer/pages/notifications.tsx
git commit -m "feat: structured review findings component with severity badges"
```

---

### Task 17: Final integration — full test suite + TypeScript

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL tests pass

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS — no errors

- [ ] **Step 3: Manual smoke test**

1. Start the app
2. Check Settings → "MC Skills" section shows all skills installed
3. Go to Inbox → click "Start Work" on an implementation task
4. Confirm repo in modal → agent runs `/start-work`
5. See structured plan view with phases and tasks
6. Verify activity log shows real-time agent events

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: MC skills integration — skill runner, parsers, projects, structured UI"
```
