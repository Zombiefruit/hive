---
name: fetch-slack
description: Instructions for fetching Slack messages, threads, and channel history during the poll cycle.
user-invocable: false
---

# Fetch Slack Data

For each configured Slack channel, use `mcp__claude_ai_Slack__slack_read_channel` with the channel_id and limit {{SLACK_LIMIT}}.

{{CHANNEL_LIST}}

For DMs from the manager, use `mcp__claude_ai_Slack__slack_search_public_and_private`.

## For each message/thread, capture:
- **Who** sent it (name, not ID)
- **What** they said (exact quote or summary)
- **Where** — channel NAME and channel ID (e.g., #team-vector / C0AMSV2SK4Z)
- **When** — timestamp
- **Permalink** — full Slack archive URL: `{{SLACK_BASE_URL}}/archives/CHANNEL_ID/pTIMESTAMP`

## Response Detection
Flag threads where {{USER_NAME}} ({{USER_SLACK_ID}}) hasn't replied as "NEEDS RESPONSE".

## Important: "Also send to channel" behavior
Slack allows "Also send to channel" replies that appear in the channel but may NOT appear in thread API responses. When checking if someone replied to a thread, ALSO look at channel messages around the same time that reference the thread.
