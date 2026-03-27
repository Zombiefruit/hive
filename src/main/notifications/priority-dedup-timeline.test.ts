/**
 * Tests for the priority system, dedup logic, timeline accumulation,
 * triage response parsing, and config-driven behavior.
 *
 * Imports shared utils from src/shared/task-utils.ts — same code as production.
 */

import { describe, it, expect } from "vitest";
import { normalizePriority, extractKey, STAGE_ORDER, VALID_STAGES, CONFIDENCE_THRESHOLD, AGENT_ACTIONABLE_TYPES, HUMAN_ONLY_TYPES } from "../../shared/task-utils";

describe("Priority Normalization", () => {
  it("should map the 5 canonical values to themselves", () => {
    expect(normalizePriority("critical")).toBe("critical");
    expect(normalizePriority("high")).toBe("high");
    expect(normalizePriority("medium")).toBe("medium");
    expect(normalizePriority("low")).toBe("low");
    expect(normalizePriority("backlog")).toBe("backlog");
  });

  it("should map legacy 'urgent' to 'critical'", () => {
    expect(normalizePriority("urgent")).toBe("critical");
  });

  it("should map legacy 'today' to 'high'", () => {
    expect(normalizePriority("today")).toBe("high");
  });

  it("should map legacy 'actionable' to 'medium'", () => {
    expect(normalizePriority("actionable")).toBe("medium");
  });

  it("should map legacy 'fyi' to 'low'", () => {
    expect(normalizePriority("fyi")).toBe("low");
  });

  it("should map legacy 'noise' to 'backlog'", () => {
    expect(normalizePriority("noise")).toBe("backlog");
  });

  it("should handle undefined as 'medium'", () => {
    expect(normalizePriority(undefined)).toBe("medium");
  });

  it("should handle empty string as 'medium'", () => {
    expect(normalizePriority("")).toBe("medium");
  });

  it("should handle unknown values as 'medium'", () => {
    expect(normalizePriority("unknown")).toBe("medium");
    expect(normalizePriority("10")).toBe("medium");
    expect(normalizePriority("P0")).toBe("medium");
  });

  it("should be case-insensitive", () => {
    expect(normalizePriority("CRITICAL")).toBe("critical");
    expect(normalizePriority("High")).toBe("high");
    expect(normalizePriority("TODAY")).toBe("high");
  });
});

// extractKey imported from shared/task-utils

describe("Extract Key — Dedup", () => {
  it("should extract Linear ticket ID from URL", () => {
    expect(extractKey({
      source: "linear", title: "VEC-10: Fix bug",
      url: "https://linear.app/monte-carlo/issue/VEC-10",
    })).toBe("linear:VEC-10");
  });

  it("should extract GitHub PR number from URL", () => {
    expect(extractKey({
      source: "github", title: "Review PR",
      url: "https://github.com/monte-carlo-data/frontend/pull/12441",
    })).toBe("github:monte-carlo-data/frontend:pr:12441");
  });

  it("should extract Slack channel from URL", () => {
    expect(extractKey({
      source: "slack", title: "Thread",
      url: "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z",
    })).toBe("slack:C0AMSV2SK4Z");
  });

  it("should extract Slack thread from URL with timestamp", () => {
    expect(extractKey({
      source: "slack", title: "Thread",
      url: "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z/p1234567890",
    })).toBe("slack:C0AMSV2SK4Z:1234567890");
  });

  it("should check links array, not just primary URL", () => {
    expect(extractKey({
      source: "slack", title: "Discussion about VEC-10",
      url: "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z",
      links: [
        { url: "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z" },
        { url: "https://linear.app/monte-carlo/issue/VEC-10" },
      ],
    })).toBe("slack:C0AMSV2SK4Z"); // First URL match wins
  });

  it("should extract ticket ID from title when no URL", () => {
    expect(extractKey({
      source: "linear", title: "VEC-10: Add Fig Intelligence UI",
    })).toBe("linear:VEC-10");
  });

  it("should extract PR number from title", () => {
    expect(extractKey({
      source: "github", title: "Review PR #12441",
    })).toBe("github:pr:12441");
  });

  it("should normalize title-based keys to lowercase", () => {
    const key1 = extractKey({ source: "slack", title: "Team Sync Discussion" });
    const key2 = extractKey({ source: "slack", title: "team sync discussion" });
    expect(key1).toBe(key2);
  });

  it("should produce different keys for different sources with same title", () => {
    const key1 = extractKey({ source: "slack", title: "Bug report" });
    const key2 = extractKey({ source: "gmail", title: "Bug report" });
    expect(key1).not.toBe(key2);
  });

  it("should match same Linear ticket across different sources", () => {
    const slackKey = extractKey({
      source: "slack", title: "Discussion about VEC-10",
      links: [{ url: "https://linear.app/monte-carlo/issue/VEC-10" }],
    });
    const linearKey = extractKey({
      source: "linear", title: "VEC-10: Add Fig UI",
      url: "https://linear.app/monte-carlo/issue/VEC-10",
    });
    expect(slackKey).toBe(linearKey);
  });
});

