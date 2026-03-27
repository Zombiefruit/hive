# Rich Detail Views — Task Type-Specific UI

## Context

The detail pane currently renders the same chat-style UI for all task types. "Approve plan & start agent" appears for response tasks where it makes no sense. Agent narration pollutes the plan display. Users don't know what will happen when they click action buttons.

This spec splits the detail pane into task-type-specific views with structured rendering and explicit action descriptions.

---

## 1. Architecture

The current monolithic `DetailPane` (~600 lines) becomes a thin router that picks the right view component based on `taskType`:

```
DetailPane (router)
├── header (title, priority, stage badge, links) — shared
├── timeline — shared
├── fetched context — shared
└── view body — task-type-specific:
    ├── ImplementationDetailView (implementation, investigation)
    ├── ReviewDetailView (review)
    ├── ResponseDetailView (response)
    └── MeetingPrepDetailView (meeting_prep)
```

The shared sections (header, timeline, fetched context, context links) stay in `DetailPane`. Only the conversation/action area is swapped per task type.

---

## 2. Implementation Detail View

For `implementation` and `investigation` task types.

### Stage: `new` (Inbox)
- Summary + action needed
- **CTA**: "Start Work" button → opens `StartWorkModal` (repo dropdown, branch preview)
- **Description**: "Runs /start-work — discovers relevant code and creates a phased implementation plan. No code changes made."

### Stage: `start_work` (Planning)
- If plan not ready: activity log (existing, with persisted events)
- If plan ready: render `PlanView` component (phases, tasks, progress bar, relevant files)
- **CTA**: "Start Hack" button + "Review Plan" button (for large scope)
- **Description**: "Runs /hack in {repoPath} — implements plan phases, runs tests, commits per task. No PRs created."

### Stage: `plan_review`
- Render `ReviewView` if plan review findings exist
- **CTA**: "Proceed to Hack" button
- **Description**: "Plan review complete. Proceeding runs /hack to start implementation."

### Stage: `hack` (Building)
- Activity log showing real-time agent progress (tool calls, commits)
- Phase progress bar
- **CTA**: "Ship" button (enabled when hack completes)
- **Description**: "Runs /ship — verifies code, pushes branch, opens PR. Moves Linear ticket to In Review."

### Stage: `ship` (Shipping)
- PR card: title, URL (clickable), branch → main
- Verification results: format/typecheck/tests status
- **CTA**: "Run Code Review" button
- **Description**: "Runs /code-review — parallel reviewer agents check security, architecture, testing, correctness."

### Stage: `code_review` (Reviewing)
- Render `ReviewView` with findings, severity badges, checkboxes
- **CTA**: "Fix Selected" + "Post to PR"
- **Description**: "Runs /handle-pr-feedback — applies fixes for checked findings, runs tests, commits. You review the diff before push."

### Stage: `done`
- Summary of what was accomplished
- Links to PR, commits, Linear ticket

---

## 3. Review Detail View

For `review` task type (PR reviews assigned to the user).

### Stage: `new`
- PR summary (title, author, repo, changed files count)
- **CTA**: "Start Review" button
- **Description**: "Runs /code-review on PR #{number} — parallel agents check security, architecture, testing, correctness. Read-only, no code changes."

### Stage: `code_review`
- Render `ReviewView` with findings
- **CTA**: "Post Findings to PR"
- **Description**: "Posts review findings as a PR comment. Does not approve or merge."

### Stage: `done`
- Review summary posted

---

## 4. Response Detail View

For `response` task type (DMs, thread replies, follow-ups).

### Stage: `new`
- Summary + who's waiting for response
- **CTA**: "Prepare Response" button
- **Description**: "Gathers context from Slack threads and related tickets. Suggests reply options. Does NOT send anything."

### Stage: `preparing`
- Activity log while agent gathers context

### Stage: `ready`
- **Key points to address**: bullet list extracted from context
- **Suggested replies**: 2-3 cards, each a draft reply. Click to select. Selected reply appears in an editable textarea.
- **Custom compose**: editable textarea (pre-filled with selected suggestion or empty)
- **CTA**: "Send via Slack" button (posts to the thread via MCP) + "Copy to Clipboard" button
- **Description**: "Posts your message to the Slack thread. You can edit before sending."

