/**
 * Thought Synthesizer — transforms raw orchestrator events into personality-driven
 * internal monologue using Haiku.
 *
 * The AI orb in the UI shows "thought bubbles" — these should sound like the internal
 * voice of an intelligent system observing its own work, not raw status text.
 *
 * Rate-limited to at most 1 Haiku call per 15 seconds. Falls back to raw text on
 * failure or rate-limit. Never blocks.
 */

import { askEphemeralProcess } from "./mcp-bridge";
import type { UsageSource } from "../shared/usage-types";

const MONOLOGUE_PROMPT = `You are the internal voice of an AI engineering manager named Hive. You think in short, vivid fragments — like a consciousness stream. You're observing your work systems and reflecting on what's happening.

Given this event, produce a single thought (1-2 sentences max). Be:
- Natural and personality-driven (not robotic status updates)
- Observant and insightful (notice patterns, not just facts)
- Occasionally witty or self-aware
- Never use technical jargon like "polling", "triage", "MCP"
- Speak as if you're thinking to yourself

Examples:
- Event: "starting data fetch" → "Let me check what's been happening while I wasn't looking..."
- Event: "fetched 12K chars, now triaging" → "Quite a bit to sort through today. Let me see what actually matters."
- Event: "no changes since last poll" → "Everything's quiet. Good — means nothing's on fire."
- Event: "Task VEC-44 stalled in hack for 15min" → "VEC-44 seems stuck. I should flag that before it burns more time."
- Event: "triage complete — 3 new tasks, 2 updates" → "Found 3 new things that need attention. Two existing ones got updates too."
- Event: "changes in SLACK — triaging" → "Something new came in on Slack. Let me take a look."
- Event: "judge reviewed triage: approved (8/10)" → "My read on things checks out. Good."

Respond with ONLY the thought text, nothing else.`;

const RATE_LIMIT_MS = 15_000;
const SYNTHESIS_TIMEOUT_MS = 10_000;
const USAGE_SOURCE: UsageSource = "reflect";

/** Reference to the orchestrator's low-level think() function, set via init. */
let thinkFn: ((thought: string) => void) | null = null;

let lastSynthesisTime = 0;
let synthesizing = false;

/**
 * Initialize the synthesizer with a reference to the orchestrator's think function.
 * Must be called before emitMonologue will produce output.
 */
export function initThoughtSynthesizer(think: (thought: string) => void): void {
  thinkFn = think;
}

/**
 * Call Haiku to transform a raw event into a personality-driven thought.
 * Returns the raw event on failure.
 */
async function synthesizeThought(rawEvent: string): Promise<string> {
  try {
    const result = await askEphemeralProcess(
      `${MONOLOGUE_PROMPT}\n\nEvent: "${rawEvent}"`,
      SYNTHESIS_TIMEOUT_MS,
      "claude-haiku-4-5",
      USAGE_SOURCE,
    );
    const trimmed = result.trim();
    // Sanity check: Haiku should return a short thought, not an essay
    if (trimmed.length > 0 && trimmed.length < 500) {
      return trimmed;
    }
    return rawEvent;
  } catch {
    return rawEvent;
  }
}

/**
 * Public API — queue a raw event for Haiku synthesis.
 *
 * If a synthesis is already in flight or the rate limit hasn't elapsed,
 * falls back to broadcasting the raw event immediately (never blocks).
 */
export function emitMonologue(rawEvent: string): void {
  if (!thinkFn) return;

  const now = Date.now();

  // Rate limit: at most one Haiku call per 15s
  if (synthesizing || now - lastSynthesisTime < RATE_LIMIT_MS) {
    // Fall back to raw event — still show something
    thinkFn(rawEvent);
    return;
  }

  synthesizing = true;
  lastSynthesisTime = now;

  const think = thinkFn; // capture for closure safety
  synthesizeThought(rawEvent)
    .then((thought) => think(thought))
    .catch(() => think(rawEvent))
    .finally(() => {
      synthesizing = false;
    });
}
