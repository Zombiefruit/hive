# Hive — Backlog

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

---

## Medium Priority

### Bridge Pool for True Parallel Fetching
Spawn N bridge processes at startup for parallel source fetching. The current implementation uses per-source isolation but sequential bridge calls — a pool would allow genuinely concurrent fetches across all sources.

---

## Low Priority / Ideas

### Project Dedup Across Poll Cycles
Periodic scan to merge duplicate projects that arise when poll cycles create near-identical project entries for the same underlying work.

### Git Log Integration
Read recent commits to enrich standup reports and understand what was actually shipped.

### Gong Integration
Surface recent call transcripts as context for meeting prep tasks.
