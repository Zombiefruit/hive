/**
 * Poll diff engine — computes per-source section hashes to detect
 * what changed between poll cycles. Skips triage when nothing changed.
 */
import { createHash } from "node:crypto";

export interface DiffResult {
  hasChanges: boolean;
  changedSources: string[];
  unchangedSources: string[];
  delta: string;        // Only the changed source sections
  fullData: string;     // Complete raw data
}

interface SectionHash {
  source: string;
  hash: string;
}

/** Known source section headers in the fetch output. */
const SOURCE_HEADERS = ["SLACK", "LINEAR", "CALENDAR", "GMAIL", "GITHUB", "NOTION"];

/** Split raw fetch data into per-source sections. */
export function splitSections(raw: string): Map<string, string> {
  const sections = new Map<string, string>();
  let currentSource = "PREAMBLE";
  let currentContent: string[] = [];

  for (const line of raw.split("\n")) {
    const headerMatch = line.match(/^##\s+(\w+)/);
    if (headerMatch && SOURCE_HEADERS.includes(headerMatch[1].toUpperCase())) {
      if (currentContent.length > 0) {
        sections.set(currentSource, currentContent.join("\n"));
      }
      currentSource = headerMatch[1].toUpperCase();
      currentContent = [line];
    } else {
      currentContent.push(line);
    }
  }
  if (currentContent.length > 0) {
    sections.set(currentSource, currentContent.join("\n"));
  }
  return sections;
}

/** Normalize a section for hashing — strip timestamps, IDs, and whitespace variance. */
function normalizeForHash(text: string): string {
  return text
    // Strip Slack timestamps (e.g., 1712345678.123456)
    .replace(/\d{10,}\.\d{4,}/g, "TS")
    // Strip ISO timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, "ISO")
    // Strip poll IDs
    .replace(/poll-\d+-\w+/g, "POLLID")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/** Hash a normalized section. */
function hashSection(text: string): string {
  return createHash("sha256").update(normalizeForHash(text)).digest("hex").slice(0, 16);
}

/** Compute hashes for all sections. */
export function computeSectionHashes(raw: string): SectionHash[] {
  const sections = splitSections(raw);
  return Array.from(sections.entries()).map(([source, content]) => ({
    source,
    hash: hashSection(content),
  }));
}

/** Compare current hashes against previous hashes. */
export function computeDiff(raw: string, previousHashes: SectionHash[]): DiffResult {
  const currentHashes = computeSectionHashes(raw);
  const prevMap = new Map(previousHashes.map(h => [h.source, h.hash]));

  const changedSources: string[] = [];
  const unchangedSources: string[] = [];

  for (const { source, hash } of currentHashes) {
    if (source === "PREAMBLE") continue; // Skip preamble
    const prevHash = prevMap.get(source);
    if (prevHash === hash) {
      unchangedSources.push(source);
    } else {
      changedSources.push(source);
    }
  }

  // Also flag new sources (present now, not in previous)
  for (const { source } of currentHashes) {
    if (source !== "PREAMBLE" && !prevMap.has(source) && !changedSources.includes(source)) {
      changedSources.push(source);
    }
  }

  const hasChanges = changedSources.length > 0;

  // Build delta: only include changed sections
  let delta = "";
  if (hasChanges) {
    const sections = splitSections(raw);
    for (const source of changedSources) {
      const content = sections.get(source);
      if (content) delta += content + "\n\n";
    }
  }

  return { hasChanges, changedSources, unchangedSources, delta: delta.trim(), fullData: raw };
}
