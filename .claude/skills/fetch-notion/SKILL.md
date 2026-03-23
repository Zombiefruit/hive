---
name: fetch-notion
description: Fetch Notion pages, mentions, and docs relevant to Kieran Williams. Use when gathering specs, RFCs, or documentation context.
allowed-tools: mcp__claude_ai_Notion__notion-search, mcp__claude_ai_Notion__notion-fetch, mcp__claude_ai_Notion__notion-get-comments, mcp__claude_ai_Notion__notion-get-users, mcp__claude_ai_Notion__notion-get-teams, mcp__claude_ai_Notion__notion-query-data-sources, mcp__claude_ai_Notion__notion-query-meeting-notes, ToolSearch
user-invocable: false
---

# Fetch Notion Activity

Fetch recent Notion activity for Kieran Williams.

## What to fetch

1. **Recent mentions**: Pages where Kieran was mentioned
2. **Updated specs/RFCs**: Recently modified documents in relevant workspaces
3. **Meeting notes**: Recent meeting notes (especially 1:1s, team meetings)

For each page:
- Title
- Last edited by and when
- Any comments mentioning Kieran
- Brief content summary

## Output
Return a structured text report with page titles, URLs, and summaries.
