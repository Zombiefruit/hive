# Tabbed Detail Drawer

## Problem

The detail drawer is an 1800-line component mixing plan, conversation, activity log, fetched context, timeline, and action buttons in one scrollable area. When the agent asks a question, the user has no clear way to respond — the input only appears after a conversation exists, and it routes to the wrong backend (MCP bridge instead of running skill process). Closing the StartWorkModal without selecting a repo still allows work to proceed with an empty path. Repo detection exists but the modal always opens regardless.

## Solution

Restructure the detail drawer as a tabbed interface. Four tabs: Agent, Plan, Context, Timeline. The Agent tab is the primary interaction surface — a hybrid chat/log with a sticky input that always routes to the active agent. Repo detection skips the modal when successful.

## Tab Structure

Four tabs rendered below the notification header (title, source badge, priority, stage):

| Tab | Content | Badge |
|-----|---------|-------|
| Agent | Hybrid chat + activity log. NextStepsCard. Sticky input. | Pulsing dot when agent running |
| Plan | PlanView (phases, tasks, relevant files). Read-only. | Checkmark when plan exists |
| Context | Fetched Slack/Linear/GitHub/Notion data with source icons. | Item count |
| Timeline | Chronological notification events with colored type dots. | — |

### Auto-focus rules

- Agent starts running → switch to Agent tab
- First open → Agent if conversation exists or agent running; Plan if plan exists but no conversation; else Agent
- Tab state is per-notification, not persisted across sessions

## Agent Tab Layout

Four vertical zones:

### Zone 1: Chat bubbles (scrollable)
- Agent text messages: left-aligned, dark background bubble
- User messages: right-aligned, blue-tinted bubble
- Agent questions (text ending with `?` or containing input prompts): left bubble with subtle highlight border to stand out from narration
- `no_action` results: muted info row with checkmark

### Zone 2: NextStepsCard (conditional)
- Renders between chat and log when structured `\`\`\`actions` block found in last agent message
- Risk-tiered interactions: low=click, medium=confirm, high=editable preview
- Hidden when no actions block

### Zone 3: Compact activity log (collapsible)
- Tool calls as single-line entries: `Read: src/main/index.ts`
- Status updates: `Loading tools... (10s)`
- Collapsed by default, toggle: "Show activity (N events)"
- Auto-expanded while agent is running with live updates

### Zone 4: Sticky input (always visible at bottom)
- Text input + Send button, fixed position
- **Routing:** If skill process running (`isSkillRunning(notificationId)`) → `sendToSkill`. Otherwise → `iteratePlan` (MCP bridge)
- Disabled with "No agent running" placeholder when no agent active and no conversation
- Shows Loader + "Thinking..." between send and response

## Plan Tab

- Renders `PlanView` component with parsed plan data
- Read-only — no action buttons here (those are in Agent tab via NextStepsCard)
- Shows scope, phases with tasks, relevant files, progress bar
- Empty state: "No plan yet. Start work from the Agent tab."

## Context Tab

- Lists fetched context items with source icons and timestamps
- Each item: source icon + type badge + content preview + external link button
- Deduped against notification links
- Empty state: "No context fetched yet."

## Timeline Tab

- Chronological event list from `notification.timeline[]`
- Each entry: colored dot (by event type) + timestamp + event text
- Most recent first
- Empty state: "No timeline events."

## Repo Detection Fix

### Current bug
`handlePrepare` opens StartWorkModal. Closing without selecting still allows "Approve" to run with empty `repoPath`.

### Fix
When repo is auto-detected from notification data (via `detectRepo`):
- **Skip the modal entirely**
- Show inline banner in Agent tab: "Detected repo: `monolith-django` (from VEC-44) — [Change]"
- "Start Work" button uses the detected repo and auto-derived branch
- Clicking [Change] opens StartWorkModal as fallback

When repo is NOT detected:
- Open StartWorkModal as before
- But guard `handleStartWork`: if `repoPath` is empty, do nothing (prevent the empty-path bug)

### Branch derivation
Keep current logic: extract ticket ID from title, derive branch as `kwilliams/<ticket-slug>`. Show in inline banner alongside repo.

## Component Decomposition

The current 1800-line DetailPane becomes:

| Component | File | Responsibility |
|-----------|------|---------------|
| `DetailDrawer` | `src/renderer/components/DetailDrawer.tsx` | Tab bar + tab routing + notification header |
| `AgentTab` | `src/renderer/components/AgentTab.tsx` | Chat bubbles + NextStepsCard + activity log + sticky input |
| `PlanTab` | `src/renderer/components/PlanTab.tsx` | PlanView wrapper with empty state |
| `ContextTab` | `src/renderer/components/ContextTab.tsx` | Fetched context list |
| `TimelineTab` | `src/renderer/components/TimelineTab.tsx` | Notification timeline |
| `ChatBubble` | `src/renderer/components/ChatBubble.tsx` | Single message bubble (agent or user) |
| `RepoDetectionBanner` | `src/renderer/components/RepoDetectionBanner.tsx` | Inline "Detected repo" banner with [Change] |

`notifications.tsx` shrinks significantly — it keeps the kanban board and delegates the detail pane to `DetailDrawer`.

## State Management

`DetailDrawer` manages:
- `activeTab: "agent" | "plan" | "context" | "timeline"`
- Passes data down to each tab component via props

`AgentTab` manages:
- `conversation: Array<{ role: string; content: string }>`
- `activity: Array<{ type: string; content: string; timestamp: string }>`
- `loading: boolean`
- `feedback: string`
- `showActivity: boolean`

State that was previously in DetailPane but moves to specific tabs or is removed:
- `showContext` → removed (Context tab is always expanded)
- `showTimeline` → removed (Timeline tab is always expanded)
- `hasApproved` → removed (approval is via NextStepsCard actions, not a separate flag)
- `startWorkOpen` → stays in AgentTab for the [Change] repo fallback

## Message Routing

The sticky input in AgentTab routes messages based on state:

```
User types message → Send
  ├─ isSkillRunning(notificationId)? → sendToSkill(notificationId, message)
  └─ else → iteratePlan(notificationId, message) (MCP bridge)
```

Both paths:
1. Add `{ role: "user", content: message }` to conversation immediately
2. Set `loading = true`
3. Wait for response (via planning:event stream or iteratePlan return)
4. Add `{ role: "assistant", content: response }` to conversation
5. Set `loading = false`

## Testing

### `src/renderer/components/detail-drawer.test.ts`
- Tab rendering: all 4 tabs present
- Auto-focus: Agent tab when conversation exists
- Auto-focus: Plan tab when plan exists but no conversation
- Badge rendering: pulsing dot when loading, checkmark when plan exists

### `src/renderer/components/agent-tab.test.ts`
- Chat bubble rendering: agent left-aligned, user right-aligned
- Question detection: messages ending with `?` get highlight border
- NextStepsCard renders when actions exist in last message
- Activity log collapsed by default, expanded when loading
- Input routing: sendToSkill when skill running, iteratePlan otherwise
- Input disabled when no agent and no conversation

### `src/renderer/components/repo-detection-banner.test.ts`
- Shows detected repo name and source
- [Change] button triggers onChangeRepo callback
- Hidden when no repo detected
