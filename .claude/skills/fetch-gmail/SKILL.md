---
name: fetch-gmail
description: Instructions for fetching Gmail messages during the poll cycle.
user-invocable: false
---

# Fetch Gmail Data

Use `mcp__claude_ai_Gmail__gmail_search_messages` with:
- query: "is:unread newer_than:{{GMAIL_NEWER}}"
- limit: {{GMAIL_LIMIT}}

Return for each message: subject, sender, preview, date.

Skip bot notifications: GitHub, Linear, Slack, Datadog, PagerDuty, CI/CD alerts.
