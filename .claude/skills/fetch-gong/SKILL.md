---
name: fetch-gong
description: Instructions for fetching Gong call intelligence data during the poll cycle.
user-invocable: false
---

# Fetch Gong Data

Use the Gong MCP tools to retrieve recent call intelligence.

## Steps

1. **List recent calls**: Use `mcp__claude_ai_Gong__list_calls` with:
   - `from_date`: "{{CUTOFF_DATE}}" (ISO 8601 format)
   - `to_date`: current date/time
   - `limit`: {{GONG_LIMIT}}

2. **Get call details**: For each call, use `mcp__claude_ai_Gong__get_call_details` to get:
   - Participants and their roles
   - Talk-time breakdown
   - Topics discussed and trackers triggered
   - Questions asked during the call
   - Call duration and outcome

3. **Search for relevant calls** (optional): Use `mcp__claude_ai_Gong__search_calls` if looking for specific topics.

## Output Format

For each call, return:
- Call ID
- Date and time
- Participants (names and roles)
- Duration
- Key topics discussed
- Action items mentioned
- Questions raised
- Customer sentiment (if applicable)

Focus on calls where {{USER_NAME}} participated or that are relevant to their team's work.
