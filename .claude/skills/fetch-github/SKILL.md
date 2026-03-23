---
name: fetch-github
description: Fetch GitHub PR review requests and mentions for Kieran Williams. Use when gathering GitHub notifications.
allowed-tools: Bash, Read, Grep, Glob, ToolSearch
user-invocable: false
---

# Fetch GitHub Activity

Fetch GitHub activity for Kieran Williams.

## What to fetch

Use `gh` CLI to check:

1. **PR review requests**: `gh pr list --search "review-requested:@me" --state open`
2. **My open PRs**: `gh pr list --author @me --state open`
3. **Mentions**: `gh api notifications --jq '.[] | select(.reason == "mention")'`

For each PR, get:
- Title, number, URL
- **Actual current state**: open, merged, closed, draft
- Who requested the review
- How many files changed
- CI/checks status
- Any review comments

## Critical
- VERIFY the actual state of each PR — do NOT report merged PRs as needing review
- Use `gh pr view <number> --json state,title,reviewRequests,statusCheckRollup` to verify

## Output
Return a structured text report. Include the GitHub URL for each PR.
