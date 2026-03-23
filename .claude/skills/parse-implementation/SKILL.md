---
name: parse-implementation
description: Parse an implementation task — a Linear ticket or feature request — into a detailed work plan. Use when planning code work.
user-invocable: false
---

# Parse Implementation Task

Given a task that requires code implementation, create a detailed work plan.

## Input
The task context will be provided in `$ARGUMENTS`, including:
- Ticket description, comments, acceptance criteria
- Related Slack discussions
- Relevant specs or docs

## What to produce

1. **Summary**: One paragraph explaining what needs to be done and why
2. **Approach**: Technical approach — what changes, where, and how
3. **Repository**: Which repo to work in
4. **Branch**: Suggested branch name (format: `kieran/<ticket>-<brief-desc>`)
5. **Key files**: Which files will likely need changes
6. **Steps**: Numbered implementation steps
7. **Tests**: What tests to write
8. **Risks**: Anything that could go wrong or needs clarification
9. **Definition of done**: When is this task complete? (PR created, tests pass, etc.)
10. **Estimated model**: Haiku (simple), Sonnet (moderate), Opus (complex)

## Important
- Be specific about the codebase — reference actual file paths and patterns
- If context is insufficient, list what additional information is needed
- Don't make assumptions about implementation details without evidence
