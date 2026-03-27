# MC Skills Integration + Project-Based Work Management

## Context

Claude Deck currently uses custom planning agents with hand-rolled prompts to analyze tasks and produce plans. This duplicates and diverges from Monte Carlo's shared engineering workflow — a prescribed sequence of skills (`/start-work` → `/hack` → `/ship` → `/code-review`) that handle code discovery, phased planning, implementation with parallel agents, verification, PR creation, and multi-agent review.

Additionally, tasks are flat — each notification floats independently in the kanban. Real work is project-based: a Linear initiative, a Slack `#proj-*` channel, or a cluster of related tickets all belong to one effort. Without project grouping, context is fragmented and progress is hard to track.

This spec replaces the custom planning system with MC skill invocation and adds project-based task organization.

---

## 1. Skill Runner

### What it does

A new module (`src/main/skill-runner.ts`) that spawns Claude Code processes to execute MC skills in target repos.

### Invocation model

```
spawn(claude, [
  "--output-format", "stream-json",
  "--input-format", "stream-json",
  "--verbose",
  "--no-chrome",
  "--resume", sessionId,       // omit on first run
])
  cwd: /path/to/target/repo
  env: { ...process.env, CLAUDE_HIVE: "1" }
  stdin: "/start-work VEC-24"  // skill slash command
```

- **Transport**: stream-json (mandatory for MCP access — headless `-p` mode has no MCP tools)
- **Session resume**: `--resume <sessionId>` restores full conversation history from prior skill runs on the same task. Omitted on the first `/start-work` invocation.
- **Non-interactive**: `CLAUDE_HIVE=1` environment variable tells MC skills to skip all user confirmations and use best-judgment defaults.
- **Process lifecycle**: fresh process per skill invocation. Process starts, executes the skill, produces output, dies. No idle RAM between steps.
- **One agent per task**: each task gets its own session. No cross-contamination between tasks, even if they target the same repo.

### Skill resolution

Skills are resolved by Claude Code from `~/.claude/skills/` — installed by `configure-claude`. Claude Deck does not bundle, copy, or reference skill files. When the user's skills update (via `configure-claude`), Deck automatically uses the latest version.

### Startup check

On app launch, verify that required skills exist:

```
~/.claude/skills/start-work/SKILL.md
~/.claude/skills/hack/SKILL.md
~/.claude/skills/ship/SKILL.md
~/.claude/skills/code-review/SKILL.md
```

If missing, show a warning in Settings: "MC engineering skills not found. Run `configure-claude` to install them."

### Event streaming

The skill runner reuses the existing `PlanningEvent` IPC infrastructure:
- `init` — MCP tools loaded (with count)
- `tool_use` — agent calling Slack/Linear/Notion/GitHub tools
- `text` — agent's narration and analysis
- `status` — loading/progress updates
- `result` — skill completed
- `error` — timeout or crash

Events broadcast via `planning:event` IPC, rendered in the task detail pane's activity log.

### Output parsing

After a skill completes, the skill runner reads structured output from disk:

| Skill | Output file | What Deck extracts |
|-------|------------|-------------------|
| `/start-work` | `.work/<slug>/plan.md` | Phases, tasks, relevant files, scope classification, branch name |
| `/hack` | `.work/<slug>/plan.md` (updated) | Checked-off tasks, commit messages, phase progress |
| `/ship` | `.work/<slug>/plan.md` (updated) | PR URL, push status |
| `/code-review` | `.work/<slug>/reviews/*.md` | Findings with severity, file refs, fix status |
| `/handle-pr-feedback` | `.work/<slug>/pr-feedback-*.md` | Categorized items, validation status |

Deck parses these files and renders them as structured UI (see Section 5).

### Task fields

Each notification gains:

| Field | Type | Set by | Purpose |
|-------|------|--------|---------|
| `sessionId` | `string \| null` | Skill runner | Claude Code session ID for `--resume` |
| `repoPath` | `string \| null` | Triage (detected) + user (confirmed) | Absolute path to target repo |
| `branch` | `string \| null` | `/start-work` output | Git branch name |
| `workSlug` | `string \| null` | `/start-work` output | `.work/<slug>` directory name |
| `projectId` | `string \| null` | Triage | Link to parent project |

