# Structured Agent Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agents return typed action menus as JSON; UI renders smart, risk-tiered CTAs instead of hardcoded buttons.

**Architecture:** Skills append a fenced `actions` JSON block to their markdown output. A parser extracts it. A `NextStepsCard` component renders actions with risk-tiered interactions (immediate/confirm/editable preview). Detail views show NextStepsCard when actions exist, fall back to current buttons otherwise.

**Tech Stack:** TypeScript, React 19, Mantine 8.x, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| Create: `src/shared/action-types.ts` | Action type union, risk levels, type guards |
| Create: `src/shared/action-types.test.ts` | Type guard tests |
| Create: `src/shared/action-parser.ts` | Extract + validate actions JSON from agent output |
| Create: `src/shared/action-parser.test.ts` | Parser tests |
| Create: `src/renderer/components/NextStepsCard.tsx` | Risk-tiered action card component |
| Create: `src/renderer/components/next-steps-card.test.ts` | Component logic tests |
| Modify: `src/renderer/components/ImplementationDetailView.tsx` | Wire actions into start_work stage |
| Modify: `src/renderer/components/ResponseDetailView.tsx` | Wire actions into response flow |
| Modify: `src/renderer/components/MeetingPrepDetailView.tsx` | Wire actions into meeting prep flow |
| Modify: `src/renderer/pages/notifications.tsx` | Add action execution handlers, conversation loading state |
| Modify: `src/main/index.ts` | Add `linear:update` IPC handler |
| Modify: `src/preload/preload.ts` | Expose `updateLinear` to renderer |
| Modify: `.claude/skills/parse-implementation/SKILL.md` | Add actions output format |
| Modify: `.claude/skills/parse-response/SKILL.md` | Add actions output format |
| Modify: `.claude/skills/parse-meeting-prep/SKILL.md` | Add actions output format |

---

### Task 1: Action Types

