---
name: parse-meeting-prep
description: Prepare for an upcoming meeting — gather context, agenda, talking points. Use when there's a meeting coming up.
user-invocable: false
---

# Prepare for Meeting

Given an upcoming calendar event, prepare Kieran for the meeting.

## Input
`$ARGUMENTS` will contain the meeting details (title, attendees, time, agenda)

## What to produce

1. **Meeting summary**: What is this meeting about?
2. **Attendees**: Who's attending and their roles
3. **Agenda**: If available, or infer from meeting title and context
4. **Kieran's prep**:
   - What topics might come up that Kieran should be ready for?
   - Any open items Kieran owes to attendees?
   - Related Linear tickets or PRs to reference
   - Key numbers or metrics to have handy
5. **Talking points**: 2-3 bullet points Kieran might want to bring up
6. **Related context**: Links to relevant Slack threads, Notion docs, PRs

## Special cases
- **1:1 with manager**: Check Linear for status of Kieran's current work, prepare updates
- **Sprint planning**: Have ticket list and estimates ready
- **External meeting**: Research the external contact/company briefly
