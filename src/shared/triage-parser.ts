/**
 * Triage parser — extracts and parses triage response JSON from the
 * triage agent output, including projects and task splitting.
 */

// ── Types ──

export interface TriageProject {
  name: string;
  source: string;
  source_id?: string;
  related_channels?: string[];
  related_tickets?: string[];
}

export interface TriageActionableItem {
  source: string;
  title: string;
  summary: string;
  priority: string;
  confidence: number;
  task_type: string;
  links: Array<{ type: string; label: string; url: string }>;
  author: string;
  action_needed: string;
  project?: string;
  project_source?: string;
  project_source_id?: string;
}

export interface TriageUpdateItem {
  existing_id: string;
  changes: Record<string, unknown>;
  timeline_event?: string;
}

export interface TriageSkippedItem {
  source: string;
  title: string;
  reason: string;
  url?: string;
}

export interface TriageResult {
  actionable: TriageActionableItem[];
  updates: TriageUpdateItem[];
  follow_up: TriageActionableItem[];
  skipped: TriageSkippedItem[];
  projects: TriageProject[];
}

// ── Parser ──

const EMPTY_RESULT: TriageResult = {
  actionable: [],
  updates: [],
  follow_up: [],
  skipped: [],
  projects: [],
};

/**
 * Strip markdown code fences (```json ... ```) from raw output.
 */
function stripCodeFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  return fenced ? fenced[1] : raw;
}

/**
 * Try to find and extract a JSON object containing "actionable" from the raw string.
 * Handles cases where the JSON is embedded in surrounding text.
 */
function extractJsonObject(raw: string): string | null {
  // First try the whole string
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;

  // Try to find a JSON object containing "actionable"
  const start = raw.indexOf("{");
  if (start === -1) return null;

  // Walk forward from the first { to find the matching }
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") depth--;
    if (depth === 0) return raw.slice(start, i + 1);
  }

  return null;
}

/**
 * Parse a raw triage agent response into structured data.
 *
 * Handles:
 * 1. Markdown code blocks (```json ... ```)
 * 2. JSON embedded in surrounding text
 * 3. Missing `projects` array (defaults to [])
 * 4. Invalid JSON (returns empty result)
 */
export function parseTriageResponse(raw: string): TriageResult {
  if (!raw || !raw.trim()) return { ...EMPTY_RESULT };

  try {
    // Strip markdown fences first
    const stripped = stripCodeFences(raw);

    // Try to extract a JSON object
    const jsonStr = extractJsonObject(stripped);
    if (!jsonStr) return { ...EMPTY_RESULT };

    const parsed = JSON.parse(jsonStr);

    // Must have "actionable" to be a valid triage response
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.actionable)) {
      return { ...EMPTY_RESULT };
    }

    return {
      actionable: Array.isArray(parsed.actionable) ? parsed.actionable : [],
      updates: Array.isArray(parsed.updates) ? parsed.updates : [],
      follow_up: Array.isArray(parsed.follow_up) ? parsed.follow_up : [],
      skipped: Array.isArray(parsed.skipped) ? parsed.skipped : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    };
  } catch {
    return { ...EMPTY_RESULT };
  }
}