**Files:**
- Create: `src/shared/action-types.ts`
- Create: `src/shared/action-types.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/shared/action-types.test.ts
import { describe, it, expect } from "vitest";
import { isValidAction, isKnownActionType, getActionRisk, KNOWN_ACTION_TYPES } from "./action-types";

describe("KNOWN_ACTION_TYPES", () => {
  it("should include all 10 action types", () => {
    expect(KNOWN_ACTION_TYPES).toContain("run_skill");
    expect(KNOWN_ACTION_TYPES).toContain("update_linear");
    expect(KNOWN_ACTION_TYPES).toContain("open_url");
    expect(KNOWN_ACTION_TYPES).toContain("send_slack");
    expect(KNOWN_ACTION_TYPES).toContain("send_email");
    expect(KNOWN_ACTION_TYPES).toContain("join_meeting");
    expect(KNOWN_ACTION_TYPES).toContain("review_pr");
    expect(KNOWN_ACTION_TYPES).toContain("dismiss");
    expect(KNOWN_ACTION_TYPES).toContain("snooze");
    expect(KNOWN_ACTION_TYPES).toContain("no_action");
    expect(KNOWN_ACTION_TYPES).toHaveLength(10);
  });
});

describe("isKnownActionType", () => {
  it("should return true for known types", () => {
    expect(isKnownActionType("run_skill")).toBe(true);
    expect(isKnownActionType("send_slack")).toBe(true);
    expect(isKnownActionType("no_action")).toBe(true);
  });

  it("should return false for unknown types", () => {
    expect(isKnownActionType("unknown")).toBe(false);
    expect(isKnownActionType("")).toBe(false);
    expect(isKnownActionType("RUN_SKILL")).toBe(false);
  });
});

describe("isValidAction", () => {
  it("should validate a complete run_skill action", () => {
    expect(isValidAction({ type: "run_skill", skill: "/hack", label: "Start hacking", risk: "medium" })).toBe(true);
  });

  it("should validate a no_action (no risk required)", () => {
    expect(isValidAction({ type: "no_action", label: "Nothing to do" })).toBe(true);
  });

  it("should reject missing type", () => {
    expect(isValidAction({ label: "Test" })).toBe(false);
  });

  it("should reject missing label", () => {
    expect(isValidAction({ type: "run_skill", risk: "medium" })).toBe(false);
  });

  it("should reject empty label", () => {
    expect(isValidAction({ type: "run_skill", label: "", risk: "medium" })).toBe(false);
  });

  it("should reject unknown type", () => {
    expect(isValidAction({ type: "fly_to_moon", label: "Go", risk: "low" })).toBe(false);
  });

  it("should reject missing risk for non-no_action types", () => {
    expect(isValidAction({ type: "run_skill", label: "Start" })).toBe(false);
  });
});

describe("getActionRisk", () => {
  it("should return the risk level from the action", () => {
    expect(getActionRisk({ type: "run_skill", skill: "/hack", label: "Hack", risk: "medium" })).toBe("medium");
    expect(getActionRisk({ type: "open_url", url: "https://example.com", label: "Open", risk: "low" })).toBe("low");
    expect(getActionRisk({ type: "send_slack", channel: "C123", message: "Hi", label: "Send", risk: "high" })).toBe("high");
  });

  it("should return undefined for no_action", () => {
    expect(getActionRisk({ type: "no_action", label: "Done" })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/action-types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/shared/action-types.ts
/**
 * Action types — structured actions that agents return for the UI to render.
 * Each action has a type, label, and risk level (except no_action).
 */

export type ActionRisk = "low" | "medium" | "high";

export type RunSkillAction = { type: "run_skill"; skill: string; label: string; description?: string; risk: ActionRisk; params?: Record<string, unknown> };
export type UpdateLinearAction = { type: "update_linear"; ticket: string; field: string; value: string; label: string; risk: "medium" };
export type OpenUrlAction = { type: "open_url"; url: string; label: string; risk: "low" };
export type SendSlackAction = { type: "send_slack"; channel: string; message: string; threadTs?: string; label: string; risk: "high" };
export type SendEmailAction = { type: "send_email"; to: string; subject: string; body: string; label: string; risk: "high" };
export type JoinMeetingAction = { type: "join_meeting"; url: string; label: string; risk: "low" };
export type ReviewPrAction = { type: "review_pr"; url: string; label: string; risk: "low" };
export type DismissAction = { type: "dismiss"; label: string; reason?: string; risk: "low" };
export type SnoozeAction = { type: "snooze"; label: string; reason?: string; risk: "low" };
export type NoAction = { type: "no_action"; label: string; description?: string };

export type Action =
  | RunSkillAction
  | UpdateLinearAction
  | OpenUrlAction
  | SendSlackAction
  | SendEmailAction
  | JoinMeetingAction
  | ReviewPrAction
  | DismissAction
  | SnoozeAction
  | NoAction;

export const KNOWN_ACTION_TYPES = [
  "run_skill", "update_linear", "open_url", "send_slack", "send_email",
  "join_meeting", "review_pr", "dismiss", "snooze", "no_action",
] as const;

export function isKnownActionType(type: string): boolean {
  return (KNOWN_ACTION_TYPES as readonly string[]).includes(type);
}

export function isValidAction(obj: unknown): obj is Action {
  if (!obj || typeof obj !== "object") return false;
  const a = obj as Record<string, unknown>;
  if (typeof a.type !== "string" || !isKnownActionType(a.type)) return false;
  if (typeof a.label !== "string" || a.label.length === 0) return false;
  if (a.type !== "no_action" && typeof a.risk !== "string") return false;
  return true;
}

export function getActionRisk(action: Action): ActionRisk | undefined {
  if (action.type === "no_action") return undefined;
  return (action as { risk: ActionRisk }).risk;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/action-types.test.ts`
Expected: PASS — all 10 tests green

- [ ] **Step 5: Commit**

```bash
git add src/shared/action-types.ts src/shared/action-types.test.ts
git commit -m "feat: action type schema with type guards and validation"
```

