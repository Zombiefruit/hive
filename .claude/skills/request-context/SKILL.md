---
name: request-context
description: Request external context (Slack, Linear, Notion, GitHub) from the system. Use this when you need data to create a plan or analyze a task.
user-invocable: false
---

# Request Context from the System

You do NOT have direct access to Slack, Linear, Notion, or other external tools.
Instead, output a structured JSON request and the system will fetch the data for you.

## How It Works

1. You output a JSON block with `context_requests`
2. The system intercepts it, fetches the data via MCP
3. You receive all the data in your next prompt

## JSON Format

```json
{
  "context_requests": [
    {"type": "linear-issue", "id": "VEC-20"},
    {"type": "slack-thread", "channel": "C0AMSV2SK4Z", "thread_ts": "1711234567.890"},
    {"type": "slack-channel", "channel": "C0AMSV2SK4Z", "limit": 20},
    {"type": "notion-page", "url": "https://notion.so/..."},
    {"type": "github-pr", "repo": "owner/repo", "number": "123"}
  ]
}
```

## Available Types

| Type | Required Fields | What It Fetches |
|------|----------------|-----------------|
| `linear-issue` | `id` (e.g., "VEC-20") | Full issue: title, description, status, priority, assignee, comments |
| `slack-thread` | `channel`, `thread_ts` | All messages in thread with authors and timestamps |
| `slack-channel` | `channel`, optional `limit` | Recent messages in channel (default 20) |
| `notion-page` | `url` | Page title and content |
| `github-pr` | `repo`, `number` | PR details: title, body, state, reviews, files changed |

## Rules

- Extract IDs from links in the task description (e.g., `linear.app/issue/VEC-20` → `{"type": "linear-issue", "id": "VEC-20"}`)
- Channel IDs start with `C` (e.g., `C0AMSV2SK4Z`)
- If you don't need any external context, return `{"context_requests": []}`
- Return ONLY the JSON — no commentary before or after
