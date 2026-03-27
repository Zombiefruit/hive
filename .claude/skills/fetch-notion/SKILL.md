---
name: fetch-notion
description: Instructions for fetching Notion pages during the poll cycle.
user-invocable: false
---

# Fetch Notion Data

Use `mcp__claude_ai_Notion__notion-search` with query "" to find recently updated pages relevant to {{USER_NAME}}'s work.

Return for each page: title, last edited time, and a brief summary of content.

Focus on pages that contain action items, specs, or decisions.