---

## 2. Stage Definitions

### Actionable tasks (implementation, review, investigation)

| Stage | Label | Trigger | Skill invoked | What happens |
|-------|-------|---------|--------------|-------------|
| `new` | Inbox | Triage creates task | — | Task appears in kanban |
| `start_work` | Planning | User clicks "Start Work", confirms repo | `/start-work <ticket>` | Agent discovers code, writes plan.md |
| `plan_review` | Plan Review | Auto after start_work (large scope) or user clicks "Review Plan" | `/plan-review` | Parallel reviewer agents assess plan |
| `hack` | Building | User clicks "Start Hack" (or auto after plan approval) | `/hack` (or `/hack full auto`) | Agent implements phases, commits per task |
| `ship` | Shipping | User clicks "Ship" (or auto after hack completes) | `/ship` | Verify, commit, push, open PR |
| `code_review` | Reviewing | Auto after ship | `/code-review` | Parallel reviewer agents, findings + fixes |
| `pr_feedback` | PR Feedback | When PR has review comments | `/handle-pr-feedback` | Triage, validate, fix reviewer comments |
| `done` | Done | PR merged (detected by triage) or user marks done | — | Task complete |

### Human tasks (response, meeting_prep)

| Stage | Label | What happens |
|-------|-------|-------------|
| `new` | Inbox | Task appears in kanban |
| `preparing` | Preparing | Agent gathers context (Slack threads, calendar, attendees) |
| `ready` | Ready | Structured output: talking points (meeting_prep) or suggested responses (response) |
| `done` | Done | User has responded/attended |

---

## 3. Project Model

### What is a project

A project groups related tasks under one umbrella. It has:

```typescript
interface Project {
  id: string;                    // e.g., "proj-perf-agent-chat"
  name: string;                  // e.g., "Performance Agent Chat"
  source: "linear" | "slack" | "ai";  // how it was detected
  sourceId?: string;             // Linear project ID, Slack channel ID
  tasks: string[];               // notification IDs belonging to this project
  context: {
    linearTickets: string[];     // VEC-24, VEC-23
    slackChannels: string[];     // channel IDs
    prs: string[];               // PR URLs
    notionDocs: string[];        // Notion URLs
  };
  createdAt: string;
  updatedAt: string;
}
```

### Auto-detection by triage

The triage agent detects projects from:

1. **Linear projects/initiatives**: tickets belonging to the same Linear project are grouped automatically
2. **Slack `#proj-*` channels**: any channel starting with `proj-` or `project-` creates a project. All tasks from that channel belong to it.
3. **AI grouping**: triage agent clusters related tasks by topic — e.g., multiple DMs and tickets about "performance agent" → one project
4. **Explicit Linear parent**: if a ticket has a parent issue or belongs to an initiative, that's the project

### Triage output changes

The triage output format gains:

```json
{
  "actionable": [
    {
      "title": "VEC-24: Add conversation history",
      "project": "Performance Agent Chat",
      "project_source": "linear",
      "project_source_id": "proj-abc123",
      ...
    }
  ],
  "projects": [
    {
      "name": "Performance Agent Chat",
      "source": "linear",
      "source_id": "proj-abc123",
      "related_channels": ["C0ANYETEVDE"],
      "related_tickets": ["VEC-24", "VEC-23"]
    }
  ]
}
```

Tasks without a detected project go to an "Ungrouped" default project.

### Task splitting

When the triage agent detects a large-scope item (ticket description mentions multiple deliverables, or the summary implies several independent work streams), it splits into multiple tasks under the same project:

```json
{
  "actionable": [
    { "title": "VEC-24: Add conversation history", "project": "Perf Agent Chat", ... },
    { "title": "VEC-24: Port chat UI from TTSA", "project": "Perf Agent Chat", ... },
    { "title": "VEC-24: Unify agent chat contract", "project": "Perf Agent Chat", ... }
  ]
}
```

