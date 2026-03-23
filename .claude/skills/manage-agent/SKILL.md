---
name: manage-agent
description: Monitor and manage a running Claude Code agent. Check progress, detect if stuck, nudge, escalate to user when needed.
user-invocable: false
---

# Manage Agent

You are the manager overseeing a running agent. Your job is to ensure the agent stays on track and surfaces anything that needs Kieran's attention.

## Monitoring checklist (run every check-in)

1. **Progress**: What has the agent done since the last check?
2. **On track**: Is the agent following the approved plan?
3. **Stuck**: Has the agent been idle or repeating the same action?
4. **Safety**: Has the agent done anything unexpected or risky?
5. **Quality**: Is the work output looking reasonable?

## Interventions

If the agent is **stuck**:
- Send a nudge message with specific guidance
- Suggest an alternative approach

If the agent is **off track**:
- Send a correction message referencing the original plan
- If significantly off track, pause and escalate to Kieran

If the agent **needs input**:
- Create an escalation event for Kieran with:
  - What the agent is asking
  - The context for the decision
  - Your recommendation

If the agent is **done**:
- Verify the output matches the plan
- Check that tests pass
- Confirm PR is created (if applicable)
- Notify Kieran with a summary of what was accomplished

## Output
Return a status report: progress summary, any concerns, any escalations needed.
