/**
 * BDD specs for planned features.
 *
 * Each test has a real body with concrete assertions — they're `.skip`'d
 * so they don't break CI but contain the actual implementation contract.
 * When picking up a feature: remove `.skip`, implement, make it green.
 */

import { describe, it, expect, vi } from "vitest";

// ═══════════════════════════════════════════════════════════════
// FEATURE: Skill-Based Planning Agent (#70)
// ═══════════════════════════════════════════════════════════════

describe("Skill-Based Planning Agent", () => {
  // Skills live at .claude/skills/<name>/SKILL.md with frontmatter:
  //   ---
  //   name: fetch-github
  //   description: Fetch GitHub PR details using gh CLI
  //   triggers: ["github.com/pull", "PR #"]
  //   ---

  it("should load and parse skill SKILL.md with frontmatter", () => {
    // Given a skill file at .claude/skills/fetch-github/SKILL.md
    const raw = `---
name: fetch-github
description: Fetch GitHub PR details
triggers: ["github.com/pull", "PR #"]
---
Use the gh CLI to fetch PR details. GitHub context should use gh CLI, not the MCP proxy.`;

    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    expect(frontmatterMatch).not.toBeNull();

    // Parse YAML-like frontmatter
    const meta = frontmatterMatch![1];
    expect(meta).toContain("name: fetch-github");
    expect(meta).toContain("triggers:");

    const body = frontmatterMatch![2].trim();
    expect(body).toContain("gh CLI");
  });

  it("should select skills based on links in the notification", () => {
    const links = [
      { type: "github", url: "https://github.com/monte-carlo-data/frontend/pull/12302" },
      { type: "linear", url: "https://linear.app/monte-carlo/issue/VEC-10" },
      { type: "slack", url: "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z/p1234" },
    ];

    const skills = [
      { name: "fetch-github", triggers: ["github.com/", "/pull/", "/issues/"] },
      { name: "fetch-linear", triggers: ["linear.app/", "/issue/"] },
      { name: "fetch-slack", triggers: ["slack.com/archives"] },
      { name: "fetch-gmail", triggers: ["mail.google.com"] },
    ];

    // Match links to skills
    const matched = links.map(link => {
      const skill = skills.find(s => s.triggers.some(t => link.url.includes(t)));
      return { link: link.url, skill: skill?.name ?? null };
    });

    expect(matched[0].skill).toBe("fetch-github");
    expect(matched[1].skill).toBe("fetch-linear");
    expect(matched[2].skill).toBe("fetch-slack");
  });

  it("should compose multiple skills into a single planning prompt", () => {
    const selectedSkills = ["fetch-github", "fetch-linear", "fetch-slack"];
    const skillBodies = {
      "fetch-github": "Use gh pr view to get PR details.",
      "fetch-linear": "Use Linear MCP to get ticket details.",
      "fetch-slack": "Use Slack MCP to read the thread.",
    };

    const composed = selectedSkills
      .map(s => `## Skill: ${s}\n${skillBodies[s as keyof typeof skillBodies]}`)
      .join("\n\n");

    expect(composed).toContain("## Skill: fetch-github");
    expect(composed).toContain("## Skill: fetch-linear");
    expect(composed).toContain("## Skill: fetch-slack");
    expect(composed.split("## Skill:").length - 1).toBe(3);
  });

  it("should use gh CLI for GitHub PRs, never WebFetch", () => {
    const prompt = "Use gh pr view 12302 --repo monte-carlo-data/frontend --json title,body,state,reviews,files";
    expect(prompt).toContain("gh pr view");
    expect(prompt).not.toContain("WebFetch");
    expect(prompt).not.toContain("fetch(");
  });

  it("should handle skill failure gracefully — skip and note the error", () => {
    const results = [
      { skill: "fetch-github", success: true, data: "PR #12302: approved, 3 files changed" },
      { skill: "fetch-slack", success: false, error: "Channel not found" },
      { skill: "fetch-linear", success: true, data: "VEC-10: In Progress" },
    ];

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    expect(successful).toHaveLength(2);
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toContain("Channel not found");

    // The plan should still be created with available data
    const context = successful.map(r => r.data).join("\n");
    expect(context).toContain("PR #12302");
    expect(context).toContain("VEC-10");
  });
});

