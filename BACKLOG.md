# Claude Deck — Backlog

Persistent backlog of planned features and improvements. Items here survive across sessions.

---

## Upcoming (Do Next)

### Multi-Repo Subtasks
When triage detects a task spanning multiple repos (e.g., API change in `monolith-django` + client update in `frontend-app`), create linked subtasks that appear as one parent task in the kanban. Each subtask has its own repo, session ID, branch, and PRs. Parent task only moves to "done" when all subtasks complete.

**Design notes:**
- Triage agent detects multi-repo scope from ticket description, PR cross-references, or Slack discussion
- Parent notification gets `subtasks: [{repoUrl, notificationId}]` field
- Kanban card shows parent with expandable subtask rows
- Each subtask runs the MC skills workflow independently (`/start-work` → `/hack` → `/ship`)
- One task = one repo remains the default; subtasks are opt-in when multi-repo is detected

### Rich Stage UI (Task #92)
Each stage (plan, review, PR feedback) produces structured output. Instead of dumping raw markdown, parse the structure and render interactive UI:
- **Plan view**: Collapsible phases, task checklists with checkboxes, relevant files table, scope badge
- **Review view**: Finding cards with severity badges (BLOCKER/ISSUE/SUGGESTION/NIT), confidence indicators, fix status
- **PR feedback view**: Categorized items (human vs bot), validation status, fix progress
- **Meeting prep view**: Talking points as cards, context links, attendee list
- **Response view**: Suggested responses as selectable options, context sidebar

---

## Medium Priority

### Slack Real-Time Hook (Task #43)
Auto-spawn agent on Slack mentions/DMs — real-time reactive pipeline instead of polling.

### MCP Server Status in Settings
Show per-server auth status from `claude /mcp`, allow one-click re-authenticate per connector.

---

## Low Priority / Ideas

### Git Log Integration
Read recent commits to enrich standup reports and understand what was actually shipped.

### Gong Integration
Surface recent call transcripts as context for meeting prep tasks.