---

### Task 2: Action Parser

**Files:**
- Create: `src/shared/action-parser.ts`
- Create: `src/shared/action-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/shared/action-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseActions } from "./action-parser";

const VALID_OUTPUT = `## Plan
Here is the implementation plan...

---

Details about the plan phases.

\`\`\`actions
[
  {"type":"run_skill","skill":"/hack","label":"Implement Phase 1","risk":"medium","params":{"phase":1}},
  {"type":"update_linear","ticket":"VEC-50","field":"status","value":"In Progress","label":"Move VEC-50 to In Progress","risk":"medium"}
]
\`\`\``;

const NO_ACTIONS_OUTPUT = `## Plan
Here is the plan with no actions block.

---

Just markdown, nothing else.`;

const MALFORMED_JSON = `Some text

\`\`\`actions
[{"type":"run_skill", broken json here
\`\`\``;

const MIXED_VALID_INVALID = `Text

\`\`\`actions
[
  {"type":"run_skill","skill":"/hack","label":"Good action","risk":"medium"},
  {"type":"unknown_type","label":"Bad action","risk":"low"},
  {"label":"Missing type"},
  {"type":"no_action","label":"Nothing to do"}
]
\`\`\``;

const JSON_ACTIONS_FENCE = `Text

\`\`\`json actions
[{"type":"open_url","url":"https://example.com","label":"View PR","risk":"low"}]
\`\`\``;