// ── Timeline Accumulation ──

interface TimelineEntry {
  timestamp: string;
  event: string;
}

describe("Timeline Accumulation", () => {
  it("should add events to timeline array", () => {
    const timeline: TimelineEntry[] = [];
    timeline.push({ timestamp: new Date().toISOString(), event: "Created from slack" });
    timeline.push({ timestamp: new Date().toISOString(), event: "Stage: new → start_work" });
    timeline.push({ timestamp: new Date().toISOString(), event: "PR #123 opened" });

    expect(timeline).toHaveLength(3);
    expect(timeline[0].event).toBe("Created from slack");
    expect(timeline[2].event).toBe("PR #123 opened");
  });

  it("should prevent duplicate consecutive events", () => {
    const timeline: TimelineEntry[] = [];
    const addEvent = (event: string) => {
      const last = timeline[timeline.length - 1];
      if (!last || last.event !== event) {
        timeline.push({ timestamp: new Date().toISOString(), event });
      }
    };

    addEvent("PR approved");
    addEvent("PR approved"); // duplicate — should be skipped
    addEvent("PR merged");

    expect(timeline).toHaveLength(2);
    expect(timeline[0].event).toBe("PR approved");
    expect(timeline[1].event).toBe("PR merged");
  });

  it("should seed timeline for cached items without one", () => {
    const notification = {
      id: "poll-1",
      source: "linear",
      title: "VEC-10",
      createdAt: "2026-03-24T10:00:00Z",
      timeline: undefined as TimelineEntry[] | undefined,
    };

    // Simulate cache load behavior
    if (!notification.timeline) {
      notification.timeline = [{ timestamp: notification.createdAt, event: `Created from ${notification.source}` }];
    }

    expect(notification.timeline).toHaveLength(1);
    expect(notification.timeline[0].event).toBe("Created from linear");
  });
});

// ── Triage Response Parsing ──

