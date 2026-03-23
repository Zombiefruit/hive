---
name: fetch-linear
description: Fetch Linear tickets assigned to Kieran Williams. Use when gathering Linear notifications.
allowed-tools: mcp__claude_ai_Linear__list_issues, mcp__claude_ai_Linear__get_issue, mcp__claude_ai_Linear__list_comments, mcp__claude_ai_Linear__get_issue_status, mcp__claude_ai_Linear__get_user, mcp__claude_ai_Linear__list_teams, mcp__claude_ai_Linear__get_team, ToolSearch
user-invocable: false
---

# Fetch Linear Tickets

Fetch all Linear issues for Kieran Williams (username: kwilliams, team: Vector).

## What to fetch

1. **All assigned issues**: List issues assigned to kwilliams
2. **For each issue**: Get full details including:
   - Title, identifier (e.g., VEC-10)
   - Current status (Todo, In Progress, In Review, Done, etc.)
   - Priority (Urgent, High, Medium, Low, None)
   - Description summary
   - Recent comments (last 3)
   - Who created it and when
   - Any labels or project associations

## Important
- Include ALL statuses — the triage agent will decide what's relevant
- For "In Progress" items, note how long they've been in that state
- For items with recent comments, include who commented and what they said

## Output
Return a structured text report with all findings. Include the Linear URL for each issue (https://linear.app/monte-carlo/issue/VEC-XX).