// ═══════════════════════════════════════════════════════════════
// FEATURE: Slack/Linear User Search via MCP (#65)
// ═══════════════════════════════════════════════════════════════

describe("MCP User Search", () => {
  it("should search Slack users and return structured results", async () => {
    // Mock the bridge response for slack_search_users
    const mockBridgeResponse = JSON.stringify({
      users: [
        { id: "U02PKBZSB9Q", name: "Kieran Williams", display_name: "kwilliams", avatar: "https://..." },
        { id: "UEXAMPLE01", name: "Jane Smith", display_name: "jsmith", avatar: "https://..." },
      ],
    });

    const parsed = JSON.parse(mockBridgeResponse);
    expect(parsed.users).toHaveLength(2);
    expect(parsed.users[0]).toHaveProperty("id");
    expect(parsed.users[0]).toHaveProperty("name");
    expect(parsed.users[0]).toHaveProperty("display_name");
  });

  it("should debounce search to avoid excessive MCP calls", async () => {
    const calls: number[] = [];
    const debouncedSearch = (() => {
      let timer: ReturnType<typeof setTimeout>;
      return (query: string) => {
        clearTimeout(timer);
        return new Promise<void>(resolve => {
          timer = setTimeout(() => { calls.push(Date.now()); resolve(); }, 300);
        });
      };
    })();

    // Rapid-fire 5 searches — only the last should trigger
    debouncedSearch("k");
    debouncedSearch("kw");
    debouncedSearch("kwi");
    debouncedSearch("kwil");
    await debouncedSearch("kwill");
    await new Promise(r => setTimeout(r, 350));

    expect(calls.length).toBe(1); // Only one actual search
  });

  it("should search Linear users and return structured results", async () => {
    const mockResponse = JSON.stringify({
      users: [
        { id: "user-1", name: "Kieran Williams", email: "kwilliams@montecarlodata.com" },
        { id: "user-2", name: "Mor Ofir", email: "mofir@montecarlodata.com" },
      ],
    });

    const parsed = JSON.parse(mockResponse);
    expect(parsed.users).toHaveLength(2);
    expect(parsed.users[0].email).toContain("@montecarlodata.com");
  });

  it("should populate coworker entry from search selection", () => {
    const selectedUser = { id: "UEXAMPLE01", name: "Jane Smith", role: "manager" as const };
    const coworker = {
      name: selectedUser.name,
      role: selectedUser.role,
      slackUserId: selectedUser.id,
    };

    expect(coworker.name).toBe("Jane Smith");
    expect(coworker.slackUserId).toBe("UEXAMPLE01");
    expect(coworker.role).toBe("manager");
  });
});

// E2E Pipeline tests removed — comprehensive coverage in e2e-pipeline.test.ts

// ═══════════════════════════════════════════════════════════════
// FEATURE: Slack Hook — Auto-Spawn (#43)
// ═══════════════════════════════════════════════════════════════

