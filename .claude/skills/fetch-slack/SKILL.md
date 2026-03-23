---
name: fetch-slack
description: Fetch Slack mentions, DMs, and thread replies for Kieran Williams. Use when gathering Slack notifications.
allowed-tools: mcp__claude_ai_Slack__slack_search_public_and_private, mcp__claude_ai_Slack__slack_read_channel, mcp__claude_ai_Slack__slack_read_thread, mcp__claude_ai_Slack__slack_read_user_profile, mcp__claude_ai_Slack__slack_search_users, mcp__claude_ai_Slack__slack_search_channels, ToolSearch
user-invocable: false
---

# Fetch Slack Notifications

Fetch all Slack activity for Kieran Williams (User ID: U02PKBZSB9Q) from the timeframe specified in `$ARGUMENTS` (default: last 6 hours).

## What to fetch

1. **@mentions**: Search for `<@U02PKBZSB9Q>` in all channels
2. **DMs**: Check direct messages to Kieran
3. **Thread replies**: Check threads where Kieran has been tagged

## For each message, capture:
- **Who** sent it (name, not just ID — use slack_read_user_profile if needed)
- **What** they said (exact quote)
- **Where** (channel name and thread link)
- **When** (timestamp)
- **Context**: If it's a thread, include the parent message for context

## Key channels
- C0AMSV2SK4Z = #team-vector
- C0AMT1AGN7K = #team-vector-standup
- C0ALAC5N91S = #kieran-task-bot

## Output
Return a structured text report with all findings. Don't filter or prioritize — return everything. Another agent will triage.
