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

## CRITICAL: "Also send to channel" replies are INVISIBLE to thread API

When someone replies to a thread and checks "Also send to channel", the reply:
- DOES appear in the channel message stream
- does NOT appear in `slack_read_thread` results

To detect ALL replies (including these invisible ones):
1. Read the thread with `slack_read_thread`
2. Search with `slack_search_public_and_private` using `in:<channel_id>` and keywords from the original message
3. Read the channel with `slack_read_channel` and scan for messages posted AFTER the thread's timestamp

A message from {{USER_SLACK_ID}} found in step 2 or 3 (but not step 1) means they replied via "Also send to channel". This counts as a response — do NOT flag the thread as "NEEDS RESPONSE".
