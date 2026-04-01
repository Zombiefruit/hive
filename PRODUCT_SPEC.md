# Claude Deck — Product Specification

> Last updated: 2026-03-24

## Vision

Claude Deck is an autonomous engineering assistant — a native desktop app that monitors your work channels (Slack, Linear, Gmail, Calendar, Notion, GitHub), intelligently triages incoming work, and executes approved tasks through Claude Code agents all the way to PR.

The goal is to replace the manual inbox-checking → context-gathering → task-planning → coding loop with an AI-driven pipeline where the engineer reviews and approves rather than executes.

---

## Current State (March 2026)

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
- **Single combined prompt** — one `askBridge` call fetches ALL sources; the model parallelizes tool calls internally
- **Config-driven** — all queries built from `DeckConfig` (no hardcoded IDs, names, or channels)
- **Sources:** Slack (searches + channel reads), Linear (assigned issues), Calendar (next 24h), Gmail (unread), Notion (mentions + team pages)
- **Two-pass architecture:**
  1. **Fetch** — single prompt, model calls all source tools in parallel (~2-5 min)
  2. **Triage** — fresh bridge context, AI classifies items with priority/confidence/taskType
- **Bridge restart between passes** to clear accumulated conversation context
- **Existing task dedup** — up to 30 open tasks included in triage prompt to prevent duplicates
- **Cache persistence** — notifications survive app restart via JSON cache file
- **Skipped items tracking** — reviewed/dismissed items preserved with reasons

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

#### Manager AI
- **Chat interface** — floating panel accessible from any page
- **Task management** — can update priority, stage, status, confidence via JSON action blocks
- **Conversation persistence** — multiple conversations, switch/delete
- **Fleet awareness** — sees current agent states and pending approvals

---

### Pages & Navigation

#### Agents (/) — Home
- Agent grid with status cards (avatar, name, status, quick actions)
- Metrics bar (active, idle, errored, completed, tokens)
- Filter bar (status toggle chips + context dropdown)
- Activity feed (reverse-chronological events)
- Approval sidebar (pending permission requests)
- New Agent modal (task, cwd, model, permission mode, import from Linear/Slack)

#### Inbox (/notifications) — Kanban Board
- **Two-section layout:**
  - "Actionable — Agent Can Work" (implementation, review, investigation, planning)
  - "Needs Your Attention" (response, meeting_prep, follow_up)
- **Columns per section:** Inbox → Follow Up → Planning → Prepared → Working → Done + Reviewed
- **Native HTML5 drag-and-drop** with stage transitions triggering actions:
  - → Planning: triggers `prepareWorkPlan()`
  - → Working: triggers `startWorkAgent()`
- **Detail drawer** — plan view with TL;DR/details, activity feed, links, regenerate button
- **Add Task modal** — manual task creation (title, description, type, priority, estimated time)
- **Refresh** fetches new items without clearing existing
- **Debug log panel** with clear button

#### Schedule (/schedule) — Daily Agenda
- **Timeline view** with time blocks, priority-based ordering
- **Time estimates** per task type (implementation=90min, review=45min, response=15min, etc.)
- **Current time indicator** (red line)
- **Drag to reorder** with automatic time recalculation
- **Focus mode** (hides sidebar)
- **Capacity progress bar** + free time labels
- **Priority breakdown sidebar** (count per priority level)

#### Settings (/settings)
- **Identity** — name, email, Slack User ID, Linear username
- **Role & Team** — role (dev/PM/designer), manager name, team name
- **Coworkers** — add/remove with name, role (manager/lead/PM/peer), optional Slack ID
- **Slack Channels** — channels to monitor (name + ID)
- **Integrations** — toggle per source (Slack, Linear, Gmail, Calendar, Notion, GitHub)
- **MCP Connections** — per-connector health badges (green/red), restart bridge, open terminal for auth
- **Preferences** — fetch cadence, timezone, working hours

#### Onboarding (/onboarding) — First-Run Wizard
- 6-step flow matching settings sections
- Auto-detected timezone
- Saves to `config.json`

#### Other Pages
- **Agent Detail (/agent/[id])** — live logs, chat, timeline, context panel, controls
- **Task Detail (/task/[id])** — task status, logs, actions
- **History (/history)** — session history with terminal replay
- **Debug (/debug)** — development utilities

---

### Skills System (.claude/skills/)

14 specialized skills for the manager/agents:
- **Fetch:** fetch-slack, fetch-linear, fetch-github, fetch-gmail, fetch-calendar, fetch-notion
- **Parse:** parse-implementation, parse-review, parse-response, parse-meeting-prep
- **Execute:** execute-implementation, execute-review
- **Manage:** manage-agent, update-task

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
| **Single combined fetch prompt** | One askBridge call; model parallelizes tool calls internally. Eliminated need for multiple bridge processes. |
| **No parallel spawn for MCP** | Fresh Claude Code processes need ~60s for MCP connectors to load, making per-source spawning impractical. The persistent bridge is pre-warmed. |
| **stream-json stdin-first** | Claude Code won't emit init until a message is sent on stdin. Discovered via `scripts/test-parallel-spawn.mjs`. |
| **Native HTML5 DnD** | @hello-pangea/dnd was buggy in Electron; native works reliably |
| **Server-side notification IDs** | `poll-*` prefix IDs enable persistence via `updateNotificationById` |

---

## Future Roadmap

### Near-term
- [ ] Slack/Linear user search via MCP — populate coworker dropdowns using existing MCP tools
- [ ] End-to-end test — notification → plan → approve → agent → PR
- [ ] Slack hook — auto-spawn agent on mentions/DMs
- [ ] Smart refresh — cheap update checks on known tasks vs expensive full re-scan
- [ ] Config-driven poll cadence — use settings instead of manual/startup only

### Medium-term
- [ ] Manager learns from history — accumulated task history as context for smarter triage
- [ ] Attach tasks to existing Claude sessions — link manual tasks to running agents
- [ ] Slack channel search in onboarding — search instead of manual ID entry
- [ ] UI prompts on timeout — user-facing messages when fetches time out

### Long-term Vision
- [ ] Proactive monitoring — continuously watch channels, act on new mentions without manual refresh
- [ ] Skill library — extensible skill system where the manager picks the right skill per task
- [ ] Multi-agent orchestration — manager coordinates multiple agents working on related tasks
- [ ] Learning system — manager improves priority/triage decisions based on user feedback patterns

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