Each subtask gets its own branch, session, and PR. The triage skill file (`triage-rules/SKILL.md`) is updated with splitting instructions.

---

## 4. Repo Detection

### How triage detects the repo

1. **Linear team label**: `VEC-*` tickets → `monolith-django` (configurable mapping in `config.json`)
2. **GitHub PR URL**: extract `owner/repo` from the URL
3. **Slack channel mapping**: channels like `#monolith-prs` → `monolith-django`
4. **Config**: `repoMappings` in `DeckConfig`:
   ```typescript
   repoMappings?: Array<{
     pattern: string;       // "VEC-*" or "#monolith-*" or "monte-carlo-data/monolith-*"
     repoPath: string;      // "/Users/kieran/Documents/GitHub/monolith-django"
   }>;
   ```

### User confirmation

When the user clicks "Start Work", the UI shows:
- **Detected repo**: `monolith-django` (from VEC-24 team label) — dropdown to change
- **Branch**: `kwilliams/vec-24-chat-rendering` (auto-derived, editable)
- **Scope**: auto-classified, overridable
- **Confirm** button → spawns `/start-work`

If no repo is detected, the dropdown defaults to "Select a repo..." and the user must pick one.

---

## 5. Structured UI

Every stage renders parsed structured output, not raw markdown.

### Plan view (after `/start-work`)

Parsed from `.work/<slug>/plan.md`:

- **Header**: ticket ID, scope badge (Small/Medium/Large), branch name
- **Context section**: collapsible, shows relevant files table, discovery findings
- **Phases**: collapsible accordion, each containing:
  - Phase name + description
  - Task checklist (checkboxes, each with commit message preview)
  - Verification commands
- **Actions**: "Start Hack" button, "Review Plan" button (for large scope), "Edit Plan" (opens in editor)

### Hack progress view (during/after `/hack`)

- **Phase progress bar**: X of Y tasks complete
- **Per-task status**: pending → in progress (spinner) → committed (green check) → failed (red)
- **Live activity log**: tool calls, file edits, test results (existing activity pane)
- **Commit history**: list of commits made by the agent

### Ship view (after `/ship`)

- **PR card**: title, URL (clickable), status badge, branch → main
- **Verification results**: format ✓, typecheck ✓, tests ✓ (or ✗ with details)
- **Linear status**: "Moved to In Review"

### Review view (after `/code-review`)

Parsed from `.work/<slug>/reviews/*.md`:

- **Findings list**: cards with severity badge (BLOCKER red, ISSUE orange, SUGGESTION blue, NIT gray)
- Each finding: file reference (clickable), description, suggestion, confidence, reviewer name
- **Fix status**: checkbox per finding — checked = will fix, unchecked = skip
- **Actions**: "Fix Selected" button, "Post to PR" button

### Response/Meeting Prep view

- **Context sidebar**: fetched Slack messages, calendar event, attendees
- **Suggested responses** (response type): selectable cards, each with a draft reply. Click to copy or send.
- **Talking points** (meeting_prep type): bullet cards with context snippets, draggable to reorder

---

## 6. What Gets Removed

| Current code | Replaced by |
|-------------|-------------|
| `askMcpPlanningAgent()` in mcp-bridge.ts | `skill-runner.ts` for actionable tasks |
| `askEphemeralProcess()` for plan iteration | `--resume` + `/hack` or feedback via skill runner |
| `buildMcpPlanningPrompt()` in planning-contract.ts | MC `/start-work` skill handles planning |
| Custom plan format (SECTION 1/SECTION 2) | MC plan.md format (phased, with frontmatter) |
| `prepareWorkPlan()` in work-dispatcher.ts | Skill runner invoking `/start-work` |
| Custom triage skills in `.claude/skills/triage-*` | Keep — triage is Deck-specific, not an MC skill |
| `contextBridge` (already removed) | Was already removed |

### What stays

- **Poll bridge + triage**: notification system is Deck-specific, keeps running
- **Stream-json infrastructure**: reused by skill runner
- **Event streaming IPC**: reused for skill output
- **Process monitor**: tracks skill runner processes too
- **Smart lookback**: poll optimization stays
- **Standup page**: reads from notifications, unaffected
- **Manager chat**: separate system, unaffected

