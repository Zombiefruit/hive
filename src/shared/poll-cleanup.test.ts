/**
 * Tests for pre-triage data cleanup.
 */
import { describe, it, expect } from "vitest";
import { detectSectionStatus, cleanDelta, cleanDeltaWithReport } from "./poll-cleanup";

// ── Sample data based on real poll log patterns ──

const SLACK_SECTION = `## SLACK
### Slack Search: Mentions of Kieran (@U02PKBZSB9Q) after 2026-04-11
No results found.

### Slack Search: DMs to Kieran (to:U02PKBZSB9Q) after 2026-04-11
No results found.

---

### #team-vector / C0AMSV2SK4Z
**Ronan Spratt** — 2026-04-10 19:25 IDT
Agents catalog page redesign PR: #12772
@Kieran Williams please review **NEEDS RESPONSE**
https://github.com/monte-carlo-data/frontend/pull/12772

**Gene Hynson** — 2026-04-11 10:00 IDT
Merged ADF + Databricks PRs for VEC-78/VEC-36`;

const LINEAR_SECTION = `## LINEAR
### Kieran Williams — Active Issues
| ID | Title | Status | Priority | Project |
|---|---|---|---|---|
| VEC-77 | Tighten Pydantic contract types | In Progress | High | Agent Experience |
| VEC-36 | Performance Agent: ADF support | In Progress | Medium | Performance Agent |`;

const CALENDAR_ERROR = `## CALENDAR
Error: Permission not granted for Google Calendar access.
---`;

const GMAIL_ERROR = `## GMAIL
Error: Permission not granted for Gmail access.
---`;

const NOTION_SECTION = `## NOTION
| Title | Last Edited | Highlight |
|---|---|---|
| Agent Experience: Strategy | 2026-04-10T20:02Z | Fix MCP tool failures and improve agent reliability across all integration points |`;

const FULL_DELTA = [SLACK_SECTION, LINEAR_SECTION, CALENDAR_ERROR, GMAIL_ERROR, NOTION_SECTION].join("\n\n");

// ── Error detection ──

describe("detectSectionStatus", () => {
  it("detects permission error sections", () => {
    expect(detectSectionStatus("## CALENDAR\nError: Permission not granted for Google Calendar access.\n---")).toBe("error");
    expect(detectSectionStatus("## GMAIL\nError: Permission not granted for Gmail access.")).toBe("error");
    expect(detectSectionStatus("## NOTION\nAuthentication required")).toBe("error");
    expect(detectSectionStatus("Access denied — no data available")).toBe("error");
  });

  it("detects empty sections", () => {
    expect(detectSectionStatus("")).toBe("empty");
    expect(detectSectionStatus("## SLACK")).toBe("empty");
    expect(detectSectionStatus("  \n  ")).toBe("empty");
  });

  it("passes real data as ok", () => {
    expect(detectSectionStatus(SLACK_SECTION)).toBe("ok");
    expect(detectSectionStatus(LINEAR_SECTION)).toBe("ok");
    expect(detectSectionStatus(NOTION_SECTION)).toBe("ok");
  });

  it("does not false-positive on long sections with error keywords in content", () => {
    // A real Slack section might mention "permission" in a message — should still be "ok"
    const longSection = "## SLACK\n" + "Message about permission denied for user X.\n".repeat(20);
    expect(detectSectionStatus(longSection)).toBe("ok");
  });
});

// ── Slack cleaner ──

describe("cleanSlack", () => {
  it("strips 'No results found' search blocks", () => {
    const cleaned = cleanDelta(`## SLACK\n### Slack Search: Mentions of user\nNo results found.\n\n### #channel\n**Alice** — message`);
    expect(cleaned).not.toContain("No results found");
    expect(cleaned).toContain("**Alice**");
  });

  it("strips horizontal rules", () => {
    const cleaned = cleanDelta(`## SLACK\n---\n**Bob** — hello\n---`);
    expect(cleaned).not.toContain("---");
    expect(cleaned).toContain("**Bob**");
  });

  it("preserves NEEDS RESPONSE flags", () => {
    const cleaned = cleanDelta(SLACK_SECTION);
    expect(cleaned).toContain("NEEDS RESPONSE");
  });

  it("preserves URLs", () => {
    const cleaned = cleanDelta(SLACK_SECTION);
    expect(cleaned).toContain("https://github.com/monte-carlo-data/frontend/pull/12772");
  });

  it("preserves @mentions", () => {
    const cleaned = cleanDelta(SLACK_SECTION);
    expect(cleaned).toContain("@Kieran Williams");
  });

  it("strips Haiku commentary", () => {
    const cleaned = cleanDelta(`## SLACK\nLet me compile the results.\n**Alice** — message`);
    expect(cleaned).not.toContain("Let me compile");
    expect(cleaned).toContain("**Alice**");
  });
});

// ── Linear cleaner ──

describe("cleanLinear", () => {
  it("preserves normal table output", () => {
    const cleaned = cleanDelta(LINEAR_SECTION);
    expect(cleaned).toContain("VEC-77");
    expect(cleaned).toContain("VEC-36");
    expect(cleaned).toContain("| ID |");
  });

  it("handles degraded 'files too large' output", () => {
    const degraded = `## LINEAR\nThe files are too large to parse fully. I can see VEC-77 and VEC-36 mentioned.`;
    const cleaned = cleanDelta(degraded);
    expect(cleaned).toContain("[Partial data");
    expect(cleaned).toContain("VEC-77");
    expect(cleaned).toContain("VEC-36");
  });
});

