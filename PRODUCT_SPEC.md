# Relay — Product Specification

> Last updated: 2026-04-03

## Vision

Relay is an autonomous engineering assistant — a native desktop app that monitors your work channels (Slack, Linear, Gmail, Calendar, Notion, GitHub), intelligently triages incoming work, and executes approved tasks through Claude Code agents all the way to PR.

The goal is to replace the manual inbox-checking → context-gathering → task-planning → coding loop with an AI-driven pipeline where the engineer reviews and approves rather than executes.

---

## Current State (April 2026)

### What's Built

#### Core Infrastructure
- **Electron Forge + Vite** desktop app with React 19 + TypeScript + Mantine 8.x
- **SQLite database** (better-sqlite3) for agents, messages, approvals, context_refs, events, cost tracking
- **IPC bridge** with typed channels — main↔renderer communication via `ipcMain.handle` / `webContents.send`
- **Zustand stores** in renderer, synced from main process at 100ms intervals
- **Preload script** exposing typed `window.deck` API to renderer

#### Agent System
- **Agent SDK integration** — spawn, kill, message, interrupt, resume via `@anthropic-ai/claude-agent-sdk`
- **Approval handler** — `canUseTool` callback routes permission requests to UI, supports risk classification
- **Session discovery** — `fs.watch` on `~/.claude/sessions/` detects external Claude Code instances
- **Session enricher** — enriches discovered sessions with metadata
- **Session tailer** — tails session logs in real-time
- **Context tracker** — auto-detects Linear/Slack/Notion/GitHub references from MCP tool calls

#### MCP Bridge
- **Persistent non-headless Claude Code process** (Sonnet 4.6) with read-only MCP access
- **Connectors:** Slack, Linear, Gmail, Google Calendar, Notion (all via claude.ai MCP servers)
- **Write operations blocked** via `--disallowedTools` (send messages, create issues, etc.)
- **Bridge status API** — connector health tracking, exposed to settings UI
- **60s fallback timeout** — marks bridge ready if init doesn't arrive, MCP connectors load during this window
- **Generation counter** prevents stale timeouts from affecting restarted bridges
- **Auto-restart** on unexpected exit (5s delay)

#### Notification System (Poll Service)
- **Parallel per-source fetching** — each source gets its own `askBridge` call with source-specific prompts, running sequentially per bridge but isolated per source for reliability
- **Config-driven** — all queries built from `DeckConfig` (no hardcoded IDs, names, or channels)
- **Sources:** Slack (searches + channel reads), Linear (assigned issues), Calendar (next 24h), Gmail (unread), Notion (mentions + team pages)
- **Two-pass architecture:**
  1. **Fetch** — per-source prompts with isolated bridge calls, results merged before triage
  2. **Triage** — fresh bridge context, AI classifies items with priority/confidence/taskType
- **Bridge restart between passes** to clear accumulated conversation context
- **Existing task dedup** — up to 30 open tasks included in triage prompt to prevent duplicates
- **Cache persistence** — notifications survive app restart via JSON cache file
- **Skipped items tracking** — reviewed/dismissed items preserved with reasons

#### Task Type Classification
- **Agent track** (autonomous — agent does the work):
  - `implementation` — Linear tickets requiring building/coding
- **Human track** (user does the work, agent prepares context):
  - `response` — DMs, threads, messages needing a reply
  - `meeting_prep` — Calendar events needing preparation
  - `review` — PR reviews assigned to the user
  - `investigation` — Research/analysis tasks
- **Classification source of truth:** `isHumanTask()` in `src/shared/stage-machine.ts`, `HUMAN_ONLY_TYPES` in `src/shared/task-utils.ts`

#### Priority System (5 levels)

| Level | Meaning | Trigger |
|-------|---------|---------|
| **critical** | Do it NOW | Manager direct ask, blocking others |
| **high** | Today | Tagged threads needing reply, active PR reviews, same-day deadlines |
| **medium** | This week | Assigned tickets, planned work |
| **low** | When free | Optional reviews, FYI threads |
| **backlog** | Someday | Informational, announcements |

Priority assignment is context-aware: who asked matters (manager → critical, lead → high, peer → high, external → medium).

