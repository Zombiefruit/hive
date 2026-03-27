---
name: fetch-linear
description: Instructions for fetching Linear tickets during the poll cycle.
user-invocable: false
---

# Fetch Linear Data

Use `mcp__claude_ai_Linear__list_issues` with:
- assignee "{{LINEAR_USER}}", limit {{LINEAR_LIMIT}}
- Also: team "{{TEAM_NAME}}", limit {{LINEAR_TEAM_LIMIT}} (to catch unassigned team tickets)

Only include issues where status is NOT "Done" and NOT "Canceled".

Return for each issue: identifier, title, status, priority, assignee.
