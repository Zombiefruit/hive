# Claude Deck — Skill-Based Architecture Spec

## 1. Skill Library

Every capability is a Claude Code skill. Skills are composable, reusable, and the AI decides when to use them.

### Data Fetching Skills
| Skill | Purpose |
|---|---|
| `fetch-slack` | Fetch mentions, DMs, thread replies for a user |
| `fetch-linear` | Fetch assigned tickets, comments, status updates |
| `fetch-github` | Fetch PR review requests, mentions, CI status |
| `fetch-gmail` | Fetch unread emails, important threads |
| `fetch-notion` | Fetch page mentions, spec updates |

### Task Parsing Skills
| Skill | Purpose |
|---|---|
| `parse-implementation-task` | Parse a Linear ticket / Slack request into an implementation plan (repo, branch, files, approach) |
| `parse-review-task` | Parse a PR review request into a review plan (what to look for, related context) |
| `parse-response-task` | Parse a message that needs a reply — gather context, draft a response |
| `parse-investigation-task` | Parse a "look into this" request — what to investigate, where to look |
| `parse-planning-task` | Parse a task that needs a plan/RFC before implementation |

### Execution Skills
| Skill | Purpose |
|---|---|
| `execute-implementation` | Work on a codebase: branch, implement, test, create draft PR |
| `execute-review` | Review a PR: read changes, check standards, post comments |
| `execute-response` | Draft and present a response for user approval before sending |
| `execute-investigation` | Investigate an issue, gather findings, present summary |

### Management Skills
| Skill | Purpose |
|---|---|
| `manage-agent` | Monitor a running agent: check progress, detect if stuck, nudge, escalate |
| `summarize-progress` | Summarize what an agent has done so far |
| `escalate-to-user` | Create an event/notification for the user when the agent needs input |

---

## 2. Task Types

Not every notification is the same. The triage agent classifies each item into a task type, which determines which skills are used.

### Implementation Task
- **Trigger**: Linear ticket assigned, feature request in Slack
- **Flow**: parse-implementation-task → user approves plan → execute-implementation → manage-agent → PR ready
- **Example**: "VEC-10: Add Fig Intelligence UI" → agent reads ticket, proposes plan, implements, creates PR

### Review Task
- **Trigger**: PR review requested on GitHub
- **Flow**: parse-review-task → execute-review → present findings to user
- **Example**: "Review PR #4587" → agent reads diff, checks standards, posts review

### Response Task
- **Trigger**: DM or @mention asking Kieran something
- **Flow**: parse-response-task → gather context → draft response → user approves → (optionally send)
- **Example**: "Ambrose DM'd asking about the pipeline retry logic" → agent gathers context, drafts reply, user reviews

### Investigation Task
- **Trigger**: "Can you look into X?" in Slack or from manager
- **Flow**: parse-investigation-task → execute-investigation → present findings
- **Example**: "Look into why CI is failing on main" → agent investigates, reports back

### Planning Task
- **Trigger**: New project or complex feature that needs a plan first
- **Flow**: parse-planning-task → create RFC/plan document → user reviews
- **Example**: "We need to redesign the notification system" → agent creates a plan doc

---

## 3. Task Lifecycle & Agent Management

### Task States
```
new → planning → awaiting_approval → in_progress → review → done
                                         ↕
                                   needs_input (escalated to user)
```

### Manager-Agent Relationship

The Manager doesn't just start agents and forget them. It actively manages:

1. **Spawn**: Manager composes the agent prompt with full context + relevant skills
2. **Monitor**: Every 30s, Manager checks the agent's progress (reads its stream output)
3. **Detect stuck**: If agent hasn't made progress in 2 minutes, Manager intervenes
4. **Nudge**: Manager sends the agent a message to get it back on track
5. **Escalate**: If the agent needs user input (clarification, approval for risky action), Manager creates a notification event
6. **Complete**: When agent finishes, Manager validates the output and notifies user

### User Interaction Events

Agents can trigger events that appear in the UI for user interaction:

| Event | UI Element |
|---|---|
| `needs_clarification` | Notification with question + text input |
| `needs_approval` | Notification with action description + approve/reject |
| `needs_review` | Notification with PR link + review summary |
| `progress_update` | Timeline entry in the task detail view |
| `completed` | Notification with results + links |
| `error` | Notification with error details + retry option |

### Task Detail View

When viewing a task in progress:
- **Header**: Task title, status, assigned agent, model, elapsed time, cost
- **Timeline**: Chronological log of everything:
  - Agent started
  - Files read/modified
  - Commands run
  - Questions asked (escalated events)
  - User responses
  - PRs created
  - Tests run
  - Completion
- **Agent Chat**: Live stream of the agent's thinking and actions
- **Context Panel**: All linked resources (tickets, threads, PRs, docs)
- **Manager Notes**: What the Manager has observed about this agent's progress

---

## 4. Implementation Plan

### Phase 1: Skill Infrastructure
1. Create skill file format (Claude Code `.skill.md` files)
2. Build skill registry in the app
3. Wire skills into the bridge and work agent processes
4. Test with `fetch-slack` and `fetch-linear` skills

### Phase 2: Task Type System
1. Add `taskType` field to notifications
2. Triage agent classifies each notification into a task type
3. Each task type maps to a skill chain
4. UI shows task type badge on notification cards

### Phase 3: Execution Flow
1. "Start work" → Manager uses parse skill for the task type
2. Manager composes agent prompt with relevant skills
3. Spawn non-headless agent with skills loaded
4. Agent executes using the execution skill

### Phase 4: Agent Management
1. Manager monitors agent stream output
2. Detect stuck / off-track agents
3. Manager can send messages to running agents
4. Escalation events surface in UI
5. User can respond to escalations inline

### Phase 5: Timeline & Detail View
1. Build task detail page with live timeline
2. Show agent actions in real-time
3. Show Manager interventions
4. Show user interaction events
5. Show final results (PR links, review comments, etc.)
