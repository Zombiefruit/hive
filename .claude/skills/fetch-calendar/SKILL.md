---
name: fetch-calendar
description: Instructions for fetching Google Calendar events during the poll cycle.
user-invocable: false
---

# Fetch Calendar Data

Use `mcp__claude_ai_Google_Calendar__gcal_list_events` for the next 48 hours from {{CURRENT_TIME}}.

Return for each event: title, start time, end time, attendees, location or meeting link.

Skip all-day events that are clearly FYI (holidays, company PTO notices).