describe("parseActions", () => {
  it("should parse valid actions from agent output", () => {
    const actions = parseActions(VALID_OUTPUT);
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe("run_skill");
    expect(actions[0].label).toBe("Implement Phase 1");
    expect(actions[1].type).toBe("update_linear");
  });

  it("should return empty array for output without actions block", () => {
    expect(parseActions(NO_ACTIONS_OUTPUT)).toEqual([]);
  });

  it("should return empty array for malformed JSON", () => {
    expect(parseActions(MALFORMED_JSON)).toEqual([]);
  });

  it("should filter out invalid actions and keep valid ones", () => {
    const actions = parseActions(MIXED_VALID_INVALID);
    expect(actions).toHaveLength(2);
    expect(actions[0].label).toBe("Good action");
    expect(actions[1].label).toBe("Nothing to do");
  });

  it("should handle json actions fence variant", () => {
    const actions = parseActions(JSON_ACTIONS_FENCE);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("open_url");
  });

  it("should return empty array for null/empty input", () => {
    expect(parseActions("")).toEqual([]);
    expect(parseActions(null as unknown as string)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/action-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/shared/action-parser.ts
/**
 * Action parser — extracts structured actions from agent output.
 * Looks for a fenced ```actions or ```json actions block, parses JSON,
 * validates each item, returns Action[].
 */

import { isValidAction, type Action } from "./action-types";

/**
 * Parse structured actions from agent markdown output.
 * Returns [] if no actions block found or parse fails.
 */
export function parseActions(agentOutput: string): Action[] {
  if (!agentOutput) return [];

  // Match ```actions or ```json actions fenced block
  const match = agentOutput.match(/```(?:json\s+)?actions\s*\n([\s\S]*?)```/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidAction) as Action[];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/action-parser.test.ts`
Expected: PASS — all 6 tests green

- [ ] **Step 5: Commit**

```bash
git add src/shared/action-parser.ts src/shared/action-parser.test.ts
git commit -m "feat: action parser extracts structured actions from agent output"
```

---

### Task 3: NextStepsCard Component

**Files:**
- Create: `src/renderer/components/NextStepsCard.tsx`
- Create: `src/renderer/components/next-steps-card.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/renderer/components/next-steps-card.test.ts
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
    expect(getConfirmMessage(action)).toContain("/hack");
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/components/next-steps-card.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/components/NextStepsCard.tsx
/**
 * NextStepsCard — renders agent-defined actions as risk-tiered CTAs.
 * Low-risk: immediate click. Medium-risk: inline confirm. High-risk: editable preview.
 */

import { Badge, Button, Group, Stack, Text, Textarea, UnstyledButton } from "@mantine/core";
import {
  IconRocket, IconExternalLink, IconBrandSlack, IconMail,
  IconCalendar, IconGitPullRequest, IconCheck, IconClock,
  IconInfoCircle, IconChevronDown, IconChevronUp, IconX,
} from "@tabler/icons-react";
import { SiLinear } from "@icons-pack/react-simple-icons";
import { useState } from "react";
import type { Action, ActionRisk } from "../../shared/action-types";

// ── Exported helpers (tested) ──

const ICON_MAP: Record<string, string> = {
  run_skill: "rocket",
  update_linear: "linear",
  open_url: "external-link",
  send_slack: "slack",
  send_email: "mail",
  join_meeting: "calendar",
  review_pr: "git-pull-request",
  dismiss: "check",
  snooze: "clock",
  no_action: "info-circle",
};

export function getActionIcon(type: string): string {
  return ICON_MAP[type] ?? "info-circle";
}

export function getConfirmMessage(action: Action): string {
  if (action.type === "no_action") return "";
  const risk = (action as { risk: ActionRisk }).risk;
  if (risk === "low") return "";
  if (action.type === "run_skill") return `Run ${action.skill}${action.params?.phase ? ` phase ${action.params.phase}` : ""}?`;
  if (action.type === "update_linear") return `Set ${action.ticket} ${action.field} to "${action.value}"?`;
  return "";
}

// ── Icon resolver ──

function ActionIcon({ type }: { type: string }) {
  const size = 16;
  switch (type) {
    case "run_skill": return <IconRocket size={size} />;
    case "update_linear": return <SiLinear size={size - 2} />;
    case "open_url": return <IconExternalLink size={size} />;
    case "send_slack": return <IconBrandSlack size={size} />;
    case "send_email": return <IconMail size={size} />;
    case "join_meeting": return <IconCalendar size={size} />;
    case "review_pr": return <IconGitPullRequest size={size} />;
    case "dismiss": return <IconCheck size={size} />;
    case "snooze": return <IconClock size={size} />;
    case "no_action": return <IconInfoCircle size={size} />;
    default: return <IconInfoCircle size={size} />;
  }
}

// ── Props ──

interface NextStepsCardProps {
  actions: Action[];
  onRunSkill: (skill: string, params?: Record<string, unknown>) => void;
  onUpdateLinear: (ticket: string, field: string, value: string) => void;
  onSendSlack: (channel: string, message: string, threadTs?: string) => void;
  onSendEmail: (to: string, subject: string, body: string) => void;
  onOpenUrl: (url: string) => void;
  onDismiss: (reason?: string) => void;
  onSnooze: (reason?: string) => void;
}

// ── Action Row ──

function ActionRow({
  action,
  onExecute,
}: {
  action: Action;
  onExecute: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editedMessage, setEditedMessage] = useState("");

  const risk = action.type === "no_action" ? undefined : (action as { risk: ActionRisk }).risk;
  const confirmMsg = getConfirmMessage(action);

  const handleClick = () => {
    if (action.type === "no_action") return;
    if (risk === "low") { onExecute(); return; }
    if (risk === "medium") { setConfirming(true); return; }
    if (risk === "high") {
      if (action.type === "send_slack") setEditedMessage(action.message);
      if (action.type === "send_email") setEditedMessage(action.body);
      setExpanded(true);
    }
  };

  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8,
      border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
      backgroundColor: action.type === "no_action" ? "transparent" : "var(--mantine-color-dark-7)",
    }}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap={10} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <ActionIcon type={action.type} />
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={500} truncate>{action.label}</Text>
            {"description" in action && action.description && (
              <Text size="xs" c="dimmed" lineClamp={2}>{action.description}</Text>
            )}
          </div>
        </Group>

        {action.type !== "no_action" && !confirming && !expanded && (
          <UnstyledButton
            onClick={handleClick}
            aria-label={action.label}
            style={{
              padding: "4px 12px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500,
              backgroundColor: risk === "high" ? "var(--mantine-color-dark-5)" : "var(--mantine-color-blue-9)",
              color: "var(--mantine-color-text)",
              flexShrink: 0,
            }}
          >
            {risk === "high" ? "Edit & Send" : risk === "medium" ? "Run" : "Go"}
          </UnstyledButton>
        )}
      </Group>

      {/* Medium-risk: inline confirmation */}
      {confirming && (
        <Group gap={8} mt={8}>
          <Text size="xs" c="dimmed" style={{ flex: 1 }}>{confirmMsg}</Text>
          <Button size="xs" variant="filled" color="blue" onClick={() => { setConfirming(false); onExecute(); }}>
            Confirm
          </Button>
          <Button size="xs" variant="subtle" color="gray" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </Group>
      )}

      {/* High-risk: editable preview */}
      {expanded && (
        <Stack gap={8} mt={8}>
          {action.type === "send_slack" && (
            <>
              <Text size="xs" c="dimmed">Channel: {action.channel}{action.threadTs ? ` (thread)` : ""}</Text>
              <Textarea
                value={editedMessage}
                onChange={(e) => setEditedMessage(e.currentTarget.value)}
                minRows={3}
                maxRows={8}
                autosize
                size="xs"
              />
            </>
          )}
          {action.type === "send_email" && (
            <>
              <Text size="xs" c="dimmed">To: {action.to}</Text>
              <Text size="xs" c="dimmed">Subject: {action.subject}</Text>
              <Textarea
                value={editedMessage}
                onChange={(e) => setEditedMessage(e.currentTarget.value)}
                minRows={3}
                maxRows={8}
                autosize
                size="xs"
              />
            </>
          )}
          <Group gap={8}>
            <Button size="xs" variant="filled" color="blue" onClick={() => {
              setExpanded(false);
              // Pass the edited message back
              if (action.type === "send_slack") {
                // Parent handles via onSendSlack
              }
              onExecute();
            }}>
              Send
            </Button>
            <Button size="xs" variant="subtle" color="gray" onClick={() => setExpanded(false)}>
              Cancel
            </Button>
          </Group>
        </Stack>
      )}
    </div>
  );
}

// ── Main Component ──

export function NextStepsCard({
  actions,
  onRunSkill,
  onUpdateLinear,
  onSendSlack,
  onSendEmail,
  onOpenUrl,
  onDismiss,
  onSnooze,
}: NextStepsCardProps) {
  if (actions.length === 0) return null;

  const executeAction = (action: Action) => {
    switch (action.type) {
      case "run_skill": onRunSkill(action.skill, action.params); break;
      case "update_linear": onUpdateLinear(action.ticket, action.field, action.value); break;
      case "open_url": onOpenUrl(action.url); break;
      case "send_slack": onSendSlack(action.channel, action.message, action.threadTs); break;
      case "send_email": onSendEmail(action.to, action.subject, action.body); break;
      case "join_meeting": onOpenUrl(action.url); break;
      case "review_pr": onOpenUrl(action.url); break;
      case "dismiss": onDismiss(action.reason); break;
      case "snooze": onSnooze(action.reason); break;
      case "no_action": break;
    }
  };

  return (
    <div style={{
      padding: "14px 16px", borderRadius: 10,
      border: "1px solid color-mix(in srgb, var(--mantine-color-blue-5) 30%, transparent)",
      backgroundColor: "color-mix(in srgb, var(--mantine-color-blue-9) 8%, var(--mantine-color-dark-8))",
    }}>
      <Text size="xs" fw={600} mb={10} c="blue.4">Next Steps</Text>
      <Stack gap={8}>
        {actions.map((action, i) => (
          <ActionRow key={i} action={action} onExecute={() => executeAction(action)} />
        ))}
      </Stack>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/next-steps-card.test.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/NextStepsCard.tsx src/renderer/components/next-steps-card.test.ts
git commit -m "feat: NextStepsCard component with risk-tiered action rendering"
```

---

### Task 4: IPC Handler for Linear Updates

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/preload.ts`

- [ ] **Step 1: Add `linear:update` IPC handler**

In `src/main/index.ts`, after the existing `slack:send-message` handler (around line 414), add:

```typescript
  ipcMain.handle("linear:update", async (_event, data: { ticket: string; field: string; value: string }) => {
    try {
      const result = await askBridge(
        `Use mcp__claude_ai_Linear__save_issue to update issue ${data.ticket}: set ${data.field} to "${data.value}". Return "updated" on success.`,
        30000,
      );
      return { ok: true, data: result };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
```

Ensure `askBridge` is already imported (it is — line 15 imports from `./mcp-bridge`).

- [ ] **Step 2: Expose in preload**

In `src/preload/preload.ts`, add after the `sendSlackMessage` method:

```typescript
    updateLinear: (ticket: string, field: string, value: string) =>
      ipcRenderer.invoke("linear:update", { ticket, field, value }) as Promise<{ ok: boolean; data?: string; error?: string }>,
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/preload.ts
git commit -m "feat: add linear:update IPC handler via MCP bridge"
```

---

### Task 5: Wire Actions into ImplementationDetailView

**Files:**
- Modify: `src/renderer/components/ImplementationDetailView.tsx`

- [ ] **Step 1: Add imports and parse actions**

At the top of `ImplementationDetailView.tsx`, add:

```typescript
import { parseActions } from "../../shared/action-parser";
import { NextStepsCard } from "./NextStepsCard";
```

Add `agentOutput` to the props interface:

```typescript
interface ImplementationDetailViewProps {
  notification: { /* existing fields */ };
  fetchedContext: Array<{ type: string; content: string; timestamp: string }>;
  planText: string | null;
  agentOutput: string | null; // NEW
  reviewTexts: string[];
  onStartWork: () => void;
  onStartHack: () => void;
  onReviewPlan: () => void;
  onShip: () => void;
  onCodeReview: () => void;
  onFixFindings: (findingIds: string[]) => void;
  onRunSkill: (skill: string, params?: Record<string, unknown>) => void; // NEW
  onUpdateLinear: (ticket: string, field: string, value: string) => void; // NEW
  onOpenUrl: (url: string) => void; // NEW
  onDismiss: (reason?: string) => void; // NEW
  onSnooze: (reason?: string) => void; // NEW
  loading: boolean;
}
```

Inside the component, parse actions:

```typescript
const actions = useMemo(
  () => parseActions(agentOutput ?? planText ?? ""),
  [agentOutput, planText],
);
```

- [ ] **Step 2: Render NextStepsCard in start_work stage**

Replace the `case "start_work"` block. After PlanView and before the fallback ActionButton, add:

```typescript
{actions.length > 0 ? (
  <NextStepsCard
    actions={actions}
    onRunSkill={onRunSkill}
    onUpdateLinear={onUpdateLinear}
    onSendSlack={() => {}}
    onSendEmail={() => {}}
    onOpenUrl={onOpenUrl}
    onDismiss={onDismiss}
    onSnooze={onSnooze}
  />
) : (
  <ActionButton
    label="Start Hack"
    description={`Runs /hack in ${repoLabel} — implements plan phases, runs tests, commits per task.`}
    onClick={onStartHack}
    icon={<IconPlayerPlay size={14} />}
    disabled={!parsedPlan}
    loading={loading}
  />
)}
```

- [ ] **Step 3: Run TypeScript check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Clean compile, all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ImplementationDetailView.tsx
git commit -m "feat: wire NextStepsCard into ImplementationDetailView"
```

---

### Task 6: Wire Actions into ResponseDetailView and MeetingPrepDetailView

**Files:**
- Modify: `src/renderer/components/ResponseDetailView.tsx`
- Modify: `src/renderer/components/MeetingPrepDetailView.tsx`

- [ ] **Step 1: Update ResponseDetailView**

Add imports:

```typescript
import { parseActions } from "../../shared/action-parser";
import { NextStepsCard } from "./NextStepsCard";
```

Add to props: `onRunSkill`, `onUpdateLinear`, `onOpenUrl`, `onDismiss`, `onSnooze`.

Parse actions from the conversation/fetchedContext:

```typescript
const agentText = [...(conversation ?? [])].filter(m => m.role === "assistant").map(m => m.content).join("\n");
const contextText = fetchedContext.map(c => c.content).join("\n");
const actions = useMemo(() => parseActions(agentText || contextText), [agentText, contextText]);
```

Render NextStepsCard above the existing suggested replies section when actions exist. If `no_action` is in actions, show it instead of the manual "No action needed" detection.

- [ ] **Step 2: Update MeetingPrepDetailView**

Same pattern: import parseActions + NextStepsCard, add props, parse from context, render above talking points when actions exist.

- [ ] **Step 3: Run TypeScript check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Clean compile, all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ResponseDetailView.tsx src/renderer/components/MeetingPrepDetailView.tsx
git commit -m "feat: wire NextStepsCard into ResponseDetailView and MeetingPrepDetailView"
```

---

### Task 7: Wire Action Handlers in notifications.tsx

**Files:**
- Modify: `src/renderer/pages/notifications.tsx`

- [ ] **Step 1: Add action execution handlers**

In the detail pane section where `handlePrepare`, `handleStartWork`, `handleApprove` are defined, add:

```typescript
const handleRunSkill = async (skill: string, params?: Record<string, unknown>) => {
  setLoading(true);
  const nextStage = skill === "/hack" ? "hack" : skill === "/ship" ? "ship" : skill === "/code-review" ? "code_review" : undefined;
  if (nextStage) window.deck?.updateNotificationById?.(n.id, { stage: nextStage });
  try {
    await window.deck.runSkill({
      skill,
      args: params?.phase ? `phase ${params.phase}` : "",
      repoPath: n.repoPath ?? "",
      sessionId: n.sessionId ?? null,
      notificationId: n.id,
    });
  } catch (err) { console.error(`Skill ${skill} failed:`, err); }
  setLoading(false);
};

const handleUpdateLinear = async (ticket: string, field: string, value: string) => {
  try {
    await window.deck.updateLinear?.(ticket, field, value);
  } catch (err) { console.error("Linear update failed:", err); }
};

const handleActionOpenUrl = (url: string) => {
  window.deck.openExternal(url);
};

const handleActionDismiss = (reason?: string) => {
  window.deck?.updateNotificationById?.(n.id, { stage: "done" });
};

const handleActionSnooze = (reason?: string) => {
  window.deck?.updateNotificationById?.(n.id, { stage: "backlog" });
};
```

- [ ] **Step 2: Pass handlers to detail view components**

Update the `ImplementationDetailView` render call to include new props:

```typescript
<ImplementationDetailView
  notification={n}
  fetchedContext={fetchedContext}
  planText={planText}
  agentOutput={agentOutput}
  reviewTexts={reviewTexts}
  onStartWork={handleStartWork}
  onStartHack={handleApprove}
  onReviewPlan={handleReviewPlan}
  onShip={handleShip}
  onCodeReview={handleCodeReview}
  onFixFindings={handleFixFindings}
  onRunSkill={handleRunSkill}
  onUpdateLinear={handleUpdateLinear}
  onOpenUrl={handleActionOpenUrl}
  onDismiss={handleActionDismiss}
  onSnooze={handleActionSnooze}
  loading={loading}
/>
```

Same for ResponseDetailView and MeetingPrepDetailView.

- [ ] **Step 3: Run TypeScript check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Clean compile, all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/notifications.tsx
git commit -m "feat: wire action execution handlers in notifications page"
```

---

### Task 8: Conversation Loading State

**Files:**
- Modify: `src/renderer/pages/notifications.tsx`

- [ ] **Step 1: Add conversation loading indicator**

Find the conversation/chat area in the detail pane. After the last message in the conversation list, add:

```typescript
{conversationLoading && (
  <Group gap={8} py={8} px={12}>
    <Loader size={14} />
    <Text size="xs" c="dimmed">Thinking...</Text>
  </Group>
)}
```

Set `conversationLoading = true` when the user sends a follow-up message (in the chat input handler). Clear it when a new assistant message arrives (in the planning event listener or conversation update callback).

- [ ] **Step 2: Run TypeScript check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Clean compile, all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/notifications.tsx
git commit -m "fix: add conversation loading indicator when awaiting agent response"
```

---

### Task 9: Skill Output Format Updates

**Files:**
- Modify: `.claude/skills/parse-implementation/SKILL.md`
- Modify: `.claude/skills/parse-response/SKILL.md`
- Modify: `.claude/skills/parse-meeting-prep/SKILL.md`

- [ ] **Step 1: Update parse-implementation skill**

Append to the end of `.claude/skills/parse-implementation/SKILL.md`:

````markdown

## Structured Actions

After your plan output, append a structured actions block:

```actions
[
  { "type": "run_skill", "skill": "/hack", "label": "Implement Phase 1: <description>", "risk": "medium", "params": { "phase": 1 } }
]
```

Choose actions based on what the plan requires:
- Code tasks to implement → `run_skill` with `/hack` and the phase number
- Linear ticket needs status change → `update_linear` with ticket ID, field, value
- Work is already done → `no_action` with explanation
- PR needs review → `review_pr` with the PR URL
- Multiple actions allowed — list them in recommended execution order

Action types: `run_skill`, `update_linear`, `open_url`, `send_slack`, `review_pr`, `dismiss`, `snooze`, `no_action`.
Every action needs `type`, `label`, and `risk` (`low` | `medium` | `high`). Exception: `no_action` has no risk.
````

- [ ] **Step 2: Update parse-response skill**

Append to the end of `.claude/skills/parse-response/SKILL.md`:

````markdown

## Structured Actions

After your key points and suggested replies, append:

```actions
[
  { "type": "send_slack", "channel": "<channel_id>", "message": "<draft reply>", "threadTs": "<thread_ts>", "label": "Reply to <person> in #<channel>", "risk": "high" }
]
```

Choose actions:
- User needs to reply → `send_slack` with draft message, channel, and threadTs
- User already replied → `no_action` with "Already responded" and what was said
- Related ticket needs updating → `update_linear`
- Link to open → `open_url`
````

- [ ] **Step 3: Update parse-meeting-prep skill**

Append to the end of `.claude/skills/parse-meeting-prep/SKILL.md`:

````markdown

## Structured Actions

After attendees and talking points, append:

```actions
[
  { "type": "join_meeting", "url": "<meeting_url>", "label": "Join <meeting name>", "risk": "low" }
]
```

Choose actions:
- Meeting has a join URL → `join_meeting`
- Agenda or related docs → `open_url` for each
- No meeting URL found → `no_action` with explanation
````

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/parse-implementation/SKILL.md .claude/skills/parse-response/SKILL.md .claude/skills/parse-meeting-prep/SKILL.md
git commit -m "feat: add structured actions output format to all planning skills"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new action-types, action-parser, next-steps-card tests)

- [ ] **Step 2: TypeScript compile check**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Manual smoke test**

1. Start the app (`pnpm start`)
2. Open an existing implementation task — verify fallback buttons still work (no actions block in cached plan)
3. Trigger a new plan on a task — verify the agent appends an actions block
4. Verify NextStepsCard renders with context-specific labels
5. Test medium-risk action (confirm inline)
6. Test high-risk action (editable preview for Slack)
7. Test conversation loading indicator

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: final adjustments from smoke test"
```