#### Work Dispatcher
- **Plan creation** per notification — different prompts for implementation, review, response, meeting_prep
- **Two-section output:** TL;DR + expandable details (separated by `---`)
- **GitHub context** pre-fetched via `gh` CLI
- **MCP fetch instructions** built from notification links
- **Plan regeneration** via `clearPlan()` IPC
- **Work agent spawning** — starts a Claude Code agent to execute the plan

#### Agent-as-Judge Verification
- **Three judge types:** Triage (checks missed items, wrong priorities), Planning (feasibility, completeness), Work (plan adherence, completion)
- **All judges use Sonnet** via `askJudgeProcess()` — lightweight, no MCP tools, ~3s startup
- **Triage judge** runs in parallel with parsing, applies corrections automatically
- **Planning judge** verifies plans before showing to user, auto-iterates once on rejection
- **Work judge** runs post-exit, broadcasts verdict, holds stage on rejection
- **Verdicts** appear on kanban cards (badge) and in Plan tab (verdict panel)

#### Agent Memory System
- **SQLite + fastembed** (BAAI/bge-small-en-v1.5, 384-dim) for semantic search
- **Per-agent scopes** (triage, planning, work) + shared pool
- **Memory types:** preference, fact, relationship, procedure, context, feedback
- **Dedup:** cosine similarity > 0.85 merges memories
- **Confidence decay** for unused memories (7+ days)
- **Learning loop:** Low-confidence judges can ask user questions → answers stored as high-confidence memories
- **All judges read memories** before making verdicts

#### Autonomous Orchestrator
- **60-second poll loop** monitoring all active tasks
- **Parent stage auto-computation** from children
- **Stall detection** — 15+ min idle triggers escalation
- **Thinking bubble** — broadcasts real-time thoughts to UI
- **Structured escalation** with severity, whatWasTried, suggestedActions

#### Business Context
- **Agent-maintained** living document scanned from Slack, Notion, Linear, Gong weekly
- **User reviews/approves** before saving
- **Injected into all judge prompts** as grounding context

#### Setup Agent
- **Skill-based** (`discover-workspace/SKILL.md`), re-runnable from Settings
- **Auto-discovers:** Slack ID, Linear username, channels, coworkers, manager, working hours
- **Mines Gmail + Calendar** for org structure (1:1 patterns = manager, team syncs = teammates)
- **Stores discovered context** as agent memories

---

### Pages & Navigation

#### Agents (/) — Home
- Agent grid with status cards (avatar, name, status, quick actions)
- Metrics bar (active, idle, errored, completed, tokens)
- Filter bar (status toggle chips + context dropdown)
- Activity feed (reverse-chronological events)
- Approval sidebar (pending permission requests)
- New Agent modal (task, cwd, model, permission mode, import from Linear/Slack)

#### Inbox (/ — default page) — Kanban Board
- **Two-section layout:**
  - "Actionable — Agent Can Work" (implementation only)
  - "Needs Your Attention" (response, meeting_prep, review, investigation)
- **Agent track columns:** Inbox → Planning → Plan Review → Hacking → Shipping → Reviewing → Feedback → Backlog → Done
- **Human track columns:** Inbox → Preparing → Ready → Backlog → Done
- **Human track flow:** Drag to Preparing → agent gathers context → user reviews → clicks "Mark Ready" → clicks "Mark Done"
- **Drag-and-drop rules — dragging into a column starts the work for that column:**
  - → Planning (start_work): runs `/start-work` skill (MCP agent fetches context, creates plan). On success, advances to plan_review.
  - → Hacking (hack): runs `/hack` skill (requires repoPath — only droppable if task has repo set from plan approval). Creates worktree, executes plan.
  - → Shipping (ship): runs `/ship` skill
  - → Reviewing (code_review): runs `/code-review` skill
  - → Feedback (pr_feedback): runs `/handle-pr-feedback` skill
  - → Preparing (human): runs `prepareWorkPlan()` (MCP agent gathers context, produces key points)
  - → Done: runs `/done` skill (archives .work/ directory)
  - → Backlog: just moves (archive, no skill)
  - → Inbox (new): always allowed (reset — clears plan)
