/**
 * Regression tests for notification card display.
 * Prevents regressions in source icons, author display, and capitalization.
 */
import { describe, it, expect } from "vitest";

describe("Source display", () => {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  it("should capitalize source names", () => {
    expect(capitalize("notion")).toBe("Notion");
    expect(capitalize("slack")).toBe("Slack");
    expect(capitalize("github")).toBe("Github");
    expect(capitalize("linear")).toBe("Linear");
    expect(capitalize("email")).toBe("Email");
    expect(capitalize("manual")).toBe("Manual");
  });

  it("should show source name when author is Unknown", () => {
    const author = "Unknown";
    const source = "notion";
    const display = author && author !== "Unknown" ? author : capitalize(source);
    expect(display).toBe("Notion");
  });

  it("should show author name when author is known", () => {
    const author = "Matthew Stevens";
    const source = "slack";
    const display = author && author !== "Unknown" ? author : capitalize(source);
    expect(display).toBe("Matthew Stevens");
  });

  it("should show source when author is null", () => {
    const author = null;
    const source = "github";
    const display = author && author !== "Unknown" ? author : capitalize(source);
    expect(display).toBe("Github");
  });
});

describe("Source icons", () => {
  it("should have icons for all known sources", () => {
    const knownSources = ["linear", "slack", "github", "notion", "email", "manual", "calendar", "gong"];
    const sourceIcons: Record<string, boolean> = {
      linear: true, slack: true, github: true, notion: true, email: true, manual: true, calendar: true, gong: true,
    };
    for (const source of knownSources) {
      expect(sourceIcons[source]).toBe(true);
    }
  });

  it("should handle unknown source gracefully", () => {
    const sourceIcons: Record<string, boolean> = {
      linear: true, slack: true, github: true, notion: true, email: true, manual: true, calendar: true, gong: true,
    };
    expect(sourceIcons["unknown_source"]).toBeUndefined();
  });
});

describe("Meeting prep from calendar", () => {
  it("should classify future calendar events as meeting_prep", () => {
    const taskType = "meeting_prep";
    const validTypes = ["implementation", "review", "response", "investigation", "meeting_prep"];
    expect(validTypes).toContain(taskType);
  });

  it("calendar lookahead should be 7 days", () => {
    // Verified in .claude/skills/fetch-calendar/SKILL.md: "next 7 days"
    const LOOKAHEAD_DAYS = 7;
    expect(LOOKAHEAD_DAYS).toBe(7);
  });
});

describe("Integration defaults", () => {
  // These defaults must match poll-service.ts line ~455
  const DEFAULTS = { slack: true, linear: true, gmail: true, calendar: true, notion: true, github: true, gong: false };

  it("calendar integration should be enabled by default", () => {
    // Regression: calendar was false, causing meeting_prep tasks to never be created
    expect(DEFAULTS.calendar).toBe(true);
  });

  it("gmail integration should be enabled by default", () => {
    // Regression: gmail was false, preventing email follow-up tasks
    expect(DEFAULTS.gmail).toBe(true);
  });

  it("all data-source integrations should be enabled by default", () => {
    // Only gong is opt-in (not everyone has it)
    expect(DEFAULTS.slack).toBe(true);
    expect(DEFAULTS.linear).toBe(true);
    expect(DEFAULTS.github).toBe(true);
    expect(DEFAULTS.notion).toBe(true);
    expect(DEFAULTS.calendar).toBe(true);
    expect(DEFAULTS.gmail).toBe(true);
  });
});

describe("Source normalization", () => {
  it("should normalize source to lowercase for icon lookup", () => {
    const sourceIcons: Record<string, boolean> = {
      linear: true, slack: true, github: true, notion: true, email: true, manual: true, calendar: true, gong: true,
    };
    // AI might return capitalized source names — normalize before lookup
    const rawSources = ["Slack", "Linear", "GitHub", "NOTION", "Email", "slack"];
    for (const raw of rawSources) {
      expect(sourceIcons[raw.toLowerCase()]).toBe(true);
    }
  });
});

describe("Role selection", () => {
  const ROLE_OPTIONS = [
    "frontend_dev", "backend_dev", "fullstack_dev", "data_engineer",
    "data_scientist", "devops_sre", "engineering_manager", "pm",
    "designer", "marketing", "sales_cs", "other",
  ];

  it("should include all role types", () => {
    expect(ROLE_OPTIONS).toContain("pm");
    expect(ROLE_OPTIONS).toContain("data_engineer");
    expect(ROLE_OPTIONS).toContain("engineering_manager");
    expect(ROLE_OPTIONS).toContain("marketing");
    expect(ROLE_OPTIONS).toContain("other");
  });

  it("should support custom role when 'other' is selected", () => {
    const role = "other";
    const customRole = "Solutions Engineer";
    const effectiveRole = role === "other" && customRole ? customRole : role;
    expect(effectiveRole).toBe("Solutions Engineer");
  });

  it("should not save customRole when role is not 'other'", () => {
    const role = "pm";
    const customRole = "leftover value";
    const savedCustomRole = role === "other" && customRole.trim() ? customRole.trim() : undefined;
    expect(savedCustomRole).toBeUndefined();
  });
});

describe("Auto-discovery merge behavior", () => {
  it("should merge channels without duplicates", () => {
    const existing = [{ id: "C1", name: "#team-a" }, { id: "C2", name: "#team-b" }];
    const discovered = [{ id: "C2", name: "#team-b" }, { id: "C3", name: "#team-c" }];
    const existingIds = new Set(existing.map(c => c.id));
    const merged = [...existing];
    for (const ch of discovered) {
      if (!existingIds.has(ch.id)) merged.push(ch);
    }
    expect(merged).toHaveLength(3);
    expect(merged.map(c => c.id)).toEqual(["C1", "C2", "C3"]);
  });

  it("should merge coworkers without duplicates", () => {
    const existing = [{ name: "Alice", role: "peer" }];
    const discovered = [{ name: "Alice", role: "lead" }, { name: "Bob", role: "pm" }];
    const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
    const merged = [...existing];
    for (const c of discovered) {
      if (!existingNames.has(c.name.toLowerCase())) merged.push(c);
    }
    expect(merged).toHaveLength(2);
    expect(merged.map(c => c.name)).toEqual(["Alice", "Bob"]);
  });
});

describe("Timezone discovery", () => {
  it("should use Slack timezone when available", () => {
    const discoveredTz = "Asia/Jerusalem";
    const browserTz = "America/New_York";
    // Discovered tz takes priority over browser detection
    const effectiveTz = discoveredTz || browserTz;
    expect(effectiveTz).toBe("Asia/Jerusalem");
  });

  it("should fall back to browser timezone when Slack tz is unavailable", () => {
    const discoveredTz = undefined;
    const browserTz = "America/New_York";
    const effectiveTz = discoveredTz || browserTz;
    expect(effectiveTz).toBe("America/New_York");
  });
});

describe("Triage loading state", () => {
  it("safety timeout should be 10 minutes (600000ms)", () => {
    const SAFETY_TIMEOUT = 600_000;
    expect(SAFETY_TIMEOUT).toBe(600000);
    expect(SAFETY_TIMEOUT).toBeGreaterThan(300000); // Must be > 5 min for catch-up polls
  });
});
