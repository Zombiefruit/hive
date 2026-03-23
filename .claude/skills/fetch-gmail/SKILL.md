---
name: fetch-gmail
description: Fetch recent emails for Kieran Williams. Use when gathering email notifications.
allowed-tools: mcp__claude_ai_Gmail__gmail_search_messages, mcp__claude_ai_Gmail__gmail_read_message, mcp__claude_ai_Gmail__gmail_list_labels, ToolSearch
user-invocable: false
---

# Fetch Gmail

Fetch recent emails for Kieran Williams from the specified timeframe.

## What to fetch

1. **Unread emails**: Search for unread messages
2. **Important emails**: Check messages marked important
3. For each email, capture:
   - Subject
   - Sender (name and email)
   - Preview/snippet
   - When received
   - Labels (inbox, important, etc.)

## Skip
- Automated notifications (GitHub, Linear, Slack email notifications)
- Marketing/promotional emails
- Calendar invitations (those are in Google Calendar)

## Output
Return a structured text report with all findings.
