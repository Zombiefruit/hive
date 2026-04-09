/**
 * Thought Synthesizer — transforms raw orchestrator events into personality-driven
 * internal monologue using simple template matching (no LLM calls).
 *
 * The previous approach of calling Haiku for each thought was unreliable —
 * spawning a Claude process for a 1-sentence thought took 10+ seconds and
 * frequently timed out, producing "request timed out" thought bubbles.
 *
 * This version uses fast, deterministic template matching. Thoughts appear
 * instantly and never fail.
 */

/** Reference to the orchestrator's low-level think() function, set via init. */
let thinkFn: ((thought: string) => void) | null = null;

/**
 * Initialize the synthesizer with a reference to the orchestrator's think function.
 * Must be called before emitMonologue will produce output.
 */
export function initThoughtSynthesizer(think: (thought: string) => void): void {
  thinkFn = think;
}

// ── Template-based thought synthesis ──

interface ThoughtTemplate {
  pattern: RegExp;
  responses: string[];
}

const TEMPLATES: ThoughtTemplate[] = [
  // Fetch events
  { pattern: /fetched (\d+)K? chars/i, responses: [
    "Quite a bit came in. Let me sort through it.",
    "New data — time to see what matters.",
    "Got everything. Now to figure out what's worth my attention.",
  ]},
  { pattern: /still fetching.*\((\d+)s\)/i, responses: [
    "Still gathering data... taking a moment.",
    "Pulling in updates, almost there.",
    "Fetching is running long. Patience.",
  ]},
  { pattern: /no changes detected/i, responses: [
    "Everything's quiet. Nothing new since last check.",
    "No changes. Good — means nothing's on fire.",
    "All clear. Steady state.",
  ]},

  // Triage events
  { pattern: /changes in (.+) — triaging/i, responses: [
    "Something new came in. Let me take a look.",
    "New activity detected — triaging now.",
    "Changes spotted. Processing.",
  ]},
  { pattern: /triage complete.*?(\d+) new.*?(\d+) update/i, responses: [
    "Found new items that need attention, plus some updates.",
    "Triage done — a mix of new things and updates to existing work.",
    "Sorted through everything. Some new, some updated.",
  ]},

  // Stage transitions
  { pattern: /stage: (.+) → (.+)/i, responses: [
    "Moving things along in the pipeline.",
    "Stage transition — progress.",
    "Advancing to the next phase.",
  ]},
  { pattern: /stalled? in (.+) for (\d+)min/i, responses: [
    "Something seems stuck. Should flag this.",
    "No activity for a while — might need attention.",
    "This one's been idle too long. Escalating.",
  ]},

  // Judge events
  { pattern: /judge reviewed.*approved.*?(\d+)\/10/i, responses: [
    "Quality check passed. Good to go.",
    "Judge approved the work. Solid.",
    "Verification cleared. Moving forward.",
  ]},
  { pattern: /judge reviewed.*rejected/i, responses: [
    "Didn't pass review. Needs another look.",
    "Judge flagged issues. Will need revision.",
    "Quality check failed — back to the drawing board.",
  ]},

  // Plan events
  { pattern: /plan.*approved.*ready/i, responses: [
    "Plan looks good — ready for action.",
    "Plan approved. Waiting for the green light.",
    "Planning phase complete. Ready to build.",
  ]},

  // Active tasks summary
  { pattern: /(\d+) active tasks?:(.+)/i, responses: [
    "Keeping tabs on the workload.",
    "Multiple streams in flight.",
    "Monitoring all active work.",
  ]},

  // Idle summary
  { pattern: /(\d+) tasks? tracked.*nothing active/i, responses: [
    "Everything's at rest. No active work right now.",
    "Quiet period. All tasks are settled.",
    "Idle moment — nothing needs my attention.",
  ]},

  // Orchestrator lifecycle
  { pattern: /orchestrator started/i, responses: [
    "Coming online. Scanning for active work.",
    "Systems up. Let me see what's happening.",
    "Starting up — checking the state of things.",
  ]},
  { pattern: /orchestrator stopped/i, responses: [
    "Powering down. See you next time.",
    "Going quiet.",
  ]},

  // Escalation
  { pattern: /escalat/i, responses: [
    "This needs attention — escalating.",
    "Flagging an issue that can't wait.",
    "Something's off. Raising the alarm.",
  ]},
];

/** Pick a deterministic-ish but varied response for a given event. */
function synthesize(rawEvent: string): string {
  for (const template of TEMPLATES) {
    if (template.pattern.test(rawEvent)) {
      // Use event length + char code as a simple seed for variety
      const seed = rawEvent.length + (rawEvent.charCodeAt(0) || 0);
      return template.responses[seed % template.responses.length];
    }
  }
  // No template matched — use the raw event but trim it
  return rawEvent.length > 120 ? rawEvent.slice(0, 117) + "..." : rawEvent;
}

/**
 * Public API — transform a raw event into a thought and broadcast it.
 * Instant, never fails, no LLM calls.
 */
export function emitMonologue(rawEvent: string): void {
  if (!thinkFn) return;
  thinkFn(synthesize(rawEvent));
}