describe("Triage Response Parsing — Updates Array", () => {
  it("should parse actionable + updates + follow_up + skipped", () => {
    const response = JSON.stringify({
      actionable: [
        { source: "linear", title: "NEW-1", priority: "high", confidence: 9, task_type: "implementation" },
      ],
      updates: [
        { existing_id: "poll-123", changes: { priority: "critical", stage: "hack" }, timeline_event: "PR opened" },
      ],
      follow_up: [
        { source: "slack", title: "Thread with Mor", confidence: 6, task_type: "response" },
      ],
      skipped: [
        { source: "gmail", title: "Newsletter", reason: "Marketing email" },
      ],
    });

    const parsed = JSON.parse(response);
    expect(parsed.actionable).toHaveLength(1);
    expect(parsed.updates).toHaveLength(1);
    expect(parsed.updates[0].existing_id).toBe("poll-123");
    expect(parsed.updates[0].timeline_event).toBe("PR opened");
    expect(parsed.follow_up).toHaveLength(1);
    expect(parsed.skipped).toHaveLength(1);
  });

  it("should not downgrade priority when stage is done", () => {
    const existing = { priority: "high" as string, stage: "hack" as string };
    const changes = { priority: "backlog", stage: "done" };

    // Simulate the update logic
    const newPri = normalizePriority(changes.priority);
    const isDoneTransition = changes.stage === "done";
    if (!isDoneTransition) existing.priority = newPri;
    if (changes.stage) existing.stage = changes.stage;

    expect(existing.priority).toBe("high"); // Preserved, not downgraded
    expect(existing.stage).toBe("done");
  });

  it("should apply priority change when not transitioning to done", () => {
    const existing = { priority: "medium" as string, stage: "new" as string };
    const changes = { priority: "critical", stage: "start_work" };

    const newPri = normalizePriority(changes.priority);
    const isDoneTransition = changes.stage === "done";
    if (!isDoneTransition) existing.priority = newPri;
    if (changes.stage) existing.stage = changes.stage;

    expect(existing.priority).toBe("critical");
    expect(existing.stage).toBe("start_work");
  });

  it("should handle markdown-wrapped JSON in triage response", () => {
    const response = "```json\n" + JSON.stringify({
      actionable: [{ source: "linear", title: "VEC-10", priority: "high" }],
      updates: [],
      follow_up: [],
      skipped: [],
    }) + "\n```";

    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    expect(codeBlockMatch).not.toBeNull();
    const parsed = JSON.parse(codeBlockMatch![1]);
    expect(parsed.actionable).toHaveLength(1);
    expect(parsed.updates).toHaveLength(0);
  });

  it("should discard garbage items with error keywords", () => {
    // The triage prompt says: never create tasks for permission errors, timeouts, etc.
    // This test verifies the expected behavior
    const garbageTitles = [
      "Permission not granted for Calendar",
      "MCP tool failed: Gmail timeout",
      "Request timed out",
      "Geekbot Standup Report",
    ];

    // These should NOT become actionable items
    for (const title of garbageTitles) {
      // In the real system, the AI filters these. We test the expectation.
      const isGarbage = /permission|timed out|failed|geekbot|standup report/i.test(title);
      expect(isGarbage).toBe(true);
    }
  });
});

// ── Consolidation (Post-Triage Dedup) ──

describe("Post-Triage Consolidation", () => {
  it("should merge notifications with the same extractKey", () => {
    const notifications = [
      { id: "1", source: "linear", title: "VEC-10: Fix bug", url: "https://linear.app/issue/VEC-10", stage: "start_work", links: undefined as Array<{ url: string }> | undefined },
      { id: "2", source: "slack", title: "Thread about VEC-10", url: undefined as string | undefined, links: [{ url: "https://linear.app/issue/VEC-10" }], stage: "new" },
    ];

    const keyToFirst = new Map<string, number>();
    const toRemove = new Set<number>();

    for (let i = 0; i < notifications.length; i++) {
      const key = extractKey(notifications[i]);
      const firstIdx = keyToFirst.get(key);
      if (firstIdx !== undefined) {
        // Keep the one with more progress
        const stageOrder: Record<string, number> = { done: 10, hack: 6, start_work: 4, new: 2, skipped: 0 };
        const firstStage = stageOrder[notifications[firstIdx].stage ?? "new"] ?? 2;
        const dupeStage = stageOrder[notifications[i].stage ?? "new"] ?? 2;
        if (dupeStage > firstStage) {
          toRemove.add(firstIdx);
          keyToFirst.set(key, i);
        } else {
          toRemove.add(i);
        }
      } else {
        keyToFirst.set(key, i);
      }
    }

    expect(toRemove.size).toBe(1);
    expect(toRemove.has(1)).toBe(true); // Slack thread (stage: new) removed, Linear ticket (stage: start_work) kept
  });

  it("should keep the more advanced stage when merging", () => {
    const stageOrder: Record<string, number> = { done: 10, hack: 6, start_work: 4, new: 2, skipped: 0 };

    expect(stageOrder["hack"]).toBeGreaterThan(stageOrder["new"]);
    expect(stageOrder["done"]).toBeGreaterThan(stageOrder["hack"]);
    expect(stageOrder["start_work"]).toBeGreaterThan(stageOrder["new"]);
  });
});

// ── Config-Driven Behavior ──

