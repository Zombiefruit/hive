/**
 * Tests for daily summary / standup report generation.
 *
 * The standup page shows what was accomplished yesterday and what's planned today.
 * It reads from the notifications cache (timeline events, stage changes).
 */

import { describe, it, expect } from "vitest";
import { buildStandupReport, formatStandupText } from "../../shared/standup";

describe("Daily Summary — buildStandupReport", () => {
  const today = new Date("2026-03-25T12:00:00Z");

  it("should include tasks completed yesterday", () => {
    const notifications = [
      {
        id: "1", title: "Fix auth bug", source: "linear", stage: "done",
        completedAt: "2026-03-24T15:00:00Z",
      },
    ];
    const report = buildStandupReport(notifications, today);
    expect(report.yesterday).toHaveLength(1);
    expect(report.yesterday[0].title).toBe("Fix auth bug");
    expect(report.yesterday[0].event).toBe("Completed");
  });

  it("should NOT include tasks completed two days ago", () => {
    const notifications = [
      {
        id: "1", title: "Old task", source: "linear", stage: "done",
        completedAt: "2026-03-23T15:00:00Z",
      },
    ];
    const report = buildStandupReport(notifications, today);
    expect(report.yesterday).toHaveLength(0);
  });

  it("should include tasks with timeline events from yesterday", () => {
    const notifications = [
      {
        id: "2", title: "Review PR #42", source: "github", stage: "hack",
        timeline: [
          { timestamp: "2026-03-24T10:00:00Z", event: "PR approved by 2 reviewers" },
          { timestamp: "2026-03-25T09:00:00Z", event: "Merged to main" },
        ],
      },
    ];
    const report = buildStandupReport(notifications, today);
    expect(report.yesterday).toHaveLength(1);
    expect(report.yesterday[0].event).toBe("PR approved by 2 reviewers");
  });

  it("should filter out 'Reset from planning' timeline events", () => {
    const notifications = [
      {
        id: "3", title: "Broken task", source: "slack", stage: "new",
        timeline: [
          { timestamp: "2026-03-24T10:00:00Z", event: "Reset from planning (app restarted)" },
        ],
      },
    ];
    const report = buildStandupReport(notifications, today);
    expect(report.yesterday).toHaveLength(0);
  });

  it("should list active tasks for today sorted by priority", () => {
    const notifications = [
      { id: "a", title: "Low task", source: "linear", stage: "new", priority: "low" },
      { id: "b", title: "Critical task", source: "slack", stage: "hack", priority: "critical" },
      { id: "c", title: "Medium task", source: "github", stage: "start_work", priority: "medium" },
      { id: "d", title: "Done task", source: "linear", stage: "done", priority: "high" },
    ];
    const report = buildStandupReport(notifications, today);
    expect(report.today).toHaveLength(3);
    expect(report.today[0].title).toBe("Critical task");
    expect(report.today[1].title).toBe("Medium task");
    expect(report.today[2].title).toBe("Low task");
  });

  it("should handle empty notifications", () => {
    const report = buildStandupReport([], today);
    expect(report.yesterday).toHaveLength(0);
    expect(report.today).toHaveLength(0);
    expect(report.blockers).toHaveLength(0);
  });
});

describe("Daily Summary — formatStandupText", () => {
  it("should produce Geekbot-style text", () => {
    const report = {
      yesterday: [
        { title: "Fix auth bug", source: "linear", event: "Completed" },
        { title: "Review PR #42", source: "github", event: "Approved" },
      ],
      today: [
        { title: "VEC-24: Chat rendering", source: "linear", priority: "high" },
      ],
      blockers: [] as string[],
      date: "2026-03-25",
    };

    const text = formatStandupText(report);
    expect(text).toContain("**What did you do yesterday?**");
    expect(text).toContain("[linear] Fix auth bug — Completed");
    expect(text).toContain("[github] Review PR #42 — Approved");
    expect(text).toContain("**What are you doing today?**");
    expect(text).toContain("[high] VEC-24: Chat rendering");
    expect(text).toContain("**Any blockers?**");
    expect(text).toContain("- None");
  });

  it("should show placeholder when no activity", () => {
    const report = {
      yesterday: [] as Array<{ title: string; source: string; event: string }>,
      today: [] as Array<{ title: string; source: string; priority: string }>,
      blockers: [] as string[],
      date: "2026-03-25",
    };
    const text = formatStandupText(report);
    expect(text).toContain("(no tracked activity)");
    expect(text).toContain("(no active tasks)");
  });

  it("should show blockers when present", () => {
    const report = {
      yesterday: [] as Array<{ title: string; source: string; event: string }>,
      today: [] as Array<{ title: string; source: string; priority: string }>,
      blockers: ["Waiting on design review from Jane", "CI pipeline broken"],
      date: "2026-03-25",
    };
    const text = formatStandupText(report);
    expect(text).toContain("Waiting on design review from Jane");
    expect(text).toContain("CI pipeline broken");
    expect(text).not.toContain("- None");
  });
});