---

## 7. Data Model Changes

### Notification (PollNotification)

New fields:

```typescript
sessionId?: string;        // Claude Code session for --resume
repoPath?: string;         // absolute path to target repo
branch?: string;           // git branch created by /start-work
workSlug?: string;         // .work/<slug> directory name
projectId?: string;        // link to parent project
```

### Project (new)

```typescript
interface Project {
  id: string;
  name: string;
  source: "linear" | "slack" | "ai";
  sourceId?: string;
  tasks: string[];           // notification IDs
  context: {
    linearTickets: string[];
    slackChannels: string[];
    prs: string[];
    notionDocs: string[];
  };
  createdAt: string;
  updatedAt: string;
}
```

Stored in `projects-cache.json` alongside `notifications-cache.json`.

### DeckConfig additions

```typescript
repoMappings?: Array<{
  pattern: string;      // "VEC-*", "#monolith-*", etc.
  repoPath: string;     // absolute path
}>;
```

---

## 8. Pages

### Projects page (new: `/projects`)

- **List view**: all projects with name, task count, progress (X of Y done), latest activity timestamp
- **Click into project**: project detail page
  - **Context sidebar**: all Slack channels, Linear tickets, PRs, Notion docs (clickable)
  - **Per-project kanban**: tasks in that project flowing through stages
  - **Activity timeline**: aggregated timeline across all tasks in the project

### Existing pages (modified)

- **Inbox (kanban)**: tasks now show project badge. Can filter by project.
- **Task detail pane**: structured UI per stage (Section 5). Shows project name as a link.
- **Settings**: new "Repo Mappings" section for pattern → path configuration. Skill check warning.
- **Nav**: add "Projects" tab between "Inbox" and "Schedule"

---

## 9. Implementation Phases

### Phase 1: Skill Runner + Stage Wiring
- `skill-runner.ts`: spawn, stream events, parse output, save session ID
- Stage definitions: new stages in task-utils (start_work, hack, ship, code_review, etc.)
- "Start Work" UI: repo confirmation modal, branch preview
- Startup skill check

### Phase 2: Structured UI Parsers
- Plan parser: reads `.work/<slug>/plan.md` → structured data (phases, tasks, files)
- Review parser: reads `.work/<slug>/reviews/*.md` → findings with severity
- Plan view component, hack progress component, review findings component

### Phase 3: Project Model + Triage Changes
- Project data model + cache
- Triage skill updates: project detection, task splitting, project output format
- Projects page: list view + detail view with per-project kanban
- Inbox kanban: project badges + filter

### Phase 4: Human Task Flows
- Response task: context gathering + suggested replies UI
- Meeting prep task: context gathering + talking points UI
- Calendar integration fix (meeting preps not showing up)

---

## 10. Test Strategy (BDD — Tests First)

### Existing tests: impact assessment

| Status | Count | Files |
|--------|-------|-------|
| **REMOVE** | 4 | `mcp-planning.test.ts`, `orchestrated-planning.test.ts`, `planner-system-prompt.test.ts`, `unified-stages.test.ts` |
| **MODIFY** | 6 | `e2e-pipeline.test.ts`, `poll-service.test.ts`, `stage-reconciliation.test.ts`, `priority-dedup-timeline.test.ts`, `plan-regen-state.test.ts`, `future-features.test.ts` |
| **UNAFFECTED** | 6 | `smart-lookback.test.ts`, `schedule-regenerate.test.ts`, `schedule-time-bugs.test.ts`, `url-validation.test.ts`, `slack-deeplink.test.ts`, `process-monitor.test.ts` |

### New test files (write BEFORE implementation)

#### `skill-runner.test.ts` — Core skill execution
- Spawns with correct args: `--stream-json`, `--no-chrome`, `--verbose`, cwd = repoPath
- First invocation omits `--resume`; subsequent includes `--resume <sessionId>`
- Sets `CLAUDE_HIVE=1` in env
- Sends skill slash command as stdin message
- Extracts session ID from init message
- Streams events (tool_use, text, result) via callback
- Handles timeout (kills process, returns error)
- Handles process crash (returns error, session ID still valid for retry)
- Process dies after result (not kept alive)

