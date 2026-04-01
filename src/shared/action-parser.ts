/**
 * Action parser — extracts structured actions from agent output.
 * Looks for a fenced ```actions or ```json actions block, parses JSON,
 * validates each item, returns Action[].
 */

import { isValidAction, type Action } from "./action-types";

/**
 * Parse structured actions from agent markdown output.
 * Returns [] if no actions block found or parse fails.
 */
export function parseActions(agentOutput: string): Action[] {
  if (!agentOutput) return [];

  // Match ```actions or ```json actions fenced block
  const match = agentOutput.match(/```(?:json\s+)?actions\s*\n([\s\S]*?)```/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidAction) as Action[];
  } catch {
    return [];
  }
}
