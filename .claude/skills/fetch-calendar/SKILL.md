---
name: fetch-calendar
description: Fetch upcoming Google Calendar events for Kieran Williams. Use when checking schedule or preparing for meetings.
allowed-tools: mcp__claude_ai_Google_Calendar__gcal_list_events, mcp__claude_ai_Google_Calendar__gcal_get_event, mcp__claude_ai_Google_Calendar__gcal_list_calendars, mcp__claude_ai_Google_Calendar__gcal_find_my_free_time, ToolSearch
user-invocable: false
---

# Fetch Calendar Events

Fetch upcoming calendar events for Kieran Williams.

## What to fetch

1. **Today's remaining events**: All events from now until end of day
2. **Tomorrow's events**: Full day view
3. **This week**: Any notable upcoming meetings

For each event, capture:
- Title
- Start/end time
- Attendees (names)
- Location or video link
- Description/agenda if available
- Whether Kieran is the organizer or an attendee

## Special attention
- 1-on-1s with Yael (manager) — note any agenda items
- Team meetings — check if there's a shared doc/agenda
- External meetings — note the company/contact
- Meetings in the next 2 hours get highest priority

## Output
Return a structured text report sorted by time.
