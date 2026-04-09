---
description: Architecture reference for navigating the codebase
paths:
  - "src/**"
---

Before making changes, read ARCHITECTURE.md at the repo root. Key rules:

- **Planning** always goes through `prepareWorkPlan()` in work-dispatcher.ts. Never spawn fresh MCP processes for planning — use the existing fetch bridge for data, ephemeral process for thinking.
- **Stage transitions** happen in THREE places: `notifications.tsx` (drag), `DetailDrawer.tsx` (CTA), `poll-service.ts` (triage). Changes to transition logic must update all three.
- **Timeouts** are two-phase: init timeout (5 min hard) + inactivity timeout (120s after init). Both exist in `mcp-bridge.ts` AND `skill-runner.ts`.
- **Triage can only set terminal stages** (done, skipped, backlog). All workflow transitions are user-initiated.
- **`stage-machine.ts`** is the single source of truth for stage actions and transitions.
- **Process spawning**: `askFetchBridge` (persistent, fast), `askEphemeralProcess` (one-shot, fast), `runSkill` (session-persistent, slow init). Avoid `askMcpPlanningAgent` (slow MCP init).
