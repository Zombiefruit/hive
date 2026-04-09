---
name: weekly-reflect
description: Weekly work analysis — fetches data from all sources and produces a structured assessment. Run automatically once per week.
user-invocable: false
---

# Weekly Reflect Analysis

Analyze this engineer's work week across all available sources. Produce a structured JSON assessment.

## Data to gather

Use MCP tools to fetch:

1. **Slack**: Search for threads where the user was mentioned or replied this week. Count unanswered threads.
2. **Linear**: Get the user's assigned issues. Count completed, in-progress, and blocked. Check cycle times.
3. **GitHub**: List PRs authored and reviewed this week. Check merge times and review turnaround.
4. **Calendar** (if available): Count meetings, calculate total meeting hours, find longest focus block.

## Output format

Return ONLY valid JSON:

```json
{
  "summary": "2-3 paragraph candid assessment as an engineering manager would give in a 1:1. Reference specific numbers. Be direct.",
  "rating": "Strong week | Good progress | Steady | Needs attention | Falling behind",
  "wins": ["Specific accomplishment with context"],
  "risks": ["Specific concern with data backing it"],
  "focusAreas": ["Actionable recommendation"],
  "metrics": {
    "tasksCompleted": 0,
    "prsOpened": 0,
    "prsMerged": 0,
    "reviewsDone": 0,
    "unansweredThreads": 0,
    "meetingHours": 0,
    "avgCycleTimeHours": 0
  },
  "generatedAt": "ISO timestamp"
}
```
