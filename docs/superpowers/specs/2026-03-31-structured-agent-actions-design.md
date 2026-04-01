# Structured Agent Actions

## Problem

Agent outputs are free-text markdown with hardcoded, stage-specific action buttons in the UI. When a plan says "the only remaining step is updating the Linear ticket status," the user sees a generic "Start Hack" button. There's no way for the agent to communicate what it recommends the user do next, and no way for the UI to render context-aware CTAs.

Additionally, when the user follows up on a plan in the conversation area, there's no loading indicator — the message disappears into the void with no feedback until the agent responds.

## Solution

Every agent appends a structured `actions` JSON block to the end of its markdown output. A new parser extracts these actions. A new `NextStepsCard` component renders them as risk-tiered interactive CTAs in the detail pane. Agents own the action definitions; the UI just renders what it's given.

## Action Schema

All agents append a fenced block to their output:

````
```actions
[
  {
    "type": "run_skill",
    "skill": "/hack",
    "label": "Implement API endpoint",
    "description": "Phase 1: Create /v1/alerts endpoint with pagination",
    "risk": "medium",
    "params": { "phase": 1 }
  }
]
```
````

### Action Type Union

```typescript
// src/shared/action-types.ts

type ActionRisk = "low" | "medium" | "high";

type Action =
  | { type: "run_skill"; skill: string; label: string; description?: string; risk: ActionRisk; params?: Record<string, unknown> }
  | { type: "update_linear"; ticket: string; field: string; value: string; label: string; risk: "medium" }
  | { type: "open_url"; url: string; label: string; risk: "low" }
  | { type: "send_slack"; channel: string; message: string; threadTs?: string; label: string; risk: "high" }
  | { type: "send_email"; to: string; subject: string; body: string; label: string; risk: "high" }
  | { type: "join_meeting"; url: string; label: string; risk: "low" }
  | { type: "review_pr"; url: string; label: string; risk: "low" }
  | { type: "dismiss"; label: string; reason?: string; risk: "low" }
  | { type: "snooze"; label: string; reason?: string; risk: "low" }
  | { type: "no_action"; label: string; description?: string }
```

Every action has `type` and `label`. All except `no_action` have `risk`. The `label` is agent-authored and context-specific — this is what the user sees on the button.

### Known Action Types

| Type | Risk | Example Label | Interaction |
|------|------|---------------|-------------|
| `run_skill` | medium | "Implement Phase 1: API endpoint" | Confirm inline |
| `update_linear` | medium | "Move VEC-50 to In Review" | Confirm inline |
| `open_url` | low | "View PR #1234" | Click opens browser |
| `send_slack` | high | "Reply to Yael in #team-vector" | Editable preview |
| `send_email` | high | "Reply to onboarding thread" | Editable preview |
| `join_meeting` | low | "Join standup at 10:00" | Click opens link |
| `review_pr` | low | "Review PR #1234" | Click opens browser |
| `dismiss` | low | "Mark as done" | Click executes |
| `snooze` | low | "Move to backlog" | Click executes |
| `no_action` | — | "Nothing left to do" | No button, info row |

## Parser

### File: `src/shared/action-parser.ts`

```typescript
function parseActions(agentOutput: string): Action[]
```

- Extracts fenced ` ```actions ` or ` ```json actions ` block from agent output
- Parses JSON array
- Validates: each item must have `type` (known value) and `label` (non-empty string)
- Filters out invalid items silently
- Returns `[]` if no block found or parse failure

Existing parsers (`parsePlanMd`, `parseResponseContext`, `parseMeetingPrepContext`) are unchanged — they handle the markdown body. `parseActions` handles only the appended actions block. Both run on the same output.

## NextStepsCard Component

### File: `src/renderer/components/NextStepsCard.tsx`

Renders between the stage content (plan view, response view, etc.) and the activity log in the detail pane.

### Layout

Bordered card with "Next Steps" header. Vertical list of action items, each containing:
- **Icon** — derived from action type (rocket for `run_skill`, Linear logo for `update_linear`, Slack logo for `send_slack`, link icon for `open_url`, calendar for `join_meeting`, check for `dismiss`, clock for `snooze`)
- **Label** — agent-authored primary text
- **Description** — optional secondary text below label
- **Interaction** — right-aligned, risk-tiered

### Risk-Tiered Interactions

**Low risk** (`open_url`, `join_meeting`, `review_pr`, `dismiss`, `snooze`):
- Single click executes immediately
- No confirmation step

**Medium risk** (`run_skill`, `update_linear`):
- Click shows inline confirmation: "Run /hack phase 1 in monolith-django?" with Confirm / Cancel
- Confirm executes, Cancel collapses

**High risk** (`send_slack`, `send_email`):
- Click expands the item to show editable preview
- For `send_slack`: textarea with pre-filled message, channel display, Send button
- For `send_email`: to/subject/body fields, Send button
- User can edit before sending

### `no_action` rendering

Muted info row with checkmark icon and description. No button. Signals the task is complete or needs no further work.