- **Prerequisites enforced by `canDropTo()`:** can't skip stages (e.g., can't drag from inbox directly to hacking)
- **Drag does NOT open the detail drawer** — only explicit click opens it
- **Tabbed detail drawer** — four tabs (Agent, Plan, Context, Timeline) with live agent chat, structured plan view, fetched context items, and chronological event timeline
- **Secondary actions** in detail drawer: Re-plan (clears plan, moves to planning), Reset (clears plan, moves to inbox), Archive (moves to backlog)
- **Add Task modal** — manual task creation (title, description, type, priority, estimated time)
- **Refresh** fetches new items without clearing existing
- **Debug log panel** with clear button

#### Schedule (/schedule) — Daily Agenda
- **Timeline view** with time blocks, priority-based ordering
- **Time estimates** per task type (implementation=90min, review=45min, response=15min, etc.)
- **Current time indicator** (red line)
- **Drag to reorder** with automatic time recalculation

#### Reflect (/reflect) — Work Habits Analysis (replaced Coach/Standup)
- **Manager's Take** — LLM-generated assessment of the week's work patterns (Haiku, cached in sessionStorage)
- **Signal Cards** — Response Cadence, Focus Score, Meeting Load, Throughput (computed from notification data)
- **Weekly Throughput** — bar chart of completed tasks over time
- **Cycle Time by Type** — horizontal bars showing avg completion time per task type
- **Actionable Suggestions** — "60% of tasks are responses — batch Slack replies"

#### Insights (/insights) — Proactive Ideas
- **Auto-discovers** useful Slack channels (learned over time)
- **Extracts** feature ideas, customer pain points, trends, proactive tasks
- **Sources:** Slack channels, Gong calls, Linear trends
- **Actions:** Create Task (converts to notification), Acknowledge, Dismiss
- **Channel scoring** — user actions adjust channel usefulness scores

#### Memories (/memories) — Agent Memory Viewer
- **Stats header** — total by scope (triage/planning/work/shared) and category
- **Semantic search** — find memories by meaning, not just keywords
- **Filter chips** — by scope, category
- **Memory cards** — content, confidence bar, source, access count
- **Actions** — delete individual, clear all

#### Context (/context) — Business Context
- **Agent-generated** business context document (Markdown)
- **Generate/Refresh** — scans Slack, Notion, Linear, Gong
- **Editable** — user can edit before saving
- **Injected** into all judge prompts automatically

#### Settings (/settings)
- **Identity** — name, email, Slack User ID, Linear username
- **Auto-Discover** — button that runs setup agent to auto-fill all fields from MCP tools
- **Role & Team** — role, manager, team, coworkers
- **Integrations** — toggle per source (Slack, Linear, Gmail, Calendar, Notion, GitHub, Gong)
- **MCP Connections** — per-connector health badges
- **Preferences** — fetch cadence, timezone, working hours

#### Onboarding (/onboarding) — First-Run Wizard
- 6-step flow matching settings sections
- **Auto-Discover** button — fills everything from name + email
- Auto-detected timezone
- Saves to `config.json`

---

### Skills System (.claude/skills/)

24 specialized skills:
- **Fetch:** fetch-slack, fetch-linear, fetch-github, fetch-gmail, fetch-calendar, fetch-notion, fetch-gong
- **Parse:** parse-implementation, parse-review, parse-response, parse-meeting-prep
- **Execute:** execute-implementation, execute-review
- **Manage:** manage-agent, update-task
- **Judge:** judge-triage, judge-plan, judge-work
- **Discovery:** discover-workspace, refresh-business-context, extract-insights
- **Structured Agent Actions** — agents return typed JSON action blocks (run skill, update Linear, send Slack, open URL, dismiss, snooze) rendered as risk-tiered CTAs in the detail drawer

### Configuration System
- **DeckConfig type** in `src/shared/config-types.ts`
- **Persisted** to `~/Library/Application Support/claude-deck/config.json`
- **Fields:** name, email, slackUserId, linearUsername, role, managerName, teamName, coworkers, slackChannels, integrations, fetchCadence, timezone, workingHours
- **Coworker type:** `{ name, role: manager|lead|pm|peer, slackUserId? }`

