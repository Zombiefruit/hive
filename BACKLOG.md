# Relay — Backlog

Persistent backlog of planned features and improvements. Items here survive across sessions.

---

## Recently Completed (April 2026)

- **Agent-as-Judge** — Triage, planning, and work judges verify all agent output
- **Agent Memory** — SQLite + fastembed semantic search, per-agent + shared scopes
- **Proactive Insights Tab** — Scans Slack/Gong/Linear for feature ideas and customer pain points
- **Autonomous Orchestrator** — 60s poll loop, stall detection, subtask coordination, thinking bubble
- **Productivity Coach** — Daily brief, work patterns, output scoring (replaces Standup)
- **Memories Page** — View, search, filter, delete agent memories
- **Business Context Agent** — Agent-maintained company context doc, injected into all prompts
- **Setup Agent** — Auto-discovers Slack ID, Linear username, channels, coworkers from MCP tools
- **Git Worktrees** — Work agents get isolated worktrees for parallel execution
- **Multi-Model Routing** — Haiku for extraction, Sonnet for judges, Opus for planning
- **Structured Escalation** — Typed escalation protocol with severity and suggested actions
- **Gong Integration** — New data source for triage and insights
- **Multi-Repo Subtasks** — Parent/child tasks with stage cascade

---

## Upcoming (Do Next)

### Orchestrator Thinking Bubble UI
Floating speech bubble component showing the orchestrator's real-time thinking. Backend wiring complete (`orchestrator:thought` events), needs frontend component. User will provide Lovable-designed React component to adapt.

### Sidebar Navigation Redesign
Move from top tabs to sidebar layout — 8 tabs is too many for a horizontal bar. Save for after current feature wave stabilizes.

### Response Task Safety
Response tasks should never auto-send. CTA should always be "Draft" not "Go". Agent drafts the response, user reviews and sends manually. **No agent should ever send a message on behalf of the user without explicit approval.**

---

## Medium Priority

### Bridge Pool for True Parallel Fetching
Spawn N bridge processes at startup for parallel source fetching.

### Smart Refresh
Cheap update checks on known tasks vs expensive full re-scan.

### End-to-End Test Pipeline
Notification → plan → approve → agent → PR, fully automated test.

---

## Low Priority / Ideas

### Learning System v2
Judges learn from user overrides (priority changes, dismissals, reclassifications) and adjust triage behavior over time. Foundation exists (memory system), needs the feedback loop.

### Skill Library
Extensible skill system where the orchestrator picks the right skill per task type.

### Git Log Integration
Read recent commits to enrich coach reports and understand what was actually shipped.