### Empty state

If `actions` is `[]` (no actions block found), the NextStepsCard does not render. Current hardcoded stage buttons remain as fallback. This provides backward compatibility with existing cached plans and MC shared skills (`/hack`, `/ship`, `/code-review`) that won't have actions blocks.

### Props

```typescript
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
```

## Skill Updates

Each Claude Deck skill SKILL.md that produces output gets an appendix:

### `parse-implementation/SKILL.md`

Append to output format rules:

```
After your plan, append a structured actions block:

\`\`\`actions
[{ "type": "...", "label": "...", "risk": "...", ... }]
\`\`\`

Choose actions based on what the plan requires:
- If there are code tasks to implement → run_skill with /hack
- If a Linear ticket needs a status change → update_linear
- If the work is already done → no_action with explanation
- If a PR needs review → review_pr with URL
- Multiple actions allowed — list them in execution order
```

### `parse-response/SKILL.md`

Append to output format rules:

```
After your key points and suggested replies, append:

\`\`\`actions
[{ "type": "...", "label": "...", "risk": "...", ... }]
\`\`\`

Choose actions:
- If user needs to reply → send_slack with draft message, channel, threadTs
- If user already replied → no_action with "Already responded" explanation
- If a related ticket needs updating → update_linear
```

### `parse-meeting-prep/SKILL.md`

Append to output format rules:

```
After attendees and talking points, append:

\`\`\`actions
[{ "type": "...", "label": "...", "risk": "...", ... }]
\`\`\`

Choose actions:
- join_meeting with the meeting URL
- open_url for agenda docs, related tickets
- If no meeting URL found → no_action
```

### Shared MC skills (`/hack`, `/ship`, `/code-review`)

These are not modified — they're shared across Monte Carlo. The detail view falls back to hardcoded buttons when no actions block is present. This is acceptable because at those stages the next action is always deterministic (run the next skill in the pipeline).

## Detail View Wiring

Each detail view component follows the same pattern:

1. Receive `agentOutput: string` (the raw agent output)
2. Run `parseActions(agentOutput)` alongside existing parsers
3. If `actions.length > 0` → render `<NextStepsCard actions={actions} ... />` between content and activity
4. If `actions.length === 0` → render current hardcoded `ActionButton` as fallback

### ImplementationDetailView changes

- Accept `agentOutput` prop
- Parse actions from plan text
- Show NextStepsCard in `start_work` stage when actions present
- Keep hardcoded buttons for `hack`, `ship`, `code_review`, `pr_feedback` stages (MC skills)

### ResponseDetailView changes

- Parse actions from fetched context text
- Show NextStepsCard when actions present (replaces "Send via Slack" button with agent-defined send action)
- Keep "No action needed" rendering for `no_action` type

### MeetingPrepDetailView changes

- Parse actions from fetched context text
- Show NextStepsCard with join_meeting and open_url actions
- Keep current rendering as fallback

## New IPC Handlers

### `linear:update` handler

```typescript
ipcMain.handle("linear:update", async (_event, { ticket, field, value }) => {
  return askBridge(`Use mcp__claude_ai_Linear__save_issue to update ${ticket}: set ${field} to "${value}". Return {"ok": true} or {"ok": false, "error": "..."}.`, 30000);
});
```

### `slack:send` handler

```typescript
ipcMain.handle("slack:send", async (_event, { channel, message, threadTs }) => {
  return askBridge(`Use mcp__claude_ai_Slack__slack_send_message to send "${message}" to channel ${channel}${threadTs ? ` in thread ${threadTs}` : ""}. Return {"ok": true} or {"ok": false, "error": "..."}.`, 30000);
});
```

Both use the existing MCP bridge — no new processes needed.

### `email:send` handler

Deferred — Gmail MCP only supports read operations today. The `send_email` action type exists in the schema for forward compatibility but will render as "Open in Gmail" (open_url fallback) until send is available.

## Conversation Loading State Fix

When the user sends a follow-up message in the conversation area:

1. Set `conversationLoading: true` immediately after sending
2. Render a typing indicator (three-dot animation or Loader) below the last message
3. Clear `conversationLoading` when the agent responds (new text event from bridge)

This applies to the conversation/chat area in the implementation detail view — not to the NextStepsCard actions.

## Testing

### `src/shared/action-parser.test.ts`

- Parse valid actions block from agent output
- Return `[]` for output without actions block
- Filter invalid actions (missing type, missing label, unknown type)
- Handle malformed JSON gracefully
- Handle mixed valid/invalid actions (keep valid, drop invalid)

### `src/renderer/components/next-steps-card.test.ts`

- Render action items with correct icons per type
- Low-risk actions: click fires handler immediately
- Medium-risk actions: click shows confirmation, confirm fires handler
- High-risk actions: click shows editable preview
- `no_action` renders info row with no button
- Empty actions array → component returns null

### `src/shared/action-types.test.ts`

- Type guard functions for each action type
- Risk level validation
