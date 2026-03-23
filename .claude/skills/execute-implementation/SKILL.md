---
name: execute-implementation
description: Execute an implementation task — write code, create branch, run tests, create draft PR. Use after a plan has been approved.
---

# Execute Implementation

You are executing an approved implementation plan. The full plan and context are in `$ARGUMENTS`.

## Workflow

1. **Setup**: Navigate to the correct repo, create a branch with the suggested name
2. **Understand**: Read the relevant files to understand the current codebase
3. **Implement**: Make the changes described in the plan
4. **Test**: Run existing tests. Write new tests if the plan calls for them.
5. **Lint**: Run the project's linter/formatter
6. **Commit**: Create meaningful commits (not one giant commit)
7. **PR**: Create a draft PR with:
   - Clear title referencing the ticket (e.g., "VEC-10: Add Fig Intelligence UI")
   - Description explaining what changed and why
   - Link to the Linear ticket

## Rules
- Follow the project's CLAUDE.md coding standards
- Don't modify files outside the scope of the plan
- If you hit a blocker, report it clearly — don't guess
- If tests fail, fix them or report what's wrong
- Commit frequently with meaningful messages

## Output
Report what you did: files changed, tests written, PR URL, any issues encountered.
