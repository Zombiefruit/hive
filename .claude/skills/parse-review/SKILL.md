---
name: parse-review
description: Parse a PR review request into a review plan. Use when planning code reviews.
user-invocable: false
---

# Parse Review Task

Given a PR that needs review, create a review plan.

## Input
`$ARGUMENTS` will contain the PR details (URL, description, changed files, etc.)

## What to produce

1. **PR Summary**: What this PR does in 2-3 sentences
2. **Author**: Who wrote this
3. **Scope**: How many files, what areas of the codebase
4. **Key changes**: The most important changes to review carefully
5. **Review focus**: What to look for (bugs, style, architecture, performance, security)
6. **Related context**: Any tickets, specs, or discussions that inform this review
7. **CLAUDE.md standards**: Which project coding standards apply
8. **Risk assessment**: Is this a risky change? What could break?
9. **Estimated time**: Quick glance vs. deep review

## Important
- Check the actual PR state — don't review merged/closed PRs
- If there's already a review from someone else, note their comments