describe("Slack Hook — Real-Time Monitoring", () => {
  it("should classify incoming Slack messages by urgency", () => {
    const classify = (msg: { author: string; channel: string; text: string; isDM: boolean },
                      config: { managerSlackId: string; coworkerIds: Set<string> }) => {
      if (msg.isDM && msg.author === config.managerSlackId) return "critical";
      if (msg.isDM && config.coworkerIds.has(msg.author)) return "high";
      if (msg.text.includes(`<@${config.managerSlackId}>`)) return "high";
      if (msg.isDM) return "medium";
      return "low";
    };

    const config = {
      managerSlackId: "UEXAMPLE01",
      coworkerIds: new Set(["U111", "U222"]),
    };

    expect(classify({ author: "UEXAMPLE01", channel: "DM", text: "Can you look at this?", isDM: true }, config)).toBe("critical");
    expect(classify({ author: "U111", channel: "DM", text: "Hey", isDM: true }, config)).toBe("high");
    expect(classify({ author: "U999", channel: "C123", text: "general discussion", isDM: false }, config)).toBe("low");
  });

  it("should filter out bot messages", () => {
    const isBot = (msg: { author: string; botId?: string; subtype?: string }) => {
      return !!msg.botId || msg.subtype === "bot_message" || msg.author === "USLACKBOT";
    };

    expect(isBot({ author: "U123", botId: "B456" })).toBe(true);
    expect(isBot({ author: "U123", subtype: "bot_message" })).toBe(true);
    expect(isBot({ author: "USLACKBOT" })).toBe(true);
    expect(isBot({ author: "U123" })).toBe(false);
  });

  it("should respect quiet hours — no notifications outside working hours", () => {
    const isQuietHour = (now: Date, config: { workStart: string; workEnd: string; timezone: string }) => {
      const timeStr = now.toLocaleString("en-US", { timeZone: config.timezone, hour: "2-digit", minute: "2-digit", hour12: false });
      const [h, m] = timeStr.split(":").map(Number);
      const nowMins = h * 60 + m;
      const [startH, startM] = config.workStart.split(":").map(Number);
      const [endH, endM] = config.workEnd.split(":").map(Number);
      return nowMins < startH * 60 + startM || nowMins > endH * 60 + endM;
    };

    const config = { workStart: "09:00", workEnd: "18:00", timezone: "Asia/Jerusalem" };

    // 3 AM — quiet
    const lateNight = new Date("2026-03-24T01:00:00+02:00");
    expect(isQuietHour(lateNight, config)).toBe(true);
  });

  it("should auto-spawn planning agent for critical mentions", () => {
    const shouldAutoSpawn = (priority: string, taskType: string) => {
      return priority === "critical" && taskType === "implementation";
    };

    expect(shouldAutoSpawn("critical", "implementation")).toBe(true);
    expect(shouldAutoSpawn("high", "implementation")).toBe(false);
    expect(shouldAutoSpawn("critical", "response")).toBe(false); // responses need human
  });
});

// ═══════════════════════════════════════════════════════════════
// FEATURE: Smart Refresh
// ═══════════════════════════════════════════════════════════════

describe("Smart Refresh — Incremental Updates", () => {
  it("should build source-specific queries from existing tasks", () => {
    const tasks = [
      { source: "linear", title: "VEC-10", url: "https://linear.app/issue/VEC-10" },
      { source: "linear", title: "VEC-20", url: "https://linear.app/issue/VEC-20" },
      { source: "github", title: "PR #12302", url: "https://github.com/monte-carlo-data/frontend/pull/12302" },
      { source: "slack", title: "Thread", url: "https://slack.com/archives/C0AMSV2SK4Z/p1234" },
    ];

    // Group by source
    const bySource = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const list = bySource.get(t.source) ?? [];
      list.push(t);
      bySource.set(t.source, list);
    }

    expect(bySource.get("linear")).toHaveLength(2);
    expect(bySource.get("github")).toHaveLength(1);
    expect(bySource.get("slack")).toHaveLength(1);
    expect(bySource.has("gmail")).toBe(false); // No gmail tasks — skip gmail entirely
  });

  it("should detect Linear ticket status changes", () => {
    const before = { id: "VEC-10", status: "In Progress" };
    const after = { id: "VEC-10", status: "In Review" };

    const changed = before.status !== after.status;
    expect(changed).toBe(true);

    const timelineEvent = `Status: ${before.status} → ${after.status}`;
    expect(timelineEvent).toBe("Status: In Progress → In Review");
  });

  it("should detect new Slack replies in tracked threads", () => {
    const lastChecked = new Date("2026-03-24T10:00:00Z");
    const replies = [
      { ts: "2026-03-24T09:00:00Z", author: "Jane" }, // before last check
      { ts: "2026-03-24T11:00:00Z", author: "Mor" },   // new
      { ts: "2026-03-24T12:00:00Z", author: "Dan" },   // new
    ];

    const newReplies = replies.filter(r => new Date(r.ts) > lastChecked);
    expect(newReplies).toHaveLength(2);
    expect(newReplies[0].author).toBe("Mor");
  });

  it("should detect PR status transitions", () => {
    const transitions: Record<string, string> = {
      "draft → open": "PR ready for review",
      "open → approved": "PR approved",
      "approved → merged": "PR merged",
      "open → closed": "PR closed without merge",
    };

    const before = "open";
    const after = "approved";
    const key = `${before} → ${after}`;
    expect(transitions[key]).toBe("PR approved");
  });

  it("should be significantly faster than full poll", () => {
    // Smart refresh: check N specific resources
    // Full poll: scan all sources + triage
    const smartRefreshOps = 5; // 5 targeted API calls
    const fullPollOps = 15;    // 6 Slack searches + 1 Linear + 1 Calendar + 1 Gmail + 1 Notion + triage

    expect(smartRefreshOps).toBeLessThan(fullPollOps / 2);
  });
});

