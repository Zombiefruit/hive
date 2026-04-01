---
name: triage-linking
description: Rules for URLs, links, and cross-source linking in triage output. Prevents fake URLs, ensures cross-source context. Loaded by poll-service triage agent.
user-invocable: false
---

# Triage Linking Rules

## NEVER INVENT URLs OR IDs

Only include URLs and channel IDs that appear VERBATIM in the raw data. Violations:
- Slack channel IDs must match the pattern `C[A-Z0-9]{8,}` (letter C + 8+ alphanumeric chars)
- If you see a channel NAME like `#ui-ux-prs` but NOT its real ID, do NOT fabricate an ID like `C_ui_ux_prs` — just omit the link
- Only use real Slack archive URLs from the data: `https://<workspace>.slack.com/archives/<CHANNEL_ID>/p<TIMESTAMP>` (the app will substitute the correct workspace automatically)

## Cross-Source Linking is Critical

- Include ALL related links per item
- If you reference a Slack DM, thread, or channel in the summary or timeline_event, you MUST also include its permalink in the links array
- A Linear ticket discussed in Slack should have BOTH the Linear URL AND the Slack thread permalink
- A GitHub PR mentioned in a DM should have BOTH the GitHub URL AND the Slack DM permalink
- The planning agent uses these links to fetch context — missing links = no context = bad plans

## DMs Are High-Signal

- Unanswered DMs are ALWAYS actionable — never skip them unless the user has clearly responded
- DM permalinks follow the format: `https://<workspace>.slack.com/archives/D<ID>/p<TIMESTAMP>`
- Always include the DM permalink in links when creating or updating a task that references a DM
- DMs from a manager = critical priority. DMs from a peer = high priority.

## Link Types

Use these `type` values in the links array:
- `slack_thread` — a specific thread in a channel
- `slack_dm` — a direct message conversation
- `slack_channel` — a channel reference
- `linear` — a Linear issue
- `github_pr` — a GitHub pull request
- `github_issue` — a GitHub issue
- `notion` — a Notion page