#### `plan-parser.test.ts` — Parse `.work/<slug>/plan.md`
- Parses frontmatter: skill, ticket, branch, status, pr
- Extracts phases with names and descriptions
- Extracts tasks within phases (checkbox state, commit message, description)
- Extracts relevant files table
- Handles partial/incomplete plans (mid-`/start-work`)
- Handles plan with all tasks checked (complete)
- Extracts scope classification (Small/Medium/Large)

#### `review-parser.test.ts` — Parse `.work/<slug>/reviews/*.md`
- Parses finding cards: ref ID, severity, file reference, reviewer, description, suggestion, confidence
- Categorizes by severity (BLOCKER, ISSUE, SUGGESTION, NIT)
- Tracks fix status per finding (checked, fixed, skipped, deferred)
- Handles multiple review files (incremental reviews)
- Extracts reviewer names

#### `project-model.test.ts` — Project CRUD and detection
- Create project with name, source, sourceId
- Add/remove tasks from project
- Auto-detect project from Linear project ID
- Auto-detect project from Slack `#proj-*` channel name
- Merge duplicate projects (same Linear project detected from different sources)
- Update project context (add PR URL, add Slack channel)
- Persist and load from `projects-cache.json`

#### `triage-projects.test.ts` — Triage output with projects
- Triage output includes `projects` array
- Tasks include `project` field linking to detected project
- Task splitting: large-scope ticket → multiple tasks under same project
- Cross-source grouping: Linear ticket + Slack thread about same topic → same project
- Ungrouped tasks get default project

#### `repo-detection.test.ts` — Repo path resolution
- Detects repo from Linear team label + `repoMappings` config
- Detects repo from GitHub PR URL
- Detects repo from Slack channel mapping
- Falls back to null when no mapping matches
- Config validation: repoMappings patterns

#### `stage-transitions.test.ts` — New stage flow
- `new` → `start_work` when "Start Work" clicked
- `start_work` → `hack` when plan approved
- `start_work` → `plan_review` when large scope
- `plan_review` → `hack` when review passes
- `hack` → `ship` when all phases complete
- `ship` → `code_review` after PR created
- `code_review` → `pr_feedback` when comments exist
- `pr_feedback` → `done` when all addressed
- `code_review` → `done` when clean review
- Invalid transitions rejected (e.g., `new` → `hack`)

#### `structured-ui.test.ts` — UI data contracts
- Plan view data shape: phases array, tasks array, files table, scope badge
- Hack progress data shape: phase progress, per-task status, commit list
- Ship view data shape: PR card (url, status), verification results
- Review view data shape: findings list with severity, fix status
- Response view data shape: context items, suggested replies
- Meeting prep view data shape: talking points, attendee list, context links

### Modified test files

#### `e2e-pipeline.test.ts`
- Update stage progression: `new → start_work → hack → ship → code_review → done`
- Add new notification fields to test data: `sessionId`, `repoPath`, `branch`, `workSlug`, `projectId`
- Replace `prepareWorkPlan` references with skill runner invocation

#### `poll-service.test.ts`
- Update triage output parsing to handle `projects` array
- Update dedup to handle `projectId` field
- Verify task splitting in triage response

#### `stage-reconciliation.test.ts`
- Update stage names: `planning` → `start_work`
- Add reconciliation for new stages (`hack`, `ship` — reset to previous stage on crash)

#### `priority-dedup-timeline.test.ts`
- Update `VALID_STAGES` constant to new 8-stage system
- Update `STAGE_ORDER` ranking

#### `future-features.test.ts`
- Activate skipped tests that describe skill-based behavior
- Update to match actual skill runner API

### Verification

1. `npx vitest run` — all tests pass (new + modified + unaffected)
2. `npx tsc --noEmit` — compiles clean
3. Manual E2E: "Start Work" on real Linear ticket → structured plan UI → "Hack" → progress → "Ship" → PR
