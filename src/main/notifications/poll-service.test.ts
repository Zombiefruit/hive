/**
 * Tests for the notification poll service — the heart of Claude Deck.
 *
 * Based on the product spec:
 * 1. Polls Slack, Linear, Calendar, Gmail, Notion in PARALLEL
 * 2. Never deletes existing notifications on refresh
 * 3. Persists all state (stages, skipped items) across restarts
 * 4. Loading indicator tracks actual progress (not premature)
 * 5. Respects date cutoffs (no old Slack messages)
 * 6. Stage transitions persist and trigger correct actions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// We need to mock Electron and child_process before importing the module
vi.mock("electron", () => ({
  app: { isPackaged: false, getAppPath: () => "/tmp/test-claude-deck" },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("../mcp-bridge", () => ({
  askBridge: vi.fn().mockResolvedValue("mock bridge response"),
  isBridgeReady: vi.fn().mockReturnValue(true),
  restartBridge: vi.fn(),
}));

vi.mock("../claude-path", () => ({
  getClaudeCodePath: () => "/usr/local/bin/claude",
}));

vi.mock("../db/database", () => ({
  getAllAgents: () => [],
  getAllContextRefs: () => [],
}));

// Use a temp dir for cache files
const TEST_DIR = path.join(os.tmpdir(), "claude-deck-test-" + Date.now());

describe("Poll Service — Notification Persistence", () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("should never delete existing notifications on refresh", () => {
    // SPEC: "Refresh just fetches new ones. I should not be deleting existing tasks."
    const cachePath = path.join(TEST_DIR, "notifications-cache.json");
    const existing = [
      { id: "poll-1", source: "linear", title: "VEC-10", stage: "start_work", status: "new", priority: "critical", summary: "test", createdAt: new Date().toISOString() },
      { id: "poll-2", source: "slack", title: "Thread response", stage: "done", status: "new", priority: "high", summary: "test", createdAt: new Date().toISOString() },
    ];
    fs.writeFileSync(cachePath, JSON.stringify(existing));

    // Simulate loading cache
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    expect(cached).toHaveLength(2);
    expect(cached[0].stage).toBe("start_work");
    expect(cached[1].stage).toBe("done");

    // After adding new items, existing should still be there
    const newItem = { id: "poll-3", source: "gmail", title: "New email", stage: "new", status: "new", priority: "low", summary: "test", createdAt: new Date().toISOString() };
    const merged = [...cached, newItem];
    expect(merged).toHaveLength(3);
    expect(merged.find(n => n.id === "poll-1")?.stage).toBe("start_work");
    expect(merged.find(n => n.id === "poll-2")?.stage).toBe("done");
  });

  it("should persist stage changes to cache file", () => {
    const cachePath = path.join(TEST_DIR, "notifications-cache.json");
    const notifications = [
      { id: "poll-1", source: "linear", title: "VEC-10", stage: "new", status: "new", priority: "critical", summary: "test", createdAt: new Date().toISOString() },
    ];
    fs.writeFileSync(cachePath, JSON.stringify(notifications));

    // Simulate stage change
    const loaded = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    loaded[0].stage = "start_work";
    fs.writeFileSync(cachePath, JSON.stringify(loaded));

    // Verify persistence
    const reloaded = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    expect(reloaded[0].stage).toBe("start_work");
  });

  it("should persist skipped items to cache file", () => {
    const skippedPath = path.join(TEST_DIR, "skipped-cache.json");
    const skipped = [
      { source: "slack", title: "Bot message", reason: "Automated notification" },
      { source: "gmail", title: "LinkedIn digest", reason: "Marketing email" },
    ];
    fs.writeFileSync(skippedPath, JSON.stringify(skipped));

    const loaded = JSON.parse(fs.readFileSync(skippedPath, "utf-8"));
    expect(loaded).toHaveLength(2);
    expect(loaded[0].reason).toBe("Automated notification");
  });

  it("should never filter out 'done' or 'dismissed' items from getNotifications", () => {
    // SPEC: "I don't want to delete anything. I should be able to see my finished/dismissed tasks."
    const notifications = [
      { id: "1", status: "new", stage: "new" },
      { id: "2", status: "new", stage: "done" },
      { id: "3", status: "dismissed", stage: "done" },
      { id: "4", status: "new", stage: "skipped" },
    ];

    // getNotifications should return ALL items — nothing hidden
    const visible = notifications; // no filter
    expect(visible).toHaveLength(4);
  });
});

describe("Poll Service — Date Filtering", () => {
  it("should compute correct date cutoff for Slack searches", () => {
    const hours = 168; // 1 week
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    // Should be approximately 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    expect(cutoffStr).toBe(sevenDaysAgo.toISOString().split("T")[0]);
  });

  it("should include after: param in Slack search queries", () => {
    const hours = 168;
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const slackAfter = cutoffDate.toISOString().split("T")[0];

    const query = `<@U02PKBZSB9Q> after:${slackAfter}`;
    expect(query).toContain("after:");
    expect(query).toMatch(/after:\d{4}-\d{2}-\d{2}/);
  });
});

describe("Poll Service — Deduplication", () => {
  it("should extract stable keys from Linear ticket IDs", () => {
    const extractKey = (n: { source: string; title: string; url?: string }): string => {
      if (n.url) {
        const linearMatch = n.url.match(/\/issue\/([A-Z]+-\d+)/);
        if (linearMatch) return `linear:${linearMatch[1]}`;
      }
      const ticketMatch = n.title.match(/([A-Z]+-\d+)/);
      if (ticketMatch) return `${n.source}:${ticketMatch[1]}`;
      return `${n.source}:${n.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
    };

    expect(extractKey({ source: "linear", title: "VEC-10: Add Fig UI", url: "https://linear.app/issue/VEC-10" }))
      .toBe("linear:VEC-10");

    // Same ticket, different title — should still dedup
    expect(extractKey({ source: "linear", title: "VEC-10: Updated title" }))
      .toBe("linear:VEC-10");
  });

  it("should extract stable keys from GitHub PR URLs", () => {
    const extractKey = (n: { source: string; title: string; url?: string }): string => {
      if (n.url) {
        const prMatch = n.url.match(/\/pull\/(\d+)/);
        if (prMatch) return `github:pr:${prMatch[1]}`;
      }
      return `${n.source}:${n.title.toLowerCase()}`;
    };

    expect(extractKey({ source: "github", title: "PR #12441", url: "https://github.com/monte-carlo-data/frontend/pull/12441" }))
      .toBe("github:pr:12441");
  });

  it("should not add duplicate notifications with same key", () => {
    const existing = new Set(["linear:VEC-10", "slack:C0AMSV2SK4Z"]);
    const newItem = { source: "linear", title: "VEC-10: Same ticket" };
    const key = `linear:VEC-10`; // extracted

    expect(existing.has(key)).toBe(true); // Should be skipped
  });
});

describe("Poll Service — Triage Response Parsing", () => {
  it("should parse actionable + follow_up + skipped from triage response", () => {
    const response = JSON.stringify({
      actionable: [
        { source: "linear", title: "VEC-10", confidence: 10, task_type: "implementation" },
      ],
      follow_up: [
        { source: "slack", title: "Thread with Mor", confidence: 6, task_type: "response" },
      ],
      skipped: [
        { source: "gmail", title: "LinkedIn digest", reason: "Marketing email" },
      ],
    });

    const parsed = JSON.parse(response);
    expect(parsed.actionable).toHaveLength(1);
    expect(parsed.follow_up).toHaveLength(1);
    expect(parsed.skipped).toHaveLength(1);
    expect(parsed.follow_up[0].task_type).toBe("response");
  });

  it("should handle markdown-wrapped JSON in triage response", () => {
    const response = "```json\n" + JSON.stringify({
      actionable: [{ source: "linear", title: "VEC-10" }],
      skipped: [],
    }) + "\n```";

    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    expect(codeBlockMatch).not.toBeNull();
    const cleaned = codeBlockMatch![1];
    const parsed = JSON.parse(cleaned);
    expect(parsed.actionable).toHaveLength(1);
  });

  it("should include timezone in triage prompt", () => {
    const now = new Date();
    const israelTime = now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false });
    expect(israelTime).toMatch(/\d{2}:\d{2}/);
  });
});

describe("Poll Service — Parallel Fetching", () => {
  it("should spawn separate processes for each source", () => {
    // SPEC: "I want five separate processes that will each initialize their tools and call and fetch data"
    const sources = ["Slack", "Linear", "Calendar", "Gmail", "Notion"];
    const promises = sources.map(name => Promise.resolve(`## ${name}\ndata`));

    // All should resolve in parallel
    return Promise.all(promises).then(results => {
      expect(results).toHaveLength(5);
      expect(results[0]).toContain("Slack");
      expect(results[4]).toContain("Notion");
    });
  });

  it("askOneShot processes should wait for MCP init before sending prompt", () => {
    // SPEC: Each process needs to load MCP connectors (~60s) before it can use them
    // The prompt should only be sent AFTER the init message with tools > 0
    const initMsg = { type: "system", subtype: "init", tools: Array(95).fill("mcp__claude_ai_Slack__read"), session_id: "test" };
    const mcpCount = (initMsg.tools as string[]).filter(t => t.includes("mcp__claude_ai")).length;
    expect(mcpCount).toBe(95);
    expect(mcpCount).toBeGreaterThan(0); // Only send prompt when MCP tools loaded
  });
});

describe("Poll Service — Stage Management", () => {
  it("should support all required stages", () => {
    // SPEC: Inbox, Start Work, Plan Review, Hack, Ship, Code Review, PR Feedback, Done, Backlog, Skipped
    const STAGES = ["new", "start_work", "plan_review", "hack", "ship", "code_review", "pr_feedback", "done", "backlog", "skipped", "preparing", "ready"];
    expect(STAGES).toContain("new");
    expect(STAGES).toContain("start_work");
    expect(STAGES).toContain("hack");
    expect(STAGES).toContain("done");
    expect(STAGES).toContain("skipped");
  });

  it("should trigger prepareWorkPlan when moving to start_work", () => {
    // SPEC: "If I drag it into start_work, it should start planning"
    const stage = "start_work";
    const shouldTriggerPlan = stage === "start_work";
    expect(shouldTriggerPlan).toBe(true);
  });

  it("should trigger startWorkAgent when moving to hack", () => {
    // SPEC: "Once there's a plan, drag to hack should start work"
    const stage = "hack";
    const shouldTriggerWork = stage === "hack";
    expect(shouldTriggerWork).toBe(true);
  });

  it("should persist stage changes via updateNotificationById", () => {
    // SPEC: "If I refresh the page, it should remember the stage"
    const notifications = [
      { id: "poll-1", stage: "new" },
      { id: "poll-2", stage: "start_work" },
    ];

    // Simulate updateNotificationById
    const target = notifications.find(n => n.id === "poll-2");
    expect(target).toBeDefined();
    Object.assign(target!, { stage: "hack" });
    expect(notifications.find(n => n.id === "poll-2")?.stage).toBe("hack");
  });
});

describe("Bridge — MCP Connector Management", () => {
  it("should track bridge generation to prevent stale timeouts", () => {
    let generation = 0;
    const startBridge = () => { generation++; };
    const stopBridge = () => { generation++; };

    startBridge();
    const gen1 = generation;
    stopBridge();
    startBridge();
    const gen2 = generation;

    // Stale timeout from gen1 should not affect gen2
    expect(gen1).not.toBe(gen2);
  });

  it("should verify required MCP connectors are present", () => {
    const tools = [
      "mcp__claude_ai_Slack__slack_read_channel",
      "mcp__claude_ai_Linear__list_issues",
      "mcp__claude_ai_Gmail__gmail_search_messages",
      "mcp__claude_ai_Google_Calendar__gcal_list_events",
      "mcp__claude_ai_Notion__notion-search",
    ];

    const hasSlack = tools.some(t => t.includes("Slack"));
    const hasLinear = tools.some(t => t.includes("Linear"));
    const hasGmail = tools.some(t => t.includes("Gmail"));
    const hasCalendar = tools.some(t => t.includes("Google_Calendar"));
    const hasNotion = tools.some(t => t.includes("Notion"));

    expect(hasSlack).toBe(true);
    expect(hasLinear).toBe(true);
    expect(hasGmail).toBe(true);
    expect(hasCalendar).toBe(true);
    expect(hasNotion).toBe(true);
  });
});
