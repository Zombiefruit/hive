# Urgent Backlog — Hacking Flow & Agent UX

These are blocking issues that prevent the core hack→ship→review workflow from functioning.

## 1. /hack skill can't find the plan

**Status**: BROKEN
**Symptom**: `/hack` runs, looks for `.work/` directory, can't find it, says "No plan found for this branch"
**Root cause**: `prepareWorkPlan` saves plans to an in-memory Map + JSON file (`plans-cache.json`), NOT to the `.work/` directory that the `/hack` skill expects. The plan never gets written to the repo's `.work/` folder.
**Fix needed**: When advancing from plan_review → hack, write the plan to `{repoPath}/.work/{slug}/plan.md` so the `/hack` skill can find it. The slug comes from the notification's `workSlug` or branch name.

## 2. No "Work" tab showing hack progress

**Status**: MISSING
**Symptom**: When a task is in hack/ship/code_review, there's no tab showing: worktree status, code diff, file changes, agent progress
**Fix needed**: Add a "Work" tab to DetailDrawer that shows:
- Worktree path and branch
- Git diff / changed files summary
- Agent activity log (tool calls, file edits)
- Link to open in editor / terminal
The WorktreePanel component exists but is only shown conditionally and doesn't have full diff display.

## 3. MCP tools failed to load after 300s (INIT TIMEOUT TOO SHORT?)

**Status**: INTERMITTENT  
**Symptom**: Init timeout fires at 60s even though we proved Claude inits in ~10s
**Investigation needed**: The 60s init timeout might be too aggressive if there are network hiccups. But the deeper issue is that the skill runner deadlock fix (send message immediately) might not have been picked up. Need to verify after restart.

## 4. Worktree creation fails silently

**Status**: BROKEN
**Symptom**: "Worktree creation failed — running in main repo" with no explanation
**Root cause**: The worktree creation in skill-runner.ts tries to create a worktree for the branch but fails. Could be: branch already exists as worktree, dirty state, branch name mismatch.
**Fix needed**: Better error reporting (show the actual git error), and handle the case where a worktree already exists (reuse it).

## 5. Agent errors should go to judge, not just fail silently

**Status**: MISSING
**Symptom**: When /hack fails ("No plan found"), it just shows "Skill complete (210 chars)" — no escalation, no recovery
**Fix needed**: When a skill fails or produces a short/error result, pipe it to the work judge. If the judge says it failed, show an actionable error with retry options. Don't just silently mark it as complete.

## 6. Hack stage doesn't show in-progress state properly  

**Status**: BROKEN
**Symptom**: When task enters hack, there's no loading indicator or "agent working" state in the UI
**Root cause**: The `inProgress` flag on STAGE_ACTIONS triggers `executeStageTransition` which calls `runSkill`, but the UI doesn't show the skill's progress in the detail drawer unless the user opens it
**Fix needed**: Show progress indicator on the card itself (not just inside the drawer), and make sure the Agent tab streams the skill output.