// ── Calendar cleaner ──

describe("cleanCalendar", () => {
  it("passes through clean calendar data", () => {
    const cal = `## CALENDAR\n**Vector Team Sync** — Mon Apr 14, 10:00-11:00 IDT\nAttendees: Kieran, Mor, Gene\nhttps://meet.google.com/abc-def`;
    const cleaned = cleanDelta(cal);
    expect(cleaned).toContain("Vector Team Sync");
    expect(cleaned).toContain("https://meet.google.com/abc-def");
  });
});

// ── Gmail cleaner ──

describe("cleanGmail", () => {
  it("strips bot notification emails", () => {
    const gmail = `## GMAIL\n**From:** notifications@github.com\nSubject: PR review requested\n\n**From:** alice@company.com\nSubject: Follow up on design review`;
    const cleaned = cleanDelta(gmail);
    expect(cleaned).not.toContain("notifications@github.com");
    expect(cleaned).toContain("alice@company.com");
  });
});

// ── Notion cleaner ──

describe("cleanNotion", () => {
  it("preserves table format", () => {
    const cleaned = cleanDelta(NOTION_SECTION);
    expect(cleaned).toContain("Agent Experience: Strategy");
    expect(cleaned).toContain("| Title |");
  });
});

// ── Integration: cleanDelta ──

describe("cleanDelta", () => {
  it("removes error sections from full delta", () => {
    const cleaned = cleanDelta(FULL_DELTA);
    expect(cleaned).not.toContain("## CALENDAR");
    expect(cleaned).not.toContain("## GMAIL");
    expect(cleaned).toContain("## SLACK");
    expect(cleaned).toContain("## LINEAR");
    expect(cleaned).toContain("## NOTION");
  });

  it("returns empty string for error-only delta", () => {
    const errorOnly = [CALENDAR_ERROR, GMAIL_ERROR].join("\n\n");
    expect(cleanDelta(errorOnly)).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(cleanDelta("")).toBe("");
    expect(cleanDelta("   ")).toBe("");
  });

  it("handles data with only known section headers", () => {
    // Unknown headers (e.g. ## JIRA) end up in PREAMBLE since splitSections
    // only recognizes SOURCE_HEADERS. This is expected — only known sources get cleaned.
    const onlySlack = `## SLACK\n**Alice** — hello`;
    const cleaned = cleanDelta(onlySlack);
    expect(cleaned).toContain("**Alice**");
  });
});

// ── cleanDeltaWithReport ──

describe("cleanDeltaWithReport", () => {
  it("reports correct counts", () => {
    const { report } = cleanDeltaWithReport(FULL_DELTA);
    expect(report.totalOriginalChars).toBe(FULL_DELTA.length);
    expect(report.totalCleanedChars).toBeLessThan(report.totalOriginalChars);
    expect(report.sectionsRemoved).toBe(2); // CALENDAR + GMAIL
    expect(report.removedSources).toContain("CALENDAR");
    expect(report.removedSources).toContain("GMAIL");
  });

  it("reports truncated sources", () => {
    // Generate an oversized SLACK section
    const bigSlack = "## SLACK\n" + "**User** — 2026-04-11 10:00\nSome message about a topic.\n".repeat(200);
    const { report } = cleanDeltaWithReport(bigSlack);
    expect(report.truncatedSources).toContain("SLACK");
  });

  it("handles empty delta", () => {
    const { cleaned, report } = cleanDeltaWithReport("");
    expect(cleaned).toBe("");
    expect(report.sectionsRemoved).toBe(0);
    expect(report.totalOriginalChars).toBe(0);
  });
});

// ── Truncation ──

describe("truncation", () => {
  it("truncates oversized sections with summary", () => {
    const bigSlack = "## SLACK\n" + "**User** — 2026-04-11 10:00\nMessage line here.\n".repeat(200);
    const cleaned = cleanDelta(bigSlack);
    expect(cleaned.length).toBeLessThan(bigSlack.length);
    expect(cleaned).toContain("..."); // truncation marker
    expect(cleaned).toContain("truncated");
  });

  it("preserves high-signal lines during truncation", () => {
    const lines = [
      "## SLACK",
      ...Array(100).fill("Low signal message line."),
      "**NEEDS RESPONSE** from manager: https://slack.com/archives/C123/p456",
      ...Array(100).fill("More low signal."),
    ];
    const bigSlack = lines.join("\n");
    const cleaned = cleanDelta(bigSlack);
    expect(cleaned).toContain("NEEDS RESPONSE");
    expect(cleaned).toContain("https://slack.com/archives/C123/p456");
  });
});

// ── Performance ──

describe("performance", () => {
  it("cleans a 50K delta in under 100ms", () => {
    const big = "## SLACK\n" + "**User** — message with some content here\n".repeat(1200)
      + "\n\n## LINEAR\n" + "| VEC-1 | Task | In Progress | High | Proj |\n".repeat(300)
      + "\n\n## NOTION\n" + "| Page | 2026-04-11 | Summary text here |\n".repeat(200);
    expect(big.length).toBeGreaterThan(50000);

    const start = performance.now();
    cleanDelta(big);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
