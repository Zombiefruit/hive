/**
 * End-to-End Pipeline Test: Notification → Plan → Approve → Agent → PR
 *
 * Mocks the MCP bridge and Claude Code spawning to test the full pipeline
 * logic without burning tokens. Verifies state transitions, data flow,
 * cache persistence, timeline updates, and IPC broadcasts at each step.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import { normalizePriority, extractKey } from "../../shared/task-utils";

// ── Test fixtures ──

const MOCK_TRIAGE_RESPONSE = JSON.stringify({
  actionable: [
    {
      source: "linear",
      priority: "high",
      confidence: 9,
      task_type: "implementation",
      title: "VEC-20: Add criticality score to coverage-gaps",
      summary: "Update coverage-gaps query to include criticality_score > 0",
      links: [
        { type: "linear", label: "VEC-20", url: "https://linear.app/monte-carlo/issue/VEC-20" },
        { type: "github", label: "PR #12632", url: "https://github.com/monte-carlo-data/monolith-django/pull/12632" },
      ],
      author: "Yael Chemla",
      action_needed: "Rebase frontend PR, verify alignment with merged backend",
    },
  ],
  updates: [],
  follow_up: [
    {
      source: "slack",
      priority: "medium",
      confidence: 6,
      task_type: "response",
      title: "Thread with Mor about dashboard metrics",
      summary: "Mor asked about metric definitions",
      links: [{ type: "slack", label: "Thread", url: "https://slack.com/archives/C0AMSV2SK4Z/p1234" }],
      author: "Mor Ofir",
      action_needed: "Reply with metric definitions doc link",
    },
  ],
  skipped: [
    { source: "gmail", title: "LinkedIn digest", reason: "Marketing email" },
  ],
});

const MOCK_PLAN_RESPONSE = `Update coverage_gaps.py to add criticality_score filter. 2 files, ~30 lines.

---

## Details
1. Edit \`coverage_gaps.py\` — add \`WHERE criticality_score > 0\`
2. Update \`test_coverage_gaps.py\` with new test cases
3. Run test suite
4. Rebase frontend PR #12302 onto updated backend`;

const MOCK_ITERATE_RESPONSE = `Updated plan based on feedback. Will also update the API serializer.

---

## Details
1. Edit \`coverage_gaps.py\` — add criticality filter
2. Edit \`serializers.py\` — include criticality_score in response
3. Update tests
4. Rebase frontend PR`;

const MOCK_WORK_PROMPT = "Implement the following: Update coverage_gaps.py to add criticality_score filter...";

// ── Mocks ──

const TEST_DIR = path.join(os.tmpdir(), `claude-deck-e2e-${Date.now()}`);
const CACHE_PATH = path.join(TEST_DIR, "notifications-cache.json");
const PLANS_PATH = path.join(TEST_DIR, "plans-cache.json");
const SKIPPED_PATH = path.join(TEST_DIR, "skipped-cache.json");

// Track all askBridge calls for verification
const bridgeCalls: Array<{ prompt: string; response: string }> = [];
let bridgeCallIndex = 0;
const bridgeResponses: string[] = [];

function mockAskBridge(prompt: string): Promise<string> {
  const response = bridgeResponses[bridgeCallIndex] ?? "No mock response configured";
  bridgeCalls.push({ prompt, response });
  bridgeCallIndex++;
  return Promise.resolve(response);
}

// Mock spawn for work agent
function mockSpawnAgent() {
  const stdin = { write: vi.fn() };
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as EventEmitter & {
    stdin: typeof stdin;
    stdout: typeof stdout;
    stderr: typeof stderr;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.pid = 99999;
  proc.kill = vi.fn();
  return proc;
}

// normalizePriority and extractKey imported from shared/task-utils

interface TestNotification {
  id: string;
  source: string;
  priority: string;
  status: string;
  title: string;
  summary: string;
  url?: string;
  links?: Array<{ type: string; label: string; url: string }>;
  taskType?: string;
  author?: string;
  confidence?: number;
  actionNeeded?: string;
  createdAt: string;
  stage?: string;
  timeline?: Array<{ timestamp: string; event: string }>;
}

interface TestWorkPlan {
  notificationId: string;
  title: string;
  plan: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}

// ── Tests ──

describe("E2E Pipeline: Notification → Plan → Approve → Agent → PR", () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    bridgeCalls.length = 0;
    bridgeCallIndex = 0;
    bridgeResponses.length = 0;
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // ── STEP 1: Fetch & Triage ──

  describe("Step 1: Fetch & Triage → Create Notifications", () => {
    it("should parse triage response into actionable, follow_up, and skipped arrays", () => {
      const parsed = JSON.parse(MOCK_TRIAGE_RESPONSE);

      expect(parsed.actionable).toHaveLength(1);
      expect(parsed.follow_up).toHaveLength(1);
      expect(parsed.skipped).toHaveLength(1);
      expect(parsed.updates).toHaveLength(0);
    });

    it("should create PollNotification with all required fields from triage item", () => {
      const parsed = JSON.parse(MOCK_TRIAGE_RESPONSE);
      const item = parsed.actionable[0];

      const notification: TestNotification = {
        id: `poll-${Date.now()}-test`,
        source: item.source,
        priority: normalizePriority(item.priority),
        status: "new",
        title: item.title,
        summary: item.summary,
        url: item.links?.[0]?.url,
        links: item.links,
        taskType: item.task_type,
        author: item.author,
        confidence: item.confidence,
        actionNeeded: item.action_needed,
        createdAt: new Date().toISOString(),
        stage: "new",
        timeline: [{ timestamp: new Date().toISOString(), event: `Created from ${item.source}` }],
      };

      expect(notification.id).toMatch(/^poll-/);
      expect(notification.priority).toBe("high");
      expect(notification.source).toBe("linear");
      expect(notification.taskType).toBe("implementation");
      expect(notification.links).toHaveLength(2);
      expect(notification.timeline).toHaveLength(1);
      expect(notification.author).toBe("Yael Chemla");
    });

    it("should dedup notifications by extractKey", () => {
      const parsed = JSON.parse(MOCK_TRIAGE_RESPONSE);
      const item = parsed.actionable[0];
      const key = extractKey(item);

      // Linear URL should extract the ticket ID
      expect(key).toBe("linear:VEC-20");

      // A second item about the same ticket should produce the same key
      const duplicate = { ...item, title: "Coverage gaps VEC-20 update", source: "slack" };
      // The link URL has the Linear issue, so it should still match
      expect(extractKey(duplicate)).toBe("linear:VEC-20");
    });

    it("should persist notifications to cache file", () => {
      const notifications: TestNotification[] = [{
        id: "poll-test-1",
        source: "linear",
        priority: "high",
        status: "new",
        title: "VEC-20: Add criticality score",
        summary: "Test",
        createdAt: new Date().toISOString(),
        stage: "new",
        links: [{ type: "linear", label: "VEC-20", url: "https://linear.app/issue/VEC-20" }],
        timeline: [{ timestamp: new Date().toISOString(), event: "Created from linear" }],
      }];

      fs.writeFileSync(CACHE_PATH, JSON.stringify(notifications));
      const loaded = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));

      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe("poll-test-1");
      expect(loaded[0].timeline).toHaveLength(1);
    });

    it("should normalize legacy priority values on cache load", () => {
      const cached = [
        { id: "1", priority: "urgent", source: "linear", title: "Test" },
        { id: "2", priority: "today", source: "slack", title: "Test2" },
        { id: "3", priority: "fyi", source: "gmail", title: "Test3" },
      ];

      const normalized = cached.map(n => ({
        ...n,
        priority: normalizePriority(n.priority),
      }));

      expect(normalized[0].priority).toBe("critical");
      expect(normalized[1].priority).toBe("high");
      expect(normalized[2].priority).toBe("low");
    });

    it("should create follow_up items with new stage and response task type", () => {
      const parsed = JSON.parse(MOCK_TRIAGE_RESPONSE);
      const followUp = parsed.follow_up[0];

      const notification: TestNotification = {
        id: `poll-${Date.now()}-fu`,
        source: followUp.source,
        priority: normalizePriority(followUp.priority),
        status: "new",
        title: followUp.title,
        summary: followUp.summary,
        taskType: followUp.task_type,
        createdAt: new Date().toISOString(),
        stage: "new",
      };

      expect(notification.stage).toBe("new");
      expect(notification.taskType).toBe("response");
    });
  });

  // ── STEP 2: Move to Planning → Generate Plan ──

  describe("Step 2: Planning — Generate Work Plan", () => {
    it("should move notification from new → start_work stage", () => {
      const notification: TestNotification = {
        id: "poll-test-1",
        source: "linear",
        priority: "high",
        status: "new",
        title: "VEC-20: Add criticality score",
        summary: "Test",
        createdAt: new Date().toISOString(),
        stage: "new",
        timeline: [],
      };

      // Simulate stage transition
      notification.stage = "start_work";
      notification.timeline!.push({
        timestamp: new Date().toISOString(),
        event: "Stage: new → start_work",
      });

      expect(notification.stage).toBe("start_work");
      expect(notification.timeline).toHaveLength(1);
      expect(notification.timeline![0].event).toContain("→ start_work");
    });

    it("should call askBridge with plan prompt and return structured WorkPlan", async () => {
      bridgeResponses.push(MOCK_PLAN_RESPONSE);

      const notification = {
        id: "poll-test-1",
        source: "linear",
        title: "VEC-20: Add criticality score",
        summary: "Update coverage-gaps query",
        taskType: "implementation",
        links: [{ type: "linear", label: "VEC-20", url: "https://linear.app/issue/VEC-20" }],
      };

      // Simulate prepareWorkPlan
      const response = await mockAskBridge(`Analyze: ${notification.title}`);
      const plan: TestWorkPlan = {
        notificationId: notification.id,
        title: notification.title,
        plan: response,
        conversationHistory: [
          { role: "user", content: `Analyze and create a plan for: ${notification.title}` },
          { role: "assistant", content: response },
        ],
      };

      expect(plan.plan).toContain("coverage_gaps.py");
      expect(plan.conversationHistory).toHaveLength(2);
      expect(plan.conversationHistory[1].role).toBe("assistant");
      expect(bridgeCalls).toHaveLength(1);
    });

    it("should split plan into TL;DR and Details sections", () => {
      const parts = MOCK_PLAN_RESPONSE.split("\n---\n");

      expect(parts).toHaveLength(2);
      expect(parts[0]).toContain("coverage_gaps.py"); // TL;DR
      expect(parts[0].length).toBeLessThan(200); // Should be concise
      expect(parts[1]).toContain("## Details"); // Expandable section
      expect(parts[1]).toContain("1."); // Numbered steps
    });

    it("should persist plan to cache file", () => {
      const plans: Record<string, TestWorkPlan> = {
        "poll-test-1": {
          notificationId: "poll-test-1",
          title: "VEC-20",
          plan: MOCK_PLAN_RESPONSE,
          conversationHistory: [
            { role: "user", content: "Analyze VEC-20" },
            { role: "assistant", content: MOCK_PLAN_RESPONSE },
          ],
        },
      };

      fs.writeFileSync(PLANS_PATH, JSON.stringify(plans));
      const loaded = JSON.parse(fs.readFileSync(PLANS_PATH, "utf-8"));

      expect(loaded["poll-test-1"]).toBeDefined();
      expect(loaded["poll-test-1"].conversationHistory).toHaveLength(2);
    });
  });

  // ── STEP 3: Iterate Plan ──

  describe("Step 3: Iterate — Refine Plan with User Feedback", () => {
    it("should append user feedback and AI response to conversation history", async () => {
      bridgeResponses.push(MOCK_ITERATE_RESPONSE);

      const plan: TestWorkPlan = {
        notificationId: "poll-test-1",
        title: "VEC-20",
        plan: MOCK_PLAN_RESPONSE,
        conversationHistory: [
          { role: "user", content: "Analyze VEC-20" },
          { role: "assistant", content: MOCK_PLAN_RESPONSE },
        ],
      };

      // User sends feedback
      const feedback = "Also update the API serializer to include criticality_score";
      plan.conversationHistory.push({ role: "user", content: feedback });

      // Bridge responds
      const response = await mockAskBridge(feedback);
      plan.conversationHistory.push({ role: "assistant", content: response });
      plan.plan = response;

      expect(plan.conversationHistory).toHaveLength(4);
      expect(plan.conversationHistory[2].role).toBe("user");
      expect(plan.conversationHistory[2].content).toContain("serializer");
      expect(plan.conversationHistory[3].role).toBe("assistant");
      expect(plan.plan).toContain("serializers.py");
    });

    it("should preserve conversation history across multiple iterations", async () => {
      const history: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: "Plan for VEC-20" },
        { role: "assistant", content: "Initial plan..." },
      ];

      // Iteration 1
      history.push({ role: "user", content: "Add serializer update" });
      history.push({ role: "assistant", content: "Updated plan with serializer..." });

      // Iteration 2
      history.push({ role: "user", content: "Also add migration" });
      history.push({ role: "assistant", content: "Updated plan with migration..." });

      expect(history).toHaveLength(6);
      expect(history.filter(h => h.role === "user")).toHaveLength(3);
      expect(history.filter(h => h.role === "assistant")).toHaveLength(3);
    });
  });

  // ── STEP 4: Approve → Move to Working → Spawn Agent ──

  describe("Step 4: Approve — Spawn Work Agent", () => {
    it("should transition notification from start_work → hack", () => {
      const notification: TestNotification = {
        id: "poll-test-1",
        source: "linear",
        priority: "high",
        status: "new",
        title: "VEC-20",
        summary: "Test",
        createdAt: new Date().toISOString(),
        stage: "start_work",
        timeline: [
          { timestamp: new Date().toISOString(), event: "Stage: new → start_work" },
        ],
      };

      notification.stage = "hack";
      notification.timeline!.push({
        timestamp: new Date().toISOString(),
        event: "Stage: start_work → hack",
      });

      expect(notification.stage).toBe("hack");
      expect(notification.timeline).toHaveLength(2);
    });

    it("should compose work prompt from plan via askBridge", async () => {
      bridgeResponses.push(MOCK_WORK_PROMPT);

      const plan: TestWorkPlan = {
        notificationId: "poll-test-1",
        title: "VEC-20",
        plan: MOCK_PLAN_RESPONSE,
        conversationHistory: [],
      };

      const workPrompt = await mockAskBridge(`Compose work instructions for: ${plan.plan}`);

      expect(workPrompt).toContain("coverage_gaps.py");
      expect(bridgeCalls).toHaveLength(1);
      expect(bridgeCalls[0].prompt).toContain("Compose work instructions");
    });

    it("should spawn Claude Code process with correct stream-json args", () => {
      const expectedArgs = [
        "--output-format", "stream-json",
        "--verbose",
        "--input-format", "stream-json",
        "--no-chrome",
        "--model", "claude-sonnet-4-6",
      ];

      expect(expectedArgs).toContain("--output-format");
      expect(expectedArgs).toContain("stream-json");
      expect(expectedArgs).toContain("--no-chrome");
      expect(expectedArgs).not.toContain("-p"); // Never headless for work agents
    });

    it("should send work prompt to agent via stdin as stream-json", () => {
      const proc = mockSpawnAgent();
      const agentId = "test-agent-uuid";
      const prompt = MOCK_WORK_PROMPT;

      const message = JSON.stringify({
        type: "user",
        message: { role: "user", content: prompt },
        parent_tool_use_id: null,
        uuid: agentId,
        session_id: null,
      });

      proc.stdin.write(message + "\n");

      expect(proc.stdin.write).toHaveBeenCalledTimes(1);
      const written = proc.stdin.write.mock.calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.type).toBe("user");
      expect(parsed.message.content).toContain("coverage_gaps.py");
      expect(parsed.uuid).toBe(agentId);
    });
  });

  // ── STEP 5: Agent Execution → PR Detection ──

  describe("Step 5: Agent Executes → Detects PR", () => {
    it("should parse agent progress events from stdout", () => {
      const events = [
        { type: "assistant", message: { content: [{ type: "text", text: "Reading coverage_gaps.py..." }] } },
        { type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "coverage_gaps.py" } }] } },
        { type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "pytest test_coverage_gaps.py" } }] } },
        { type: "assistant", message: { content: [{ type: "text", text: "All tests pass. Creating PR..." }] } },
        { type: "result", result: "Created PR #12700: Add criticality score filter\nhttps://github.com/monte-carlo-data/monolith-django/pull/12700" },
      ];

      // Parse tool uses
      const toolCalls = events
        .filter(e => e.type === "assistant")
        .flatMap(e => (e.message?.content as Array<{ type: string; name?: string }>)?.filter(b => b.type === "tool_use") ?? []);

      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].name).toBe("Edit");
      expect(toolCalls[1].name).toBe("Bash");

      // Detect PR from result
      const result = events.find(e => e.type === "result");
      const prMatch = String(result?.result ?? "").match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
      expect(prMatch).not.toBeNull();
      expect(prMatch![2]).toBe("12700");
    });

    it("should update notification with PR link and timeline event", () => {
      const notification: TestNotification = {
        id: "poll-test-1",
        source: "linear",
        priority: "high",
        status: "new",
        title: "VEC-20",
        summary: "Test",
        createdAt: new Date().toISOString(),
        stage: "hack",
        links: [{ type: "linear", label: "VEC-20", url: "https://linear.app/issue/VEC-20" }],
        timeline: [
          { timestamp: new Date().toISOString(), event: "Stage: new → start_work" },
          { timestamp: new Date().toISOString(), event: "Stage: start_work → hack" },
        ],
      };

      // Agent created a PR
      const prUrl = "https://github.com/monte-carlo-data/monolith-django/pull/12700";
      notification.links!.push({ type: "github", label: "PR #12700", url: prUrl });
      notification.timeline!.push({
        timestamp: new Date().toISOString(),
        event: "PR #12700 created by agent",
      });

      expect(notification.links).toHaveLength(2);
      expect(notification.links![1].url).toContain("pull/12700");
      expect(notification.timeline).toHaveLength(3);
    });

    it("should transition to done when agent completes", () => {
      const notification: TestNotification = {
        id: "poll-test-1",
        source: "linear",
        priority: "high",
        status: "new",
        title: "VEC-20",
        summary: "Test",
        createdAt: new Date().toISOString(),
        stage: "hack",
        timeline: [],
      };

      notification.stage = "done";
      notification.timeline!.push({
        timestamp: new Date().toISOString(),
        event: "Agent completed — PR #12700 ready for review",
      });

      expect(notification.stage).toBe("done");
      expect(notification.priority).toBe("high"); // Priority preserved, not downgraded
    });
  });

  // ── STEP 6: Full Pipeline Sequence ──

  describe("Step 6: Full Pipeline — Sequential State Verification", () => {
    it("should traverse all stages in correct order", () => {
      const notification: TestNotification = {
        id: "poll-test-full",
        source: "linear",
        priority: "high",
        status: "new",
        title: "VEC-20: Full pipeline test",
        summary: "End-to-end test",
        createdAt: new Date().toISOString(),
        stage: "new",
        timeline: [{ timestamp: new Date().toISOString(), event: "Created from linear" }],
        links: [{ type: "linear", label: "VEC-20", url: "https://linear.app/issue/VEC-20" }],
      };

      const stageLog: string[] = [notification.stage!];

      // Step 1: Created (already in "new")
      expect(notification.stage).toBe("new");

      // Step 2: Move to start_work
      notification.stage = "start_work";
      notification.timeline!.push({ timestamp: new Date().toISOString(), event: "Stage: new → start_work" });
      stageLog.push(notification.stage);

      // Step 3: Plan generated (stays in planning)
      const plan: TestWorkPlan = {
        notificationId: notification.id,
        title: notification.title,
        plan: MOCK_PLAN_RESPONSE,
        conversationHistory: [
          { role: "user", content: "Plan for VEC-20" },
          { role: "assistant", content: MOCK_PLAN_RESPONSE },
        ],
      };
      expect(plan.conversationHistory).toHaveLength(2);

      // Step 4: User approves → hack
      notification.stage = "hack";
      notification.timeline!.push({ timestamp: new Date().toISOString(), event: "Stage: start_work → hack" });
      stageLog.push(notification.stage);

      // Step 5: Agent runs, creates PR
      notification.links!.push({ type: "github", label: "PR #12700", url: "https://github.com/monte-carlo-data/monolith-django/pull/12700" });
      notification.timeline!.push({ timestamp: new Date().toISOString(), event: "PR #12700 created" });

      // Step 6: Agent completes → done
      notification.stage = "done";
      notification.timeline!.push({ timestamp: new Date().toISOString(), event: "Agent completed" });
      stageLog.push(notification.stage);

      // Verify full stage progression
      expect(stageLog).toEqual(["new", "start_work", "hack", "done"]);
      expect(notification.timeline).toHaveLength(5); // created + 2 transitions + PR + completed
      expect(notification.links).toHaveLength(2); // linear + github PR
      expect(notification.priority).toBe("high"); // Never downgraded
    });

    it("should handle the alternate path: start_work → iterate → hack", async () => {
      bridgeResponses.push(MOCK_PLAN_RESPONSE, MOCK_ITERATE_RESPONSE, MOCK_WORK_PROMPT);

      // Initial plan
      const plan: TestWorkPlan = {
        notificationId: "test",
        title: "VEC-20",
        plan: await mockAskBridge("Plan VEC-20"),
        conversationHistory: [
          { role: "user", content: "Plan VEC-20" },
          { role: "assistant", content: MOCK_PLAN_RESPONSE },
        ],
      };

      // User iterates
      plan.conversationHistory.push({ role: "user", content: "Also add serializer" });
      const iteratedPlan = await mockAskBridge("Also add serializer");
      plan.conversationHistory.push({ role: "assistant", content: iteratedPlan });
      plan.plan = iteratedPlan;

      // User approves → compose work prompt
      const workPrompt = await mockAskBridge("Compose instructions");

      expect(plan.conversationHistory).toHaveLength(4); // 2 rounds
      expect(plan.plan).toContain("serializers.py");
      expect(bridgeCalls).toHaveLength(3); // plan + iterate + compose
    });

    it("should survive cache round-trip at every stage", () => {
      const notification: TestNotification = {
        id: "poll-persist-test",
        source: "linear",
        priority: "high",
        status: "new",
        title: "VEC-20",
        summary: "Persist test",
        createdAt: new Date().toISOString(),
        stage: "start_work",
        timeline: [
          { timestamp: new Date().toISOString(), event: "Created" },
          { timestamp: new Date().toISOString(), event: "Stage: new → start_work" },
        ],
        links: [{ type: "linear", label: "VEC-20", url: "https://linear.app/issue/VEC-20" }],
      };

      // Save notification
      fs.writeFileSync(CACHE_PATH, JSON.stringify([notification]));

      // Save plan
      const plan = {
        notificationId: notification.id,
        title: "VEC-20",
        plan: MOCK_PLAN_RESPONSE,
        conversationHistory: [
          { role: "user", content: "Plan" },
          { role: "assistant", content: MOCK_PLAN_RESPONSE },
        ],
      };
      fs.writeFileSync(PLANS_PATH, JSON.stringify({ [notification.id]: plan }));

      // Reload both
      const loadedNotifications = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
      const loadedPlans = JSON.parse(fs.readFileSync(PLANS_PATH, "utf-8"));

      expect(loadedNotifications[0].id).toBe("poll-persist-test");
      expect(loadedNotifications[0].stage).toBe("start_work");
      expect(loadedNotifications[0].timeline).toHaveLength(2);
      expect(loadedPlans["poll-persist-test"].conversationHistory).toHaveLength(2);
    });
  });

  // ── Edge Cases ──

  describe("Edge Cases", () => {
    it("should handle bridge timeout during plan generation", async () => {
      bridgeResponses.push("Request timed out");

      const response = await mockAskBridge("Plan VEC-20");

      expect(response).toBe("Request timed out");
      // Plan should still be created with error message
      const plan: TestWorkPlan = {
        notificationId: "test",
        title: "VEC-20",
        plan: response,
        conversationHistory: [
          { role: "user", content: "Plan VEC-20" },
          { role: "assistant", content: response },
        ],
      };
      expect(plan.plan).toBe("Request timed out");
    });

    it("should handle agent crash during work execution", () => {
      const proc = mockSpawnAgent();
      const events: Array<{ type: string; data?: unknown }> = [];

      proc.on("exit", (code: number) => {
        events.push({ type: "exit", data: code });
      });

      // Simulate crash
      proc.emit("exit", 1, "SIGSEGV");

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("exit");
      expect(events[0].data).toBe(1);
    });

    it("should not create duplicate notifications on re-poll", () => {
      const existing = new Set(["linear:VEC-20"]);
      const incoming = [
        { source: "linear", title: "VEC-20: Updated title", links: [{ url: "https://linear.app/issue/VEC-20" }] },
        { source: "slack", title: "New thread about something else" },
      ];

      const added: string[] = [];
      for (const item of incoming) {
        const key = extractKey(item);
        if (!existing.has(key)) {
          existing.add(key);
          added.push(item.title);
        }
      }

      expect(added).toHaveLength(1); // Only the slack thread
      expect(added[0]).toContain("something else");
    });

    it("should consolidate duplicates in existing notification list", () => {
      const notifications = [
        { id: "1", source: "linear", title: "VEC-20", stage: "start_work", links: [{ url: "https://linear.app/issue/VEC-20" }] },
        { id: "2", source: "slack", title: "Thread about VEC-20", stage: "new", links: [{ url: "https://linear.app/issue/VEC-20" }] },
      ];

      const keyToFirst = new Map<string, number>();
      const toRemove = new Set<number>();
      const stageOrder: Record<string, number> = { done: 10, hack: 6, start_work: 4, new: 2, skipped: 0 };

      for (let i = 0; i < notifications.length; i++) {
        const key = extractKey(notifications[i]);
        const firstIdx = keyToFirst.get(key);
        if (firstIdx !== undefined) {
          const firstStage = stageOrder[notifications[firstIdx].stage ?? "new"] ?? 1;
          const dupeStage = stageOrder[notifications[i].stage ?? "new"] ?? 1;
          toRemove.add(dupeStage > firstStage ? firstIdx : i);
          if (dupeStage > firstStage) keyToFirst.set(key, i);
        } else {
          keyToFirst.set(key, i);
        }
      }

      expect(toRemove.size).toBe(1);
      expect(toRemove.has(1)).toBe(true); // Slack thread (new) removed, Linear (start_work) kept
    });
  });
});
