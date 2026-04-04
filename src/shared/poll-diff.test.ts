import { describe, it, expect } from "vitest";
import { splitSections, computeSectionHashes, computeDiff } from "./poll-diff";

const SAMPLE_DATA = `Some preamble text

## SLACK
Channel #team-vector:
- Alice: Hey team, the pipeline is broken (1712345678.123456)
- Bob: Looking into it

## LINEAR
VEC-44: Performance agent tracking
Status: In Progress

## CALENDAR
Meeting: Team standup at 10:00 AM
Attendees: Alice, Bob, Charlie
`;

describe("splitSections", () => {
  it("splits by source headers", () => {
    const sections = splitSections(SAMPLE_DATA);
    expect(sections.has("PREAMBLE")).toBe(true);
    expect(sections.has("SLACK")).toBe(true);
    expect(sections.has("LINEAR")).toBe(true);
    expect(sections.has("CALENDAR")).toBe(true);
    expect(sections.get("SLACK")).toContain("Alice");
    expect(sections.get("LINEAR")).toContain("VEC-44");
  });

  it("handles empty input", () => {
    const sections = splitSections("");
    expect(sections.size).toBe(1); // just PREAMBLE
  });
});

describe("computeSectionHashes", () => {
  it("returns one hash per section", () => {
    const hashes = computeSectionHashes(SAMPLE_DATA);
    expect(hashes.length).toBe(4); // PREAMBLE + 3 sources
    for (const h of hashes) {
      expect(h.hash).toHaveLength(16);
      expect(h.source).toBeTruthy();
    }
  });

  it("produces stable hashes for same content", () => {
    const h1 = computeSectionHashes(SAMPLE_DATA);
    const h2 = computeSectionHashes(SAMPLE_DATA);
    expect(h1).toEqual(h2);
  });
});

describe("computeDiff", () => {
  it("detects no changes when hashes match", () => {
    const prev = computeSectionHashes(SAMPLE_DATA);
    const diff = computeDiff(SAMPLE_DATA, prev);
    expect(diff.hasChanges).toBe(false);
    expect(diff.changedSources).toHaveLength(0);
    expect(diff.delta).toBe("");
  });

  it("detects changes when content differs", () => {
    const prev = computeSectionHashes(SAMPLE_DATA);
    const modified = SAMPLE_DATA.replace("pipeline is broken", "pipeline is fixed and deployed");
    const diff = computeDiff(modified, prev);
    expect(diff.hasChanges).toBe(true);
    expect(diff.changedSources).toContain("SLACK");
    expect(diff.unchangedSources).toContain("LINEAR");
    expect(diff.unchangedSources).toContain("CALENDAR");
    expect(diff.delta).toContain("pipeline is fixed");
    expect(diff.delta).not.toContain("VEC-44"); // LINEAR unchanged, not in delta
  });

  it("ignores timestamp changes", () => {
    const prev = computeSectionHashes(SAMPLE_DATA);
    const sameContentDiffTs = SAMPLE_DATA.replace("1712345678.123456", "1712399999.999999");
    const diff = computeDiff(sameContentDiffTs, prev);
    expect(diff.hasChanges).toBe(false);
  });

  it("detects new sources", () => {
    const prev = computeSectionHashes("## SLACK\nHello\n");
    const withLinear = "## SLACK\nHello\n\n## LINEAR\nVEC-1: New ticket\n";
    const diff = computeDiff(withLinear, prev);
    expect(diff.hasChanges).toBe(true);
    expect(diff.changedSources).toContain("LINEAR");
  });

  it("returns empty previous as all-changed", () => {
    const diff = computeDiff(SAMPLE_DATA, []);
    expect(diff.hasChanges).toBe(true);
    expect(diff.changedSources.length).toBeGreaterThan(0);
  });
});
