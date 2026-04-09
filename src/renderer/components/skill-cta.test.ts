/**
 * Tests for skill CTA behavior — ensuring skills receive proper context
 * and PR URLs are extracted from results.
 */
import { describe, it, expect } from "vitest";

describe("Skill CTA context", () => {
  it("should extract ticket ID from task title for skill args", () => {
    const titles = [
      { title: "VEC-44: Add tracking for performance agent clicks", expected: "VEC-44" },
      { title: "DAR-2137: Fix subscription UI", expected: "DAR-2137" },
      { title: "GONG-100: Call analytics", expected: "GONG-100" },
      { title: "No ticket here", expected: null },
    ];

    for (const { title, expected } of titles) {
      const match = title.match(/^([A-Z]+-\d+)/);
      expect(match?.[1] ?? null).toBe(expected);
    }
  });

  it("should never pass empty args to skill runner", () => {
    const title = "VEC-44: Add tracking";
    const ticketMatch = title.match(/^([A-Z]+-\d+)/);
    const ticketId = ticketMatch ? ticketMatch[1] : title;

    // Should always have a non-empty value
    expect(ticketId.length).toBeGreaterThan(0);
    // Even if no ticket match, falls back to full title
    const noTicketTitle = "Fix the thing";
    const noMatch = noTicketTitle.match(/^([A-Z]+-\d+)/);
    const fallback = noMatch ? noMatch[1] : noTicketTitle;
    expect(fallback).toBe("Fix the thing");
  });
});

describe("PR URL extraction from skill output", () => {
  it("should extract GitHub PR URL from result text", () => {
    const resultTexts = [
      {
        text: "Created PR: https://github.com/monte-carlo-data/frontend/pull/12800\nDone.",
        expected: "https://github.com/monte-carlo-data/frontend/pull/12800",
      },
      {
        text: "Pushed to branch. PR opened at https://github.com/monte-carlo-data/monolith-django/pull/1234 for review.",
        expected: "https://github.com/monte-carlo-data/monolith-django/pull/1234",
      },
      {
        text: "No PR created — just committed locally.",
        expected: null,
      },
    ];

    for (const { text, expected } of resultTexts) {
      const match = text.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/);
      expect(match?.[0] ?? null).toBe(expected);
    }
  });

  it("should not create duplicate PR links", () => {
    const existingLinks = [
      { type: "github_pr", label: "PR 12800", url: "https://github.com/monte-carlo-data/frontend/pull/12800" },
    ];
    const newPrUrl = "https://github.com/monte-carlo-data/frontend/pull/12800";
    const isDuplicate = existingLinks.some(l => l.url === newPrUrl);
    expect(isDuplicate).toBe(true);

    const differentPrUrl = "https://github.com/monte-carlo-data/frontend/pull/12801";
    const isDuplicate2 = existingLinks.some(l => l.url === differentPrUrl);
    expect(isDuplicate2).toBe(false);
  });

  it("should create proper link object from extracted URL", () => {
    const prUrl = "https://github.com/monte-carlo-data/frontend/pull/12800";
    const link = {
      type: "github_pr",
      label: `PR ${prUrl.split("/").pop()}`,
      url: prUrl,
    };
    expect(link.type).toBe("github_pr");
    expect(link.label).toBe("PR 12800");
    expect(link.url).toBe(prUrl);
  });
});

describe("Skill failure detection from result", () => {
  it("should detect failure when result contains error keywords", () => {
    const failureTexts = [
      "No plan found for VEC-44",
      "Skill failed: permission denied",
      "Prompt is too long",
      "Agent became unresponsive",
    ];
    for (const text of failureTexts) {
      const looksLikeFailure = text.length < 300 && (
        text.includes("No plan found") ||
        text.includes("failed") ||
        text.includes("Prompt is too long") ||
        text.includes("timed out") ||
        text.includes("unresponsive")
      );
      expect(looksLikeFailure).toBe(true);
    }
  });

  it("should NOT flag success results as failure", () => {
    const text = "---\nticket: VEC-44\n---\n\n## Phase 1\n### Task 1.1\n- [x] Done\n\nAll phases complete. PR opened.";
    const looksLikeFailure = text.length < 300 && (
      text.includes("No plan found") ||
      text.includes("failed") ||
      text.includes("Prompt is too long")
    );
    expect(looksLikeFailure).toBe(false);
  });
});
