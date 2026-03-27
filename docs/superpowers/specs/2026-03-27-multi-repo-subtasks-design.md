# Multi-Repo Subtasks — Parent Tasks with Per-Repo Children

## Context

Some Linear tickets require changes across multiple repos (e.g., API change in `monolith-django` + client update in `frontend-app`). Currently one task = one repo. The MC skills workflow (`/start-work` → `/hack` → `/ship`) operates in a single repo per session. Multi-repo work needs to be split into separate subtasks, each targeting a specific repo.

---

## 1. Data Model

### Parent-child relationship on PollNotification

```typescript
// New fields on PollNotification
parentTaskId?: string;     // if this is a subtask, points to parent
subtaskIds?: string[];     // if this is a parent, lists child task IDs
```

A parent task is a regular notification that has `subtaskIds`. Subtasks are regular notifications that have `parentTaskId`. Both are stored in the same `notifications` array — no separate collection.

### Parent task behavior
- Stage is computed from children: if any child is `hack` → parent is `hack`. If all are `done` → parent is `done`. Highest active stage wins.
- Parent does NOT have its own session, repo, or branch — it's a container.
- Parent kanban card shows an expandable list of subtasks with their individual stages.

### Subtask behavior
- Each subtask has its own `repoPath`, `sessionId`, `branch`, `workSlug` — independent MC skills workflow.
- Subtask kanban cards appear INSIDE the parent card (expanded) or as standalone cards (if parent is collapsed).
- Subtasks are created by triage or by user manually.

---

## 2. Triage Detection

When the triage agent creates a task from a ticket that mentions multiple repos or has cross-repo scope, it creates:

1. A parent task (the ticket itself)
2. Subtasks for each repo (split by scope)

The triage output gains:

```json
{
  "actionable": [
    {
      "title": "VEC-50: Add API endpoint",
      "parent_task": true,
      "subtasks": [
        { "title": "VEC-50: Backend API (monolith-django)", "repo_hint": "monolith-django" },
        { "title": "VEC-50: Frontend client (frontend-app)", "repo_hint": "frontend-app" }
      ]
    }
  ]
}
```

The triage skill (`triage-rules/SKILL.md`) gets instructions for multi-repo detection:

```markdown
## Multi-Repo Detection

When a ticket describes changes spanning multiple repos:
- Create a parent task with the full ticket scope
- Create subtasks, one per repo, each describing that repo's portion
- Use repo_hint to suggest which repo each subtask targets
- Signs of multi-repo: mentions "API + frontend", "backend + client", multiple repo names, or cross-service changes
```

---

## 3. UI

### Kanban card
Parent tasks show a "subtasks" badge with count (e.g., "2 subtasks"). When expanded, subtask cards appear indented below with their own stage badges and actions.

### Project detail view
Subtasks appear grouped under their parent. Each subtask links to its own detail pane.

### Detail pane
- **Parent task**: shows summary, links to all subtask detail panes, overall progress (X of Y subtasks done)
- **Subtask**: shows normal task-type detail view (ImplementationDetailView, etc.) with a "Part of: {parent title}" link at the top

---

## 4. Implementation

### Poll service changes
- When creating notifications from triage, if `parent_task` is true:
  1. Create the parent notification
  2. Create subtask notifications with `parentTaskId` set
  3. Set parent's `subtaskIds` to the created IDs
- When updating: if a subtask moves to `done`, check if all siblings are done → move parent to `done`

### Stage computation for parents
```typescript
function computeParentStage(subtaskIds: string[], notifications: PollNotification[]): string {
  const subtasks = subtaskIds.map(id => notifications.find(n => n.id === id)).filter(Boolean);
  if (subtasks.every(s => s.stage === "done")) return "done";
  // Highest active stage wins
  const activeStages = subtasks.map(s => STAGE_ORDER[s.stage ?? "new"] ?? 0);
  const maxOrder = Math.max(...activeStages);
  const stage = Object.entries(STAGE_ORDER).find(([, order]) => order === maxOrder);
  return stage?.[0] ?? "new";
}
```

### Files
- Modify: `src/main/notifications/poll-service.ts` — subtask creation in triage parsing
- Modify: `src/shared/task-utils.ts` — add `computeParentStage()`
- Modify: `src/renderer/pages/notifications.tsx` — expandable parent cards, subtask rendering
- Modify: `.claude/skills/triage-rules/SKILL.md` — multi-repo detection instructions
- Modify: `.claude/skills/triage-output-format/SKILL.md` — subtask format

### Tests
- `subtask-creation.test.ts` — triage creates parent + children, IDs linked
- `parent-stage.test.ts` — stage computed from children correctly
- `subtask-protection.test.ts` — subtasks protected from consolidation like any active task
