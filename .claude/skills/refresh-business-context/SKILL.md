---
name: refresh-business-context
description: Scans Slack, Notion, Linear, and Gong to build a living business context document. Runs weekly.
user-invocable: false
---

# Refresh Business Context

You are building a business context document for {{COMPANY_NAME}}. This document grounds all AI agents in the company's mission, priorities, and current state.

## What to Scan

### Slack
- Read #general, #product, #engineering, #leadership (if accessible) for company-wide announcements
- Look for: quarterly goals, strategy updates, product launches, org changes
- Search for: "OKR", "Q2 goals", "roadmap", "priority", "announcement"

### Notion
- Search for: strategy docs, product roadmaps, team pages, quarterly planning
- Look for recently updated pages with "strategy", "roadmap", "priority", "goals"

### Linear
- Get project-level overview: which projects are active? What's the team working on?
- Identify: stalled projects, high-activity areas, upcoming milestones

### Gong (if available)
- Recent call themes: what are customers asking about? What pain points keep coming up?
- Competitive mentions: which competitors are coming up in conversations?

## Output Format

Return a JSON object with this structure:

```json
{
  "company": {
    "name": "{{COMPANY_NAME}}",
    "mission": "One-sentence mission",
    "market": "Market position and key differentiators",
    "stage": "Growth stage (e.g., scale-up, enterprise)"
  },
  "priorities": [
    { "title": "Priority name", "description": "What and why", "owner": "Person or team" }
  ],
  "productFocus": [
    { "area": "Feature/product area", "status": "active|planned|shipped", "details": "Brief context" }
  ],
  "team": [
    { "name": "Person name", "role": "Title/role", "focus": "What they own" }
  ],
  "customerIntel": [
    { "theme": "Customer theme or pain point", "frequency": "high|medium|low", "details": "Context" }
  ],
  "technicalContext": [
    { "area": "Technical area", "status": "in-flight|planned|completed", "details": "Brief context" }
  ],
  "lastUpdated": "{{DATE}}"
}
```

Keep each array to 5-8 items max. Be specific and actionable, not generic.