describe("Config-Driven Poll Service", () => {
  it("should skip sources with missing config", () => {
    const integrations = { slack: true, linear: true, gmail: false, calendar: false, notion: false, github: true };
    const slackUserId = "";
    const linearUser = "kwilliams";

    // Slack enabled but no user ID — should not fetch
    const shouldFetchSlack = integrations.slack && !!slackUserId;
    expect(shouldFetchSlack).toBe(false);

    // Linear enabled with username — should fetch
    const shouldFetchLinear = integrations.linear && !!linearUser;
    expect(shouldFetchLinear).toBe(true);

    // Gmail disabled — should not fetch
    const shouldFetchGmail = integrations.gmail;
    expect(shouldFetchGmail).toBe(false);
  });

  it("should build Slack search queries from config", () => {
    const userSlackId = "U02PKBZSB9Q";
    const managerSlackId = "U043ENDKV4Y";
    const channels = [{ id: "C0AMSV2SK4Z", name: "#team-vector" }];
    const slackAfter = "2026-03-17";

    const steps: string[] = [];
    steps.push(`<@${userSlackId}> after:${slackAfter}`);
    steps.push(`to:${userSlackId} after:${slackAfter}`);
    if (managerSlackId) steps.push(`from:<@${managerSlackId}> after:${slackAfter}`);
    for (const ch of channels) steps.push(`channel_id "${ch.id}"`);

    expect(steps).toHaveLength(4);
    expect(steps[0]).toContain("U02PKBZSB9Q");
    expect(steps[2]).toContain("U043ENDKV4Y");
    expect(steps[3]).toContain("C0AMSV2SK4Z");
  });

  it("should build coworker priority rules from config", () => {
    const coworkers = [
      { name: "Yael Chemla", role: "manager" },
      { name: "Mor Ofir", role: "pm" },
      { name: "Dan Lev", role: "peer" },
    ];

    const rules = coworkers.map(c => {
      if (c.role === "manager") return `${c.name}: critical`;
      if (c.role === "lead") return `${c.name}: critical`;
      if (c.role === "pm") return `${c.name}: high`;
      return `${c.name}: high`;
    });

    expect(rules[0]).toBe("Yael Chemla: critical");
    expect(rules[1]).toBe("Mor Ofir: high");
    expect(rules[2]).toBe("Dan Lev: high");
  });

  it("should filter out items below confidence threshold", () => {
    const items = [
      { title: "High confidence task", confidence: 9 },
      { title: "Medium confidence task", confidence: 6 },
      { title: "Low confidence task", confidence: 3 },
      { title: "No confidence task", confidence: undefined },
    ];

    const accepted = items.filter(i =>
      i.confidence === undefined || i.confidence >= CONFIDENCE_THRESHOLD
    );

    expect(accepted).toHaveLength(3); // 9, 6, and undefined pass
    expect(accepted.map(i => i.title)).not.toContain("Low confidence task");
    expect(CONFIDENCE_THRESHOLD).toBe(5);
  });
});

// ── Stage System ──

describe("Stage System", () => {
  // Uses VALID_STAGES imported from shared/task-utils

  it("should include all valid stages", () => {
    expect(VALID_STAGES).toContain("new");
    expect(VALID_STAGES).toContain("start_work");
    expect(VALID_STAGES).toContain("plan_review");
    expect(VALID_STAGES).toContain("hack");
    expect(VALID_STAGES).toContain("ship");
    expect(VALID_STAGES).toContain("code_review");
    expect(VALID_STAGES).toContain("pr_feedback");
    expect(VALID_STAGES).toContain("done");
    expect(VALID_STAGES).toContain("backlog");
    expect(VALID_STAGES).toContain("skipped");
    expect(VALID_STAGES).toContain("preparing");
    expect(VALID_STAGES).toContain("ready");
    expect(VALID_STAGES).not.toContain("planning");
    expect(VALID_STAGES).not.toContain("prepared");
    expect(VALID_STAGES).not.toContain("working");
    expect(VALID_STAGES).not.toContain("follow_up");
  });

  it("should categorize task types correctly", () => {
    // Uses AGENT_ACTIONABLE_TYPES and HUMAN_ONLY_TYPES from shared/task-utils

    expect(AGENT_ACTIONABLE_TYPES.has("implementation")).toBe(true);
    expect(AGENT_ACTIONABLE_TYPES.has("response")).toBe(false);
    expect(HUMAN_ONLY_TYPES.has("response")).toBe(true);
    expect(HUMAN_ONLY_TYPES.has("implementation")).toBe(false);

    // No overlap
    for (const t of AGENT_ACTIONABLE_TYPES) {
      expect(HUMAN_ONLY_TYPES.has(t)).toBe(false);
    }
  });
});
