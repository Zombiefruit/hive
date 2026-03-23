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
    model: "claude-sonnet-4-6",
    branch: "kieran/vec-423-retry-logic",
    cwd: "/Users/kieranwilliams/Documents/GitHub/monolith-django",
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
    model: "claude-haiku-4-5-20251001",
    branch: "kieran/fix-auth-test",
    cwd: "/Users/kieranwilliams/Documents/GitHub/frontend",
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
    model: "claude-opus-4-6",
    branch: null,
    cwd: "/Users/kieranwilliams/Documents/GitHub/monolith-django",
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
    model: "claude-sonnet-4-6",
    branch: "kieran/vec-401-notif-tests",
    cwd: "/Users/kieranwilliams/Documents/GitHub/monolith-django",
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
  { id: "appr-1", agentId: "agent-1", toolName: "Bash", toolInput: JSON.stringify({ command: "git push origin kieran/vec-423-retry-logic" }), description: "Push branch to remote", riskLevel: "medium" as const, status: "pending" as const, timestamp: new Date(Date.now() - 60000).toISOString() },
  { id: "appr-2", agentId: "agent-2", toolName: "Bash", toolInput: JSON.stringify({ command: "rm -rf node_modules && pnpm install" }), description: "Clean reinstall dependencies", riskLevel: "high" as const, status: "pending" as const, timestamp: new Date(Date.now() - 30000).toISOString() },
];

const MOCK_CONTEXT_REFS = [
  { id: "ctx-1", agentId: "agent-1", type: "linear" as const, resourceId: "VEC-423", title: "VEC-423: Add retry logic to pipeline ingestion", url: "https://linear.app/monte-carlo/issue/VEC-423", detectedAt: new Date(Date.now() - 800000).toISOString() },
  { id: "ctx-2", agentId: "agent-1", type: "slack" as const, resourceId: "C0AMSV2SK4Z", title: "#team-vector", url: "https://slack.com/archives/C0AMSV2SK4Z", detectedAt: new Date(Date.now() - 700000).toISOString() },
  { id: "ctx-3", agentId: "agent-3", type: "github" as const, resourceId: "montecarlodata/monolith-django#4521", title: "PR #4521: DataLoader refactor", url: "https://github.com/montecarlodata/monolith-django/pull/4521", detectedAt: new Date(Date.now() - 3500000).toISOString() },
];

function buildMockState(): StoreState {
  return {
    agents: MOCK_AGENTS,
    messages: {
      "agent-1": [
        { id: "msg-1", agentId: "agent-1", role: "user", content: "Implement retry logic for pipeline ingestion failures. Check VEC-423 for details.", toolCallsJson: null, costUsd: null, tokenUsageJson: null, timestamp: new Date(Date.now() - 1200000).toISOString() },
        { id: "msg-2", agentId: "agent-1", role: "assistant", content: "I'll start by reading the current pipeline ingestion code to understand the failure points, then implement exponential backoff retry logic.", toolCallsJson: null, costUsd: 0.05, tokenUsageJson: null, timestamp: new Date(Date.now() - 1190000).toISOString() },
        { id: "msg-3", agentId: "agent-1", role: "tool_use", content: "Read", toolCallsJson: JSON.stringify({ name: "Read", input: { file_path: "src/pipeline/ingestion.py" } }), costUsd: null, tokenUsageJson: null, timestamp: new Date(Date.now() - 1180000).toISOString() },
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
    dismissNotification: noop,
    startWorkOnNotification: noop,
    clearNotifications: noop,
    refreshNotifications: noop,
    prepareWorkPlan: noop,
    startWorkAgent: noop,
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
  };
}
