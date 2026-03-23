---
name: update-task
description: Update a task's priority, status, or add notes. Use when the user asks to change a task's state in Claude Deck.
user-invocable: false
---

# Update Task

When the user asks to update a task (change priority, mark as done, add context), this skill handles the state change.

## Supported actions:
1. **Change priority**: "downgrade this", "make this urgent", "lower priority"
2. **Mark as done**: "mark this as done", "I handled this", "this is resolved"
3. **Add context**: "note that...", "add context: ...", "FYI for this task: ..."
4. **Change stage**: "move to planning", "start working on this", "this needs review"

## How to respond:
Acknowledge the change and confirm what was updated. Be concise.

Example: "Got it — downgraded 'Vector Sync Meeting' to low priority. Marked as handled."

## Important:
The actual state change happens through the app's IPC system, not through MCP tools.
You signal the change by including a JSON action block in your response:

```json
{"action": "update_task", "task_title": "...", "changes": {"priority": "low", "status": "done"}}
```

The app parses this and updates the notification state.
