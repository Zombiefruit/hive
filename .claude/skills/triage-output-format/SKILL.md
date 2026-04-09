---
name: triage-output-format
description: JSON output schema for the triage agent — defines the shape of actionable items, updates, follow-ups, and skipped items. Loaded by poll-service triage agent.
user-invocable: false
---

# Triage Output Format

Return a JSON object with FOUR arrays:

```json
{
  "actionable": [/* NEW items needing immediate action */],
  "updates": [/* changes to EXISTING tasks (matched by ID) */],
  "follow_up": [/* NEW items to recheck later */],
  "skipped": [/* reviewed and not relevant */]
}
```

## Actionable / Follow-Up Items (NEW only)

```json
{
  "source": "slack|linear|github|notion|email",
  "priority": "critical|high|medium|low|backlog",
  "confidence": 1-10,
  "task_type": "implementation|review|response|investigation|meeting_prep",
  "title": "Short descriptive title",
  "summary": "What this is and why it matters",
  "links": [{"type": "slack_thread|slack_dm|linear|github_pr|notion", "label": "#channel or ticket ID", "url": "https://..."}],
  "author": "Person who created/sent this",
  "action_needed": "What specifically needs to be done"
}
```

## Update Items (for EXISTING tasks)

```json
{
  "existing_id": "poll-xxx-xxxx",
  "changes": {
    "priority": "high",
    "stage": "done",
    "action_needed": "review and merge",
    "url": "https://...",
    "links": [{"type": "...", "label": "...", "url": "..."}]
  },
  "timeline_event": "PR #123 opened by the-user, 2 approvals received"
}
```

- **timeline_event**: SHORT (1 line) status update describing what changed since last check. Examples: "Jane replied in DM asking for ETA", "PR approved by 2 reviewers", "Ticket moved to In Review". This builds a history log on the task.
- Do NOT overwrite "summary" — that's the original description. Use timeline_event for progress.
- You CAN and SHOULD update "url" and "links" when: (a) existing ones are broken, (b) you have better URLs from the raw data, or (c) you're adding a timeline_event that references a Slack DM/thread — include its permalink in "links" so the planning agent can fetch context from it.
- Valid stages for updates: done, skipped, backlog (triage can only set terminal stages — workflow transitions are user-initiated)

## Projects Array (NEW)

Each detected project:
```json
{
  "name": "Performance Agent Chat",
  "source": "linear",
  "source_id": "proj-abc123",
  "reason": "3 tasks share the VEC-24 ticket prefix and reference the same Slack channel",
  "related_channels": ["C0ANYETEVDE"],
  "related_tickets": ["VEC-24", "VEC-23"]
}
```

On actionable items, include:
- `"project"`: project name (matches a project in the projects array)
- `"project_source"`: how the project was detected ("linear", "slack", "ai")
- `"project_source_id"`: the source identifier

## Multi-Repo Subtasks

When a task spans multiple repos, set `parent_task: true` and include a `subtasks` array:

```json
{
  "source": "linear",
  "title": "VEC-50: Full-stack feature",
  "parent_task": true,
  "subtasks": [
    { "title": "VEC-50: Backend API", "repo_hint": "monolith-django", "summary": "Add new endpoint..." },
    { "title": "VEC-50: Frontend client", "repo_hint": "frontend-app", "summary": "Add UI for..." }
  ],
  ...other fields...
}
```

## Skipped Items

```json
{
  "source": "slack|linear|github|notion|email",
  "title": "Short description",
  "reason": "Why skipped",
  "url": "https://..."
}
```