### Stage: `done`
- Confirmation of what was sent + link to thread

---

## 5. Meeting Prep Detail View

For `meeting_prep` task type.

### Stage: `new`
- Meeting info (time, attendees)
- **CTA**: "Prepare" button
- **Description**: "Gathers context from Slack, Linear, and Calendar. Generates talking points. Does NOT send anything."

### Stage: `preparing`
- Activity log

### Stage: `ready`
- **Attendees**: name + role for each attendee (from coworkers config + Slack profiles)
- **Talking points**: numbered cards, each with:
  - The point to discuss
  - Source attribution (e.g., "From: VEC-24 Linear ticket")
  - Clickable source link
- **Related docs**: Linear tickets, Slack threads, Notion docs — clickable links
- **CTA**: "Mark Done" button (no agent action needed — user attends the meeting)

### Stage: `done`
- Meeting completed

---

## 6. Action Description Pattern

Every action button follows this pattern:

```
[Button Label]
Small gray text: "Runs /skill-name in repo-name — description of what it does. What it will NOT do."
```

Examples:
- "Start Work" → "Runs /start-work in monolith-django — reads code, creates plan. No changes made."
- "Start Hack" → "Runs /hack in monolith-django — implements phases, runs tests, commits. No PRs."
- "Ship" → "Runs /ship — pushes branch, opens PR, moves Linear to In Review."
- "Send via Slack" → "Posts your message to the Slack thread via MCP."
- "Prepare Response" → "Gathers Slack + Linear context. Suggests replies. Does NOT send anything."

---

## 7. Data Flow

### Response suggestions
The MCP planning agent (in `preparing` stage) produces structured output:
```json
{
  "key_points": ["Yael wants chat polished", "Ties into VEC-24"],
  "suggested_replies": [
    "On it! Already working on VEC-24 which covers this.",
    "Good timing — this is my top priority."
  ],
  "thread_channel": "D043DJB30DB",
  "thread_ts": "1774402910.478749"
}
```
Stored on the plan's `fetchedContext`. The `ResponseDetailView` parses this and renders the cards.

### Sending via Slack
New IPC: `slack:send-message` → uses `mcp__claude_ai_Slack__slack_send_message` via the poll bridge.

### Meeting prep talking points
Same pattern — agent produces structured JSON in `fetchedContext`:
```json
{
  "attendees": [{"name": "Yael Chemla", "role": "manager"}],
  "talking_points": [
    {"point": "VEC-24 progress", "source": "VEC-24 Linear", "url": "https://..."}
  ],
  "related_docs": [{"label": "VEC-24", "url": "https://..."}]
}
```

---

## 8. Files

### New components
- `src/renderer/components/ImplementationDetailView.tsx` — start_work through done
- `src/renderer/components/ResponseDetailView.tsx` — preparing through done, with reply composer
- `src/renderer/components/MeetingPrepDetailView.tsx` — talking points view
- `src/renderer/components/ReviewDetailView.tsx` — PR review wrapper around ReviewView
- `src/renderer/components/ActionButton.tsx` — button + description pattern (reusable)

### Modified
- `src/renderer/pages/notifications.tsx` — DetailPane becomes router, delegates to task-type views
- `src/main/index.ts` — add `slack:send-message` IPC handler
- `src/preload/preload.ts` — expose `sendSlackMessage`

### Existing (already built, just wire in)
- `src/renderer/components/PlanView.tsx` — used by ImplementationDetailView
- `src/renderer/components/ReviewView.tsx` — used by ReviewDetailView
- `src/renderer/components/StartWorkModal.tsx` — used by ImplementationDetailView

---

## 9. Test Strategy

### New test files (TDD)
- `action-button.test.ts` — renders label + description, fires onClick
- `detail-view-router.test.ts` — routes to correct view based on taskType
- `response-view.test.ts` — parses key points + suggestions from fetchedContext, renders cards, sends message
- `meeting-prep-view.test.ts` — parses talking points + attendees, renders cards
- `implementation-view.test.ts` — renders PlanView when plan ready, shows StartWorkModal on CTA

### Modified
- `e2e-pipeline.test.ts` — update stage transition expectations
