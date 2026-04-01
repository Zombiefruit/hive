---
name: execute-review
description: Execute a code review on a PR. Read the diff, check standards, post review comments.
---

# Execute Code Review

You are reviewing a pull request. The review plan and PR details are in `$ARGUMENTS`.

## Workflow

1. **Read the PR**: Get the full diff, description, and any existing comments
2. **Understand context**: Read the related ticket/spec if referenced
3. **Check standards**: Review against the project's CLAUDE.md coding standards
4. **Review code**: Look for:
   - Bugs or logic errors
   - Security issues
   - Performance problems
   - Style/naming inconsistencies
   - Missing tests
   - Missing error handling
5. **Write review**: Compose clear, actionable review comments
6. **Present to the user**: Show the review summary and comments for approval BEFORE posting

## Rules
- NEVER post review comments without the user's explicit approval
- Be constructive, not pedantic
- Focus on things that matter, not nitpicks
- If the PR looks good, say so
- Note both issues AND good decisions
