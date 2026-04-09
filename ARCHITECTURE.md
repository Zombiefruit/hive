# Relay Architecture Map

Quick-reference for navigating the codebase. See PRODUCT_SPEC.md for the "what", this doc for the "where" and "how".

## Code Paths That Matter

### Planning (task enters start_work or preparing)

```
User clicks "Move to Planning"
  → DetailDrawer.handlePrepare()          # src/renderer/components/DetailDrawer.tsx
  → window.deck.prepareWorkPlan()         # IPC to main process
  → work-dispatcher.prepareWorkPlan()     # src/main/notifications/work-dispatcher.ts
    Step 1: fetchGitHubContext()           # gh CLI, instant
    Step 2: askFetchBridge(contextPrompt)  # Uses EXISTING bridge (no init), fetches Slack/Linear
    Step 3: askEphemeralProcess(planPrompt)# Spawns light process (no MCP tools, instant start)
  → Plan saved to plans Map + disk cache
  → Stage advances to plan_review (agent) or stays in preparing (human)
```

Both agent and human tasks use the same `prepareWorkPlan` path. No more skill runner for planning.

### Fetching (poll cycle)

```
Poll timer fires
  → poll-service.ts runPollCycle()        # src/main/notifications/poll-service.ts
  → fetchSourcesParallel()                # src/main/notifications/parallel-fetch.ts
    → One askFetchBridge() call per source (Slack, Linear, Calendar, Gmail, Notion)
    → Each source agent fetches + SUMMARIZES findings
    → Summaries merged (small, fits in context)
  → computeDiff() against previous hashes
  → askEphemeralProcess(triagePrompt)     # Sonnet classifies the delta
  → Notifications created/updated
```

### Stage Transitions

```
User drags card OR clicks CTA
  → notifications.tsx moveCardToStage()   # Optimistic UI update
  → window.deck.updateNotificationById()  # IPC to main
  → poll-service.ts updateNotificationById()
    → canDropTo() validation              # src/shared/stage-machine.ts
    → Stage regression guard              # Only allows forward + specific back-steps
  → executeStageTransition()              # Fires skill or plan agent based on STAGE_ACTIONS
```

### Process Spawning (who spawns what)

| Function | File | What it spawns | MCP tools? | Typical use |
|----------|------|---------------|------------|-------------|
| `askFetchBridge()` | mcp-bridge.ts | Persistent Haiku bridge | Yes (shared) | Poll fetch |
| `askEphemeralProcess()` | mcp-bridge.ts | One-shot process | No | Triage, planning, iteration |
| `askMcpPlanningAgent()` | mcp-bridge.ts | One-shot with MCP | Yes (fresh) | **Avoid** - slow init |
| `runSkill()` | skill-runner.ts | Session-persistent process | Yes (fresh) | /hack, /ship, /code-review |

**Rule**: Never spawn fresh MCP processes for planning. Use the bridge for data, ephemeral for thinking.

### Timeouts

| Where | Phase | Duration | Type |
|-------|-------|----------|------|
| mcp-bridge: planning agent | Init | 5 min | Hard kill |
| mcp-bridge: planning agent | Working | 120s silence | Inactivity |
| mcp-bridge: ephemeral | Total | 180s default | Hard kill |
| skill-runner | Init | 5 min | Hard kill |
| skill-runner | Working | 120s silence | Inactivity |
| poll-service: fetch | Total | 5 min / 10 min | Hard kill |
| poll-service: triage | Total | 5 min / 10 min | Hard kill |

## Key Files

### Backend (src/main/)

| File | Lines | Purpose |
|------|-------|---------|
| `mcp-bridge.ts` | ~700 | Bridge management, process spawning |
| `notifications/poll-service.ts` | ~800 | Notification store, polling, triage |
| `notifications/work-dispatcher.ts` | ~750 | Plan creation, work agent orchestration |
| `notifications/parallel-fetch.ts` | ~160 | Per-source parallel data fetching |
| `skill-runner.ts` | ~580 | Skill execution (/hack, /ship, etc.) |
| `orchestrator.ts` | ~250 | Autonomous task advancement |
| `judge-bridge.ts` | ~100 | Verification judges (triage, plan, work) |

### Shared (src/shared/)

| File | Purpose |
|------|---------|
| `stage-machine.ts` | Stage definitions, transitions, track routing |
| `task-utils.ts` | Priority, dedup keys, stage ordering |
| `planning-contract.ts` | Prompt builders for planning agents |
| `triage-parser.ts` | Parse triage AI output |
| `poll-diff.ts` | Change detection between poll cycles |

### Frontend (src/renderer/)

| File | Purpose |
|------|---------|
| `pages/notifications.tsx` | Kanban board, drag-and-drop, stage execution |
| `components/DetailDrawer.tsx` | Task detail view, CTA dispatch, plan display |
| `components/AgentTab.tsx` | Agent conversation, activity log |
| `stores/manager-store.ts` | Orchestrator chat state |

## Known Redundancy

1. **Two transition validators**: `canDropTo()` in stage-machine.ts AND `isValidTransition()` in task-utils.ts. Should consolidate to one.
2. **Process spawn boilerplate**: Every spawner (bridge, planning, ephemeral, skill, judge) has ~50 lines of identical setup. Should extract factory.
3. **Verdict parsing**: Three judge parsers with near-identical structure. Should genericize.
4. **Stage guards**: Triage guard in poll-service.ts, user guard in updateNotificationById, drag guard in canDropTo. Three places enforcing similar rules.

## Task Type Routing

| Type | Track | Planning stage | Planning method |
|------|-------|---------------|-----------------|
| `implementation` | Agent | start_work | prepareWorkPlan (bridge + ephemeral) |
| `response` | Human | preparing | prepareWorkPlan (bridge + ephemeral) |
| `meeting_prep` | Human | preparing | prepareWorkPlan (bridge + ephemeral) |
| `review` | Human | preparing | prepareWorkPlan (bridge + ephemeral) |
| `investigation` | Human | preparing | prepareWorkPlan (bridge + ephemeral) |