### System Integration
- **System tray** with agent count badge and quick menu
- **macOS notifications** for agent events
- **Auth check** on startup — verifies Claude CLI installed and authenticated
- **Error recovery UI** — resume agents after errors
- **App icon and window chrome**

---

## Architecture

```
Electron Main Process
├── index.ts                    — App entry, IPC handler registration
├── mcp-bridge.ts               — Persistent MCP-connected Claude Code process (Sonnet 4.6)
├── config.ts                   — DeckConfig persistence (config.json)
├── auth-check.ts               — Claude CLI auth verification
├── claude-path.ts              — Resolve claude binary location
├── tray.ts                     — System tray icon + menu
├── native-notifications.ts     — macOS notification bridge
├── agents/
│   ├── agent-manager.ts        — SDK query() lifecycle, streaming input
│   ├── approval-handler.ts     — canUseTool → UI → resolve
│   ├── session-discovery.ts    — fs.watch ~/.claude/sessions/
│   ├── session-tailer.ts       — Real-time log tailing
│   ├── session-enricher.ts     — Metadata enrichment
│   ├── session-history.ts      — Historical session queries
│   ├── message-parser.ts       — Parse agent output
│   └── context-tracker.ts      — Auto-detect resource refs from tool calls
├── db/database.ts              — SQLite schema + CRUD
├── ipc/bridge.ts               — Typed IPC channels, store sync (100ms)
├── manager/
│   ├── manager-ai.ts           — Manager agent (priority/stage updates)
│   └── manager-tools.ts        — Manager tool definitions
└── notifications/
    ├── poll-service.ts          — Combined fetch + triage pipeline
    ├── work-dispatcher.ts       — Plan creation + work agent spawning
    └── agent-monitor.ts         — Monitor agent events

Renderer Process (React 19 + Mantine 8.x)
├── pages/ (9 routes)
├── components/ (28 components)
├── hooks/useIpcSync.ts
├── stores/ (agent-store, manager-store)
└── App.tsx + routes

Shared
├── types.ts                    — Core domain types
├── notification-types.ts       — Priority, source, status types
└── config-types.ts             — DeckConfig, Coworker, SlackChannel
```

### Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Bridge model: Sonnet 4.6** | Better multi-tool orchestration than Haiku for combined fetch prompts |
| **Per-source fetch isolation** | Each source gets its own askBridge call with a focused prompt, improving reliability and debuggability over a single combined prompt. |
| **No parallel spawn for MCP** | Fresh Claude Code processes need ~60s for MCP connectors to load, making per-source spawning impractical. The persistent bridge is pre-warmed. |
| **stream-json stdin-first** | Claude Code won't emit init until a message is sent on stdin. Discovered via `scripts/test-parallel-spawn.mjs`. |
| **Native HTML5 DnD** | @hello-pangea/dnd was buggy in Electron; native works reliably |
| **Server-side notification IDs** | `poll-*` prefix IDs enable persistence via `updateNotificationById` |

---

## Future Roadmap

### Near-term
- [ ] Orchestrator thinking bubble UI — floating speech bubble showing real-time orchestrator thoughts
- [ ] Sidebar navigation redesign — 8+ tabs too many for horizontal bar
- [ ] Response task safety — CTA always "Draft", never auto-send
- [ ] Global refresh — single button refreshes all data sources across all tabs
- [ ] Better logging/visibility — all agent actions should have visible logs

### Medium-term
- [ ] Bridge pool for true parallel fetching — spawn N bridge processes
- [ ] End-to-end test pipeline — notification → plan → approve → agent → PR
- [ ] Smart refresh — cheap update checks vs expensive full re-scan
- [ ] Learning system v2 — judges learn from user overrides

### Long-term Vision
- [ ] Skill library — extensible skill system where orchestrator picks the right skill
- [ ] Multi-workspace support — manage multiple Slack/Linear/GitHub orgs
- [ ] Team mode — multiple users sharing insights and coordinating work

---

## File Manifest

| Category | Count |
|----------|-------|
| Main process files | 25 |
| Renderer pages | 9 |
| Renderer components | 28 |
| Shared types | 3 |
| Skills | 14 |
| Test files | 24 |
| **Total source files** | **~81** |
