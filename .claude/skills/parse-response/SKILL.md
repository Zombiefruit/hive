---
name: parse-response
description: Parse a message that needs a reply — gather context and draft a response. Use when someone DM'd or mentioned Kieran and expects a reply.
user-invocable: false
---

# Parse Response Task

Someone messaged Kieran and expects a reply. Understand what they need and prepare a response.

## Input
`$ARGUMENTS` will contain the message context (who, what, where, when)

## What to produce

1. **Who**: Name and relationship (manager, teammate, cross-team, external)
2. **What they asked**: Exact question or request, in their words
3. **Context**: What is this about? Gather relevant context:
   - Related tickets or PRs
   - Previous discussions on this topic
   - Current state of whatever they're asking about
4. **Draft response**: Write a draft reply that Kieran can review and approve
5. **Tone**: Match the channel (formal for email, casual for Slack DM, professional for cross-team)
6. **Urgency**: How quickly should Kieran respond?

## Important
- Never send a message without Kieran's explicit approval
- If you don't have enough context to draft a good reply, say what's missing
- For technical questions, verify the current state before answering
