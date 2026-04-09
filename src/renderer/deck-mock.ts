/**
 * Mock implementation of window.deck for browser-only dev mode.
 * Provides mock data so the UI renders with content for development.
 */

import type { StoreState } from "../shared/types";

const noop = () => Promise.resolve(undefined as never);

const MOCK_AGENTS = [
  {
    id: "agent-1",
    sessionId: "sess-1",
    pid: 1234,
    status: "active" as const,
    source: "deck" as const,
    task: "Implement retry logic for pipeline ingestion failures on the Vector team's data processing service",
    summary: "Adding exponential backoff with jitter to the pipeline ingestion service to handle transient DynamoDB throttling errors.",
    model: "claude-sonnet-4-6",
    branch: "dev/vec-423-retry-logic",
    cwd: "/Users/dev/projects/example-repo",
    parentAgentId: null,
    permissionMode: "default",
    maxBudgetUsd: 5,
    costUsd: 0.847,
    inputTokens: 24500,
    outputTokens: 3200,
    createdAt: new Date(Date.now() - 1200000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "agent-2",
    sessionId: "sess-2",
    pid: 5678,
    status: "active" as const,
    source: "deck" as const,
    task: "Fix flaky test in auth middleware — intermittent timeout in CI",
    summary: "The test_login_rate_limiting test fails intermittently due to a race condition in the mock Redis connection pool.",
    model: "claude-haiku-4-5-20251001",
    branch: "dev/fix-auth-test",
    cwd: "/Users/dev/projects/frontend",
    parentAgentId: null,
    permissionMode: "acceptEdits",
    maxBudgetUsd: 1,
    costUsd: 0.12,
    inputTokens: 8400,
    outputTokens: 1100,
    createdAt: new Date(Date.now() - 600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "agent-3",
    sessionId: "sess-3",
    pid: 9012,
    status: "errored" as const,
    source: "external" as const,
    task: "Refactor GraphQL resolvers to use DataLoader pattern",
    summary: "Replacing N+1 queries in the lineage resolver by batching through DataLoader. Currently profiling the hot path.",
    model: "claude-opus-4-6",
    branch: null,
    cwd: "/Users/dev/projects/example-repo",
    parentAgentId: null,
    permissionMode: "default",
    maxBudgetUsd: 10,
    costUsd: 2.34,
    inputTokens: 65000,
    outputTokens: 8700,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: "agent-4",
    sessionId: "sess-4",
    pid: 3456,
    status: "completed" as const,
    source: "deck" as const,
    task: "Add unit tests for the new notification service",
    summary: null,
    model: "claude-sonnet-4-6",
    branch: "dev/vec-401-notif-tests",
    cwd: "/Users/dev/projects/example-repo",
    parentAgentId: null,
    permissionMode: "acceptEdits",
    maxBudgetUsd: 2,
    costUsd: 0.95,
    inputTokens: 18200,
    outputTokens: 4300,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
  },
];

const MOCK_EVENTS = [
  { id: "evt-1", agentId: "agent-1", type: "task_start", summary: "Started: Implement retry logic for pipeline ingestion", metadataJson: null, timestamp: new Date(Date.now() - 1200000).toISOString() },
  { id: "evt-2", agentId: "agent-1", type: "tool_use", summary: "Used tool: Read src/pipeline/ingestion.py", metadataJson: null, timestamp: new Date(Date.now() - 1100000).toISOString() },
  { id: "evt-3", agentId: "agent-2", type: "task_start", summary: "Started: Fix flaky auth test", metadataJson: null, timestamp: new Date(Date.now() - 600000).toISOString() },
  { id: "evt-4", agentId: "agent-3", type: "error", summary: "Error: max_budget_usd exceeded", metadataJson: null, timestamp: new Date(Date.now() - 300000).toISOString() },
  { id: "evt-5", agentId: "agent-4", type: "completed", summary: "Completed in 42s — 12 tests added", metadataJson: null, timestamp: new Date(Date.now() - 1800000).toISOString() },
  { id: "evt-6", agentId: "agent-1", type: "tool_use", summary: "Used tool: Edit src/pipeline/retry.py", metadataJson: null, timestamp: new Date(Date.now() - 900000).toISOString() },
  { id: "evt-7", agentId: "agent-1", type: "context_detected", summary: "Detected linear: VEC-423", metadataJson: null, timestamp: new Date(Date.now() - 800000).toISOString() },
];

const MOCK_APPROVALS = [
  { id: "appr-1", agentId: "agent-1", toolName: "Bash", toolInput: JSON.stringify({ command: "git push origin dev/vec-423-retry-logic" }), description: "Push branch to remote", riskLevel: "medium" as const, status: "pending" as const, timestamp: new Date(Date.now() - 60000).toISOString() },
  { id: "appr-2", agentId: "agent-2", toolName: "Bash", toolInput: JSON.stringify({ command: "rm -rf node_modules && pnpm install" }), description: "Clean reinstall dependencies", riskLevel: "high" as const, status: "pending" as const, timestamp: new Date(Date.now() - 30000).toISOString() },
];

const MOCK_CONTEXT_REFS = [
  { id: "ctx-1", agentId: "agent-1", type: "linear" as const, resourceId: "VEC-423", title: "VEC-423: Add retry logic to pipeline ingestion", url: "https://linear.app/issue/VEC-423", detectedAt: new Date(Date.now() - 800000).toISOString() },
  { id: "ctx-2", agentId: "agent-1", type: "slack" as const, resourceId: "C0EXAMPLE1", title: "#team-engineering", url: "https://slack.com/archives/C0EXAMPLE1", detectedAt: new Date(Date.now() - 700000).toISOString() },
  { id: "ctx-3", agentId: "agent-3", type: "github" as const, resourceId: "org/example-repo#4521", title: "PR #4521: DataLoader refactor", url: "https://github.com/org/example-repo/pull/4521", detectedAt: new Date(Date.now() - 3500000).toISOString() },
];

function buildMockState(): StoreState {
  return {
    agents: MOCK_AGENTS,
    messages: {
      "agent-1": [
        { id: "msg-1", agentId: "agent-1", role: "user", origin: "user", content: "Implement retry logic for pipeline ingestion failures. Check VEC-423 for details.", toolCallsJson: null, costUsd: null, tokenUsageJson: null, timestamp: new Date(Date.now() - 1200000).toISOString() },
        { id: "msg-2", agentId: "agent-1", role: "assistant", origin: "user", content: "I'll start by reading the current pipeline ingestion code to understand the failure points, then implement exponential backoff retry logic.", toolCallsJson: null, costUsd: 0.05, tokenUsageJson: null, timestamp: new Date(Date.now() - 1190000).toISOString() },
        { id: "msg-3", agentId: "agent-1", role: "tool_use", origin: "system", content: "Read", toolCallsJson: JSON.stringify({ name: "Read", input: { file_path: "src/pipeline/ingestion.py" } }), costUsd: null, tokenUsageJson: null, timestamp: new Date(Date.now() - 1180000).toISOString() },
      ],
    },
    approvals: MOCK_APPROVALS,
    contextRefs: {
      "agent-1": MOCK_CONTEXT_REFS.filter((r) => r.agentId === "agent-1"),
      "agent-3": MOCK_CONTEXT_REFS.filter((r) => r.agentId === "agent-3"),
    },
    events: MOCK_EVENTS,
    metrics: {
      active: 2,
      idle: 0,
      errored: 1,
      completed: 1,
      totalTokens: 133400,
      totalCostUsd: 4.257,
    },
  };
}

// Detect Electron reliably via userAgent (not window.deck which has timing issues with contextBridge)
const isElectron = navigator.userAgent.toLowerCase().includes("electron");

const API_BASE = "http://localhost:9876";

async function fetchApi(path: string): Promise<unknown> {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    return await res.json();
  } catch {
    return null;
  }
}

if (!isElectron) {
  console.warn("[Claude Deck] Running in browser mode — connecting to debug API on port 9876");

  let storeCallback: ((state: unknown) => void) | null = null;

  (window as unknown as { deck: unknown }).deck = {
    openExternal: (url: string) => window.open(url, "_blank"),
    spawnAgent: noop,
    killAgent: noop,
    sendMessage: noop,
    interruptAgent: noop,
    resumeSession: noop,
    listAllSessions: () => fetchApi("/api/sessions"),
    getNotifications: () => fetchApi("/api/notifications"),
    refreshNotifications: noop,
    prepareWorkPlan: noop,
    startWorkAgent: noop,
    onTaskEvent: () => () => {},
    onPollingStarted: () => () => {},
    onNotificationsUpdate: () => () => {},
    respondToApproval: noop,
    addContextUrl: noop,
    sendManagerMessage: async (msg: string) => {
      return { id: "mock", role: "assistant", content: `[Mock] I received: "${msg}". In Electron mode, I'd use my fleet tools to help.`, timestamp: new Date().toISOString() };
    },
    getManagerConversations: () => Promise.resolve([]),
    switchManagerConversation: noop,
    newManagerConversation: () =>
      Promise.resolve({ id: "mock", title: "Mock", messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    deleteManagerConversation: noop,
    getManagerMessages: () => Promise.resolve([]),
    // Reflect (work habits analysis)
    getReflectSignals: () => Promise.resolve({
      responseCadence: { medianReplyMinutes: 23, unansweredOver24h: 2, unansweredTitles: ["Thread from Alice about pipeline fix", "DM from Bob re: deployment"], totalResponseTasks: 14, respondedWithin1h: 8 },
      focus: { avgConcurrentWip: 3.2, maxConcurrentWip: 5, contextSwitchCount: 7, score: 62 },
      meetingLoad: { meetingHoursThisWeek: 6.5, longestDeepWorkBlock: 150, meetingFocusRatio: 0.16, meetingCount: 8 },
      throughput: { completedThisWeek: 11, rollingFourWeekAvg: 9.5, weekOverWeekDelta: 15.8, cycleTimeByType: { implementation: 4.2, response: 0.8, review: 1.5, investigation: 2.1 } },
      weekLabel: "Week of Apr 4",
    }),
    getReflectData: () => Promise.resolve({
      signals: {
        responseCadence: { medianReplyMinutes: 23, unansweredOver24h: 2, unansweredTitles: ["Thread from Alice about pipeline fix", "DM from Bob re: deployment"], totalResponseTasks: 14, respondedWithin1h: 8 },
        focus: { avgConcurrentWip: 3.2, maxConcurrentWip: 5, contextSwitchCount: 7, score: 62 },
        meetingLoad: { meetingHoursThisWeek: 6.5, longestDeepWorkBlock: 150, meetingFocusRatio: 0.16, meetingCount: 8 },
        throughput: { completedThisWeek: 11, rollingFourWeekAvg: 9.5, weekOverWeekDelta: 15.8, cycleTimeByType: { implementation: 4.2, response: 0.8, review: 1.5, investigation: 2.1 } },
        weekLabel: "Week of Apr 4",
      },
      managerTake: {
        summary: "Good week overall. Your throughput is up 16% week-over-week with 11 tasks completed vs a 4-week average of 9.5. Response cadence is solid at 23 minutes median, though 2 Slack threads have gone unanswered for over 24 hours — worth checking on.\n\nFocus could use attention. You peaked at 5 concurrent tasks and averaged 3.2, with 7 context switches during the week. Consider batching similar work together. Your meeting load is manageable at 6.5 hours across 8 meetings, with a 2.5-hour deep work block available.",
        callouts: [
          "2 Slack threads unanswered >24h — reply to Alice and Bob",
          "7 context switches this week — try blocking 2-hour focus windows",
          "Throughput trending up — 11 completed vs 9.5 avg, nice momentum",
          "Implementation cycle time at 4.2h avg — healthy for your task complexity",
        ],
        rating: "Good progress",
        generatedAt: new Date().toISOString(),
      },
      history: [
        { weekLabel: "Mar 14", weekStartISO: "2026-03-14", completed: 8, avgCycleHours: 3.5, meetingHours: 5, focusScore: 70, responseCadenceMinutes: 30 },
        { weekLabel: "Mar 21", weekStartISO: "2026-03-21", completed: 10, avgCycleHours: 4.0, meetingHours: 7, focusScore: 55, responseCadenceMinutes: 25 },
        { weekLabel: "Mar 28", weekStartISO: "2026-03-28", completed: 9, avgCycleHours: 3.8, meetingHours: 6, focusScore: 65, responseCadenceMinutes: 20 },
        { weekLabel: "Apr 4", weekStartISO: "2026-04-04", completed: 11, avgCycleHours: 3.2, meetingHours: 6.5, focusScore: 62, responseCadenceMinutes: 23 },
      ],
    }),

    // Usage tracking
    getUsageSummary: () => {
      const today = new Date().toISOString().slice(0, 10);
      const makeDays = (count: number) => Array.from({ length: count }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (count - 1 - i));
        const date = d.toISOString().slice(0, 10);
        const base = 150 + Math.random() * 100;
        return {
          date,
          totalCostUsd: Math.round(base * 100) / 100,
          totalInputTokens: Math.round(base * 12000),
          totalOutputTokens: Math.round(base * 3000),
          callCount: 40 + Math.floor(Math.random() * 30),
          bySource: {
            agent: { costUsd: Math.round(base * 0.4 * 100) / 100, callCount: 12 },
            "skill-runner": { costUsd: Math.round(base * 0.25 * 100) / 100, callCount: 8 },
            "planning-agent": { costUsd: Math.round(base * 0.12 * 100) / 100, callCount: 6 },
            judge: { costUsd: Math.round(base * 0.08 * 100) / 100, callCount: 5 },
            manager: { costUsd: Math.round(base * 0.06 * 100) / 100, callCount: 4 },
            "poll-bridge": { costUsd: Math.round(base * 0.04 * 100) / 100, callCount: 3 },
            insights: { costUsd: Math.round(base * 0.03 * 100) / 100, callCount: 2 },
            reflect: { costUsd: Math.round(base * 0.02 * 100) / 100, callCount: 1 },
          },
          byModel: {
            "claude-sonnet-4-6": { costUsd: Math.round(base * 0.5 * 100) / 100, callCount: 20, inputTokens: Math.round(base * 6000), outputTokens: Math.round(base * 1500) },
            "claude-haiku-4-5-20251001": { costUsd: Math.round(base * 0.15 * 100) / 100, callCount: 15, inputTokens: Math.round(base * 4000), outputTokens: Math.round(base * 1000) },
            "claude-opus-4-6": { costUsd: Math.round(base * 0.35 * 100) / 100, callCount: 5, inputTokens: Math.round(base * 2000), outputTokens: Math.round(base * 500) },
          },
        };
      });
      const last30 = makeDays(30);
      const last7 = last30.slice(-7);
      const todayData = last30[last30.length - 1];
      const allCost = last30.reduce((s, d) => s + d.totalCostUsd, 0) + 4200;
      const allCalls = last30.reduce((s, d) => s + d.callCount, 0) + 12000;
      return Promise.resolve({
        today: { ...todayData, date: today },
        last7Days: last7,
        last30Days: last30,
        allTimeCostUsd: Math.round(allCost * 100) / 100,
        allTimeCallCount: allCalls,
      });
    },
    getRecentUsage: (limit?: number) => {
      const sources = ["agent", "skill-runner", "planning-agent", "judge", "manager", "poll-bridge", "insights", "reflect"] as const;
      const models = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-opus-4-6"];
      const labels = [
        "Implement retry logic", "Fix flaky test", "Triage notifications", "Plan VEC-423",
        "Generate insights", "Review PR #4521", "Extract memories", "Reflect analysis",
        "Manager chat", "Fetch Slack updates", "Poll Linear tickets", "Judge triage",
      ];
      const count = limit ?? 50;
      const entries = Array.from({ length: count }, (_, i) => {
        const src = sources[i % sources.length];
        const model = models[i % models.length];
        const input = 2000 + Math.floor(Math.random() * 30000);
        const output = 500 + Math.floor(Math.random() * 8000);
        const cost = (input * 0.000003 + output * 0.000015);
        return {
          id: `usage-${i}`,
          timestamp: new Date(Date.now() - i * 180000).toISOString(),
          source: src,
          model,
          inputTokens: input,
          outputTokens: output,
          costUsd: Math.round(cost * 1000) / 1000,
          durationMs: 1000 + Math.floor(Math.random() * 15000),
          label: labels[i % labels.length],
        };
      });
      return Promise.resolve(entries);
    },

    // Config (onboarding) — mock with localStorage
    hasConfig: () => Promise.resolve(localStorage.getItem("claude-deck-config") !== null),
    getConfig: () => {
      const raw = localStorage.getItem("claude-deck-config");
      return Promise.resolve(raw ? JSON.parse(raw) : null);
    },
    saveConfig: (config: unknown) => {
      localStorage.setItem("claude-deck-config", JSON.stringify(config));
      return Promise.resolve({ ok: true });
    },

    resumeInTerminal: () => Promise.resolve({ ok: true }),
    onStoreUpdate: (cb: (state: unknown) => void) => {
      storeCallback = cb;
      // Fetch real data from debug API, fall back to mock
      const fetchStore = async () => {
        const data = await fetchApi("/api/store");
        if (data) cb(data);
      };
      setTimeout(fetchStore, 200);
      const interval = setInterval(fetchStore, 2000);
      return () => clearInterval(interval);
    },
    onAgentStream: () => () => {},
    onApprovalRequest: () => () => {},
    onManagerStream: () => () => {},

    // Orchestrator mocks
    getOrchestratorStatus: () => Promise.resolve({ running: true, escalations: [], recentThoughts: [] }),
    getOrchestratorThoughts: () => Promise.resolve([
      { timestamp: new Date(Date.now() - 60000).toISOString(), thought: "Keeping an eye on 3 active tasks." },
      { timestamp: new Date(Date.now() - 30000).toISOString(), thought: "Everything's running smoothly." },
      { timestamp: new Date().toISOString(), thought: "New data came in. Sorting through it." },
    ]),
    onOrchestratorThought: (cb: (data: { timestamp: string; thought: string }) => void) => {
      // Emit a mock thought every 8 seconds for testing
      const thoughts = [
        "Monitoring all active work.",
        "Everything's quiet. Nothing new since last check.",
        "Something new came in. Let me take a look.",
        "Quality check passed. Good to go.",
        "Keeping tabs on the workload.",
        "Multiple streams in flight.",
        "No changes. Good — means nothing's on fire.",
      ];
      let idx = 0;
      const interval = setInterval(() => {
        cb({ timestamp: new Date().toISOString(), thought: thoughts[idx % thoughts.length] });
        idx++;
      }, 8000);
      // Emit one immediately
      setTimeout(() => cb({ timestamp: new Date().toISOString(), thought: thoughts[0] }), 500);
      return () => clearInterval(interval);
    },
    onOrchestratorEscalation: () => () => {},
  };
}