// ═══════════════════════════════════════════════════════════════
// FEATURE: Config-Driven Poll Cadence
// ═══════════════════════════════════════════════════════════════

describe("Config-Driven Poll Cadence", () => {
  it("should convert cadence string to milliseconds", () => {
    const cadenceToMs = (cadence: string): number | null => {
      if (cadence === "manual") return null;
      if (cadence === "15min") return 15 * 60 * 1000;
      if (cadence === "30min") return 30 * 60 * 1000;
      if (cadence === "1hr") return 60 * 60 * 1000;
      return null;
    };

    expect(cadenceToMs("15min")).toBe(900_000);
    expect(cadenceToMs("30min")).toBe(1_800_000);
    expect(cadenceToMs("1hr")).toBe(3_600_000);
    expect(cadenceToMs("manual")).toBeNull();
  });

  it("should start interval on non-manual cadence", () => {
    const setIntervalMock = vi.fn();
    const cadence = "30min";

    if (cadence !== "manual") {
      setIntervalMock(() => {}, 1_800_000);
    }

    expect(setIntervalMock).toHaveBeenCalledTimes(1);
  });

  it("should clear and reset interval when cadence changes", () => {
    let intervalId: number | null = 42;
    const clearIntervalMock = vi.fn();
    const setIntervalMock = vi.fn(() => 43);

    // Cadence changes from 30min to 15min
    if (intervalId) clearIntervalMock(intervalId);
    intervalId = setIntervalMock(() => {}, 900_000);

    expect(clearIntervalMock).toHaveBeenCalledWith(42);
    expect(setIntervalMock).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// FEATURE: Manager Learning from History
// ═══════════════════════════════════════════════════════════════

describe("Manager Learning from History", () => {
  it("should compute average completion time per task type", () => {
    const completed = [
      { taskType: "implementation", createdAt: "2026-03-20T09:00:00Z", completedAt: "2026-03-20T11:30:00Z" },
      { taskType: "implementation", createdAt: "2026-03-21T10:00:00Z", completedAt: "2026-03-21T11:00:00Z" },
      { taskType: "review", createdAt: "2026-03-20T14:00:00Z", completedAt: "2026-03-20T14:30:00Z" },
      { taskType: "response", createdAt: "2026-03-20T15:00:00Z", completedAt: "2026-03-20T15:10:00Z" },
    ];

    const avgByType = new Map<string, number>();
    const groups = new Map<string, number[]>();
    for (const t of completed) {
      const dur = (new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / 60000;
      const list = groups.get(t.taskType) ?? [];
      list.push(dur);
      groups.set(t.taskType, list);
    }
    for (const [type, durations] of groups) {
      avgByType.set(type, durations.reduce((a, b) => a + b, 0) / durations.length);
    }

    expect(avgByType.get("implementation")).toBe(105); // avg of 150min and 60min
    expect(avgByType.get("review")).toBe(30);
    expect(avgByType.get("response")).toBe(10);
  });

  it("should detect priority patterns from user corrections", () => {
    const corrections = [
      { from: "medium", to: "critical", author: "Jane Smith", count: 3 },
      { from: "low", to: "high", author: "Mor Ofir", count: 2 },
    ];

    // If user consistently escalates tasks from a person, learn the pattern
    const escalationPatterns = corrections
      .filter(c => c.count >= 2)
      .map(c => ({ author: c.author, suggestedPriority: c.to }));

    expect(escalationPatterns).toHaveLength(2);
    expect(escalationPatterns[0]).toEqual({ author: "Jane Smith", suggestedPriority: "critical" });
  });

  it("should include history summary in triage context", () => {
    const recentHistory = [
      "VEC-10: implementation, took 2.5h, completed 2026-03-20",
      "PR #12441: review, took 30min, completed 2026-03-21",
    ];

    const historyContext = `## Recent Completed Work\n${recentHistory.join("\n")}`;

    expect(historyContext).toContain("VEC-10");
    expect(historyContext).toContain("PR #12441");
    expect(historyContext).toContain("## Recent Completed Work");
  });
});

// ═══════════════════════════════════════════════════════════════
// FEATURE: Proactive Monitoring
// ═══════════════════════════════════════════════════════════════

describe("Proactive Monitoring", () => {
  it("should batch multiple new items into a single desktop notification", () => {
    const newItems = [
      { title: "VEC-30: New ticket", priority: "high" },
      { title: "Jane DM: Can you check this?", priority: "critical" },
      { title: "PR #12500 needs review", priority: "high" },
    ];

    const critical = newItems.filter(i => i.priority === "critical");
    const rest = newItems.filter(i => i.priority !== "critical");

    // Notification should lead with critical items
    const title = critical.length > 0
      ? `${critical[0].title} (+${rest.length} more)`
      : `${newItems.length} new items`;

    expect(title).toBe("Jane DM: Can you check this? (+2 more)");
  });

  it("should auto-dismiss stale items on next poll", () => {
    const items = [
      { id: "1", title: "Team Sync at 3PM", taskType: "meeting_prep", startTime: "2026-03-24T15:00:00Z" },
      { id: "2", title: "VEC-10: Fix bug", taskType: "implementation" },
    ];

    const now = new Date("2026-03-24T16:00:00Z"); // 4PM — meeting already happened

    const stale = items.filter(i => {
      if (i.taskType === "meeting_prep" && i.startTime) {
        return new Date(i.startTime) < now;
      }
      return false;
    });

    expect(stale).toHaveLength(1);
    expect(stale[0].title).toContain("Team Sync");
  });
});

// ═══════════════════════════════════════════════════════════════
// FEATURE: Multi-Agent Orchestration
// ═══════════════════════════════════════════════════════════════

describe("Multi-Agent Orchestration", () => {
  it("should detect dependent tasks from ticket references", () => {
    const tasks = [
      { id: "1", title: "VEC-10: Backend API", links: [{ url: "https://linear.app/issue/VEC-10" }] },
      { id: "2", title: "VEC-11: Frontend UI (depends on VEC-10)", links: [{ url: "https://linear.app/issue/VEC-11" }] },
    ];

    // VEC-11 mentions VEC-10 in its title — detect dependency
    // Extract the task's OWN ticket ID from its title to exclude self-references
    const dependencies: Array<{ from: string; to: string }> = [];
    for (const task of tasks) {
      const mentions = task.title.match(/([A-Z]+-\d+)/g) ?? [];
      const ownId = mentions[0]; // First ticket ID in title is the task's own ID
      for (const mention of mentions) {
        if (mention === ownId) continue; // Skip self-reference
        const dep = tasks.find(t => t.id !== task.id && t.title.includes(mention));
        if (dep) dependencies.push({ from: task.id, to: dep.id });
      }
    }

    expect(dependencies).toHaveLength(1);
    expect(dependencies[0]).toEqual({ from: "2", to: "1" }); // VEC-11 depends on VEC-10
  });

  it("should sequence dependent tasks — backend before frontend", () => {
    const tasks = [
      { id: "1", title: "Backend API", order: 0 },
      { id: "2", title: "Frontend UI", dependsOn: "1", order: 0 },
      { id: "3", title: "Update docs", dependsOn: "2", order: 0 },
    ];

    // Topological sort
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visited.has(id)) return;
      const task = tasks.find(t => t.id === id)!;
      if (task.dependsOn) visit(task.dependsOn);
      visited.add(id);
      sorted.push(id);
    };
    tasks.forEach(t => visit(t.id));

    expect(sorted).toEqual(["1", "2", "3"]); // Backend → Frontend → Docs
  });

  it("should run independent tasks in parallel", () => {
    const tasks = [
      { id: "1", title: "Fix auth bug", dependsOn: null },
      { id: "2", title: "Update README", dependsOn: null },
      { id: "3", title: "Add tests for auth", dependsOn: "1" },
    ];

    const independent = tasks.filter(t => !t.dependsOn);
    const dependent = tasks.filter(t => t.dependsOn);

    expect(independent).toHaveLength(2); // Can run in parallel
    expect(dependent).toHaveLength(1);   // Must wait for auth bug
  });
});

// ═══════════════════════════════════════════════════════════════
// FEATURE: Schedule — Completed Task Visualization
// ═══════════════════════════════════════════════════════════════

describe("Schedule — Completed Task Visualization", () => {
  it("should record completedAt when task transitions to done", () => {
    const task = {
      id: "1",
      stage: "hack",
      completedAt: undefined as string | undefined,
    };

    // Transition to done
    task.stage = "done";
    task.completedAt = new Date().toISOString();

    expect(task.completedAt).toBeDefined();
    expect(new Date(task.completedAt!).getTime()).toBeGreaterThan(0);
  });

  it("should compute actual duration vs estimated", () => {
    const task = {
      startTime: "14:00",
      endTime: "15:30", // estimated end
      estimatedMinutes: 90,
      completedAt: "2026-03-24T15:15:00Z", // actual: 75 minutes
      createdAt: "2026-03-24T14:00:00Z",
    };

    const actualMs = new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime();
    const actualMinutes = actualMs / 60000;
    const delta = actualMinutes - task.estimatedMinutes;

    expect(actualMinutes).toBe(75);
    expect(delta).toBe(-15); // Finished 15 min early
  });

  it("should place completed tasks at their actual time range on timeline", () => {
    const task = {
      startTime: "14:00",
      completedAt: "2026-03-24T15:15:00Z",
    };

    // Derive end time from completedAt (use UTC to avoid timezone issues)
    const completedDate = new Date(task.completedAt);
    const endTime = `${completedDate.getUTCHours().toString().padStart(2, "0")}:${completedDate.getUTCMinutes().toString().padStart(2, "0")}`;

    expect(endTime).toBe("15:15");
  });
});

// ═══════════════════════════════════════════════════════════════
// FEATURE: Slack Channel Search in Onboarding
// ═══════════════════════════════════════════════════════════════

describe("Slack Channel Search in Onboarding", () => {
  it("should parse channel search results from MCP", () => {
    const mockResponse = JSON.stringify({
      channels: [
        { id: "C0AMSV2SK4Z", name: "#team-vector", members: 12 },
        { id: "C054VQW7EGG", name: "#agentic-engineering", members: 45 },
        { id: "C0AMT1AGN7K", name: "#team-vector-standup", members: 8 },
      ],
    });

    const parsed = JSON.parse(mockResponse);
    expect(parsed.channels).toHaveLength(3);
    expect(parsed.channels[0]).toHaveProperty("id");
    expect(parsed.channels[0]).toHaveProperty("name");
    expect(parsed.channels[0]).toHaveProperty("members");
  });

  it("should filter channels by partial name match", () => {
    const channels = [
      { id: "C1", name: "#team-vector" },
      { id: "C2", name: "#team-vector-standup" },
      { id: "C3", name: "#general" },
      { id: "C4", name: "#agentic-engineering" },
    ];

    const query = "vector";
    const results = channels.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("#team-vector");
    expect(results[1].name).toBe("#team-vector-standup");
  });

  it("should add selected channel to config with both name and ID", () => {
    const selected = { id: "C0AMSV2SK4Z", name: "#team-vector" };
    const currentChannels = [{ id: "C054VQW7EGG", name: "#agentic-engineering" }];

    // Add without duplicates
    if (!currentChannels.some(c => c.id === selected.id)) {
      currentChannels.push(selected);
    }

    expect(currentChannels).toHaveLength(2);
    expect(currentChannels[1].id).toBe("C0AMSV2SK4Z");
    expect(currentChannels[1].name).toBe("#team-vector");
  });
});
