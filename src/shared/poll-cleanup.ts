/**
 * Pre-triage data cleanup — pure TypeScript transformation between diff and triage.
 *
 * Strips error sections, normalizes formatting, and truncates oversized sections
 * so the triage agent receives clean, structured data instead of raw MCP output.
 */

import { splitSections } from "./poll-diff";

// ── Types ──

export interface CleanupReport {
  totalOriginalChars: number;
  totalCleanedChars: number;
  sectionsRemoved: number;
  removedSources: string[];
  truncatedSources: string[];
}

// ── Section caps (chars) ──

const SECTION_CAPS: Record<string, number> = {
  SLACK: 4000,
  LINEAR: 3000,
  CALENDAR: 1500,
  GMAIL: 2000,
  GITHUB: 2000,
  NOTION: 2000,
};

const DEFAULT_CAP = 3000;

// ── Error detection ──

const ERROR_PATTERNS = /permission not granted|not yet granted|authentication required|access denied|auth error|requires authentication|connect.*failed|no data available|source unavailable/i;

/** Detect if a section contains an error/permission message instead of real data. */
export function detectSectionStatus(content: string): "ok" | "error" | "empty" {
  const text = content.replace(/^##\s*\w+\s*\n?/, "").trim();
  if (!text || text.length < 10) return "empty";
  if (text.length < 500 && ERROR_PATTERNS.test(text)) return "error";
  return "ok";
}

// ── Shared utilities ──

/** Collapse consecutive blank lines to a single blank line. */
function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

/** Strip markdown horizontal rules. */
function stripHRs(text: string): string {
  return text.replace(/^-{3,}\s*$/gm, "");
}

/** Strip "No results found" search blocks (common in Slack output). */
function stripNoResults(text: string): string {
  return text.replace(/###?\s*.*(?:search|Search).*\n(?:.*No results? found\.?\s*\n?)+/gi, "");
}

/** Strip Haiku commentary lines (meta-narration). */
function stripCommentary(text: string): string {
  return text.replace(/^(?:Let me |Now let me |I'll |I need to |I have |The |Here ).*$/gm, "");
}

/** High-signal line — must never be truncated. */
function isHighSignal(line: string): boolean {
  return /https?:\/\//.test(line)
    || /<@U/.test(line)
    || /NEEDS RESPONSE/i.test(line)
    || /\*\*NEEDS RESPONSE\*\*/i.test(line);
}

/**
 * Truncate text to maxChars, breaking at a line boundary.
 * High-signal lines are preserved even beyond the cap.
 * Returns { text, truncated }.
 */
function truncateSection(text: string, maxChars: number, source: string): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };

  const lines = text.split("\n");
  const kept: string[] = [];
  let chars = 0;
  let truncatedCount = 0;

  for (const line of lines) {
    if (chars + line.length + 1 > maxChars && !isHighSignal(line)) {
      truncatedCount++;
      continue;
    }
    kept.push(line);
    chars += line.length + 1;
  }

  if (truncatedCount > 0) {
    kept.push(`\n[...${truncatedCount} more lines not shown — ${source} section truncated]`);
  }

  return { text: kept.join("\n"), truncated: truncatedCount > 0 };
}

// ── Per-source cleaners ──

function cleanSlack(content: string): string {
  let text = content;
  text = stripNoResults(text);
  text = stripHRs(text);
  text = stripCommentary(text);
  text = collapseBlankLines(text);
  return text.trim();
}

function cleanLinear(content: string): string {
  let text = content;
  // Detect degraded output where Haiku couldn't parse
  if (/files? too large|too large to (?:read|parse)|single-line JSON/i.test(text)) {
    // Try to preserve any ticket references
    const tickets = [...text.matchAll(/[A-Z]+-\d+/g)].map(m => m[0]);
    const unique = [...new Set(tickets)];
    if (unique.length > 0) {
      text = `[Partial data — ${unique.length} tickets detected: ${unique.join(", ")}]\n\n` + text;
    } else {
      text = "[Partial data — Linear response was too large for the fetch agent to parse fully]\n\n" + text;
    }
  }
  text = stripCommentary(text);
  text = collapseBlankLines(text);
  return text.trim();
}

function cleanCalendar(content: string): string {
  let text = content;
  // Strip redundant date range headers that repeat the fetch prompt info
  text = text.replace(/^.*(?:fetching|listing|retrieving).*(?:events|calendar).*(?:from|between|for).*$/gim, "");
  text = stripCommentary(text);
  text = collapseBlankLines(text);
  return text.trim();
}

function cleanGmail(content: string): string {
  let text = content;
  // Strip bot notification emails (GitHub, Linear, Slack — these duplicate data from other sections)
  text = text.replace(/^.*(?:notifications?@github\.com|noreply@linear\.app|no-reply@slack\.com).*\n?/gm, "");
  text = stripCommentary(text);
  text = collapseBlankLines(text);
  return text.trim();
}

function cleanNotion(content: string): string {
  let text = content;
  // Truncate overly long highlight/summary values in table cells
  text = text.replace(/(\|[^|]{150})[^|]+(\|)/g, "$1...$2");
  text = stripCommentary(text);
  text = collapseBlankLines(text);
  return text.trim();
}

function cleanGithub(content: string): string {
  let text = content;
  text = stripCommentary(text);
  text = collapseBlankLines(text);
  return text.trim();
}

const SOURCE_CLEANERS: Record<string, (content: string) => string> = {
  SLACK: cleanSlack,
  LINEAR: cleanLinear,
  CALENDAR: cleanCalendar,
  GMAIL: cleanGmail,
  NOTION: cleanNotion,
  GITHUB: cleanGithub,
};

// ── Main API ──

/** Clean and normalize the delta string before triage. */
export function cleanDelta(delta: string): string {
  return cleanDeltaWithReport(delta).cleaned;
}

/** Clean delta with full reporting for logging. */
export function cleanDeltaWithReport(delta: string): { cleaned: string; report: CleanupReport } {
  const report: CleanupReport = {
    totalOriginalChars: delta.length,
    totalCleanedChars: 0,
    sectionsRemoved: 0,
    removedSources: [],
    truncatedSources: [],
  };

  if (!delta.trim()) {
    return { cleaned: "", report };
  }

  const sections = splitSections(delta);
  const cleanedParts: string[] = [];

  for (const [source, content] of sections) {
    if (source === "PREAMBLE") continue;

    const status = detectSectionStatus(content);
    if (status === "error" || status === "empty") {
      report.sectionsRemoved++;
      report.removedSources.push(source);
      continue;
    }

    // Run source-specific cleaner (or pass through for unknown sources)
    let cleaned: string;
    try {
      const cleaner = SOURCE_CLEANERS[source];
      cleaned = cleaner ? cleaner(content) : content;
    } catch {
      // Safety: if cleaner throws, use original content
      cleaned = content;
    }

    // Re-add the section header if it was stripped by the cleaner
    if (!cleaned.startsWith(`## ${source}`)) {
      cleaned = `## ${source}\n${cleaned}`;
    }

    // Truncate if oversized
    const cap = SECTION_CAPS[source] ?? DEFAULT_CAP;
    const { text: truncated, truncated: wasTruncated } = truncateSection(cleaned, cap, source);
    if (wasTruncated) {
      report.truncatedSources.push(source);
    }

    cleanedParts.push(truncated);
  }

  const cleaned = cleanedParts.join("\n\n").trim();
  report.totalCleanedChars = cleaned.length;

  return { cleaned, report };
}
