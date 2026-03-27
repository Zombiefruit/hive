---
name: fetch-github
description: Instructions for fetching GitHub PRs and mentions during the poll cycle.
user-invocable: false
---

# Fetch GitHub Data

Check for PR review requests and mentions for {{USER_NAME}}.

Use the `gh` CLI or GitHub MCP tools to find:
- Open PRs where {{USER_NAME}} is requested as reviewer
- PRs authored by {{USER_NAME}} that have new comments/reviews
- Issues mentioning {{USER_NAME}}

Return for each: title, repo, author, status, URL.
