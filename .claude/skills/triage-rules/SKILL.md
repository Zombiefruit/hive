---
name: triage-rules
description: Rules for triaging incoming notifications — priority levels, dedup, stage transitions, garbage filtering, task classification. Loaded by poll-service triage agent.
user-invocable: false
---

# Triage Rules

## Critical Rules

1. **TIME FILTER — MOST IMPORTANT**: ANY event, meeting, or deadline that has ALREADY PASSED must go to "skipped" with reason "Already passed".

2. **AGGRESSIVE CROSS-SOURCE DEDUP**: A Linear ticket and a Slack thread about the SAME deliverable = ONE item. When merging, keep the item with the most context and add ALL links.

3. **Done/merged/closed/resolved -> skip.** Don't include completed work.

4. **DISCARD GARBAGE — NEVER create tasks for these:**
   - Permission denied / auth errors ("Permission not granted", "MCP tool failed", "Request timed out")
   - Fetch failures or empty results from any source
   - Bot notifications: Geekbot, Standup bots, CI/CD alerts, Datadog, PagerDuty
   - Newsletter digests, marketing emails, LinkedIn notifications
   - Standup reports/reminders (Geekbot messages about standups are NOT meeting prep tasks)
   - If data for a source is missing or errored, just ignore that source — do NOT create a task about the error itself.
   - Past events: if a meeting/standup/sync has ALREADY HAPPENED, skip it. Do NOT create meeting_prep for past events.

5. **UPDATE TASK STAGES based on evidence:**
   - If an existing task has a PR (draft or open) -> update stage to "working"
   - If an existing task's PR was merged or ticket was closed -> update stage to "done"
   - If someone replied in a thread that was "response" type and the user hasn't replied back -> keep as actionable
   - If the user already replied in a thread -> update to "done" or "follow_up"
   - If a Linear ticket changed status (e.g., "In Progress" -> "In Review") -> update the summary/action_needed

6. **PRIORITY LEVELS** — Be strict about these definitions:
   - **critical**: Direct ask that needs a response NOW. Manager asking for something = critical. Blocking someone else's work = critical. Only use this when it truly can't wait.
   - **high**: Should be done today. Unread threads where the user was tagged and hasn't replied. Active PR reviews. Same-day deadline.
   - **medium**: Should be done this week. Assigned tickets, non-urgent code tasks, planning items.
   - **low**: When you have time. FYI threads, optional reviews, nice-to-have improvements.
   - **backlog**: Informational only. Tips, announcements, completed items that don't need action.

7. **UNREAD THREADS**: If someone tagged/messaged the user and they haven't replied, that's a "response" item. Priority depends on WHO asked — manager = critical, lead = high, peer = high, external = medium. **Important:** A reply from the user that appears in the CHANNEL but not in the thread (Slack's "Also send to channel" feature) still counts as a reply — check channel messages too, not just the thread API.

8. **Classify task type** — be precise, this determines the UI:
   - **response**: Someone asked the user something and they haven't replied (DMs, @mentions, thread questions)
   - **meeting_prep**: Upcoming calendar event needing preparation
   - **review**: PR review or code review request
   - **implementation**: Assigned ticket requiring building/coding
   - **investigation**: Research or analysis task before building
   - DO NOT default everything to implementation. Unanswered messages = response.

## Dedup with Existing Tasks

When existing tasks are provided:
- If incoming data matches an existing task (same ticket ID, same PR, same Slack thread, same topic), do NOT create a new item. Instead, add it to the "updates" array with the existing task's ID and any changed fields.
- Match liberally: "VEC-10" in a Slack thread matches existing Linear ticket "VEC-10". A PR URL in an email matches an existing GitHub review task for the same PR.
- Only create a NEW item if it genuinely doesn't exist in the list above.
- If nothing has changed for an existing task, just skip it entirely.

## Additional Rules

- Sort by confidence (highest first)
- EVERY raw item must appear in exactly ONE array. Nothing silently dropped.
- When in doubt about dedup, MERGE into one item with all links rather than showing duplicates.

## Project Grouping

Group related tasks into projects. PREFER FEWER, BROADER projects over many narrow ones.

**Detection sources** (in priority order):
1. Linear projects/initiatives — tickets belonging to the same Linear project
2. Slack `#proj-*` or `#project-*` channels — all activity from that channel
3. Tickets with a parent issue or belonging to an initiative
4. AI-detected topic clusters — multiple items about the same area of work

**Consolidation rules:**
- Sub-features of the same effort belong to ONE project, not separate projects
- When in doubt, merge into one project — the user can split later
- Each project should represent a meaningful body of work that spans multiple tasks
- If two candidate projects share overlapping tickets, channels, or team members, they're probably one project

**Recursive confirmation:**
After identifying candidate projects, search for additional context to validate and consolidate:
- Search Slack for the project name or related keywords — are there threads that connect tasks you thought were separate?
- Check if Linear tickets reference each other (parent/child, linked issues, same labels)
- Look for common authors or assignees across tasks — same people working on it = likely same project

## Task Splitting

When a ticket describes multiple independent deliverables, split it into separate tasks under the same project. Each task should be a single `/start-work` → `/hack` → `/ship` cycle.

## Multi-Repo Detection

When a ticket or task describes changes spanning multiple repositories:
- Create a parent task with the full scope as the title
- Create subtasks, one per repo, each describing that repo's portion of the work
- Set `parent_task: true` on the parent and include a `subtasks` array
- Signs of multi-repo scope: mentions "API + frontend", "backend + client", references to multiple repo names, or cross-service changes
- Use `repo_hint` on each subtask to suggest which repo it targets
