/**
 * @vitest-environment jsdom
 */

/**
 * DetailDrawer integration tests — verify user-facing CTA behavior,
 * stage transitions, skill invocations, and secondary actions.
 *
 * These tests mount the real DetailDrawer component with mocked window.deck
 * methods and assert that clicking buttons triggers the correct IPC calls.
 */

// Mantine's MantineProvider calls window.matchMedia during render.
// Must be set before any imports touch React/Mantine.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom doesn't implement Element.scrollTo
Element.prototype.scrollTo = () => {};

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { DetailDrawer } from "./DetailDrawer";

// ── Helpers ──

function makeNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-notif-1",
    source: "linear",
    title: "VEC-100 Implement retry logic",
    summary: "Add exponential backoff to pipeline ingestion",
    url: "https://linear.app/issue/VEC-100",
    links: [],
    taskType: "implementation",
    stage: "new",
    priority: "medium",
    timeline: [],
    ...overrides,
  };
}

function mockDeck() {
  return {
    openExternal: vi.fn(),
    updateNotificationById: vi.fn(),
    runSkill: vi.fn().mockResolvedValue({ success: true, sessionId: "sess-123", resultText: "---\nticket: VEC-100\nbranch: kwilliams/vec-100\nstatus: planned\n---\n\n## Scope\nAdd retry logic\n\n## Phase 1: Implementation\n### Task 1.1: Add retry\n- [ ] Add backoff\n- [ ] Add tests" }),
    prepareWorkPlan: vi.fn().mockResolvedValue({ plan: "## Plan\n1. Do the thing\n---", conversationHistory: [{ role: "assistant", content: "Here is the plan" }], fetchedContext: [] }),
    clearPlan: vi.fn(),
    getPlan: vi.fn().mockResolvedValue(null),
    getPlanningEvents: vi.fn().mockResolvedValue([]),
    isSkillRunning: vi.fn().mockResolvedValue(false),
    iteratePlan: vi.fn().mockResolvedValue({}),
    sendToSkill: vi.fn(),
    onPlanningEvent: vi.fn().mockReturnValue(() => {}),
    readPlan: vi.fn().mockResolvedValue(null),
    updateLinear: vi.fn(),
    sendSlackMessage: vi.fn(),
  };
}

function renderDrawer(
  notificationOverrides: Record<string, unknown> = {},
  configOverrides: Record<string, unknown> = {},
) {
  const deck = mockDeck();
  (window as unknown as { deck: unknown }).deck = deck;

  const onClose = vi.fn();
  const onDismiss = vi.fn();
  const onPlanReady = vi.fn();
  const onPlanCleared = vi.fn();

  const notification = makeNotification(notificationOverrides);
  const config = { repoMappings: [], name: "Test User", linearUsername: "testuser", ...configOverrides };

  render(
    <MantineProvider>
      <DetailDrawer
        notification={notification}
        onClose={onClose}
        onDismiss={onDismiss}
        onPlanReady={onPlanReady}
        onPlanCleared={onPlanCleared}
        config={config}
        notificationMap={new Map()}
        onSelectNotification={() => {}}
      />
    </MantineProvider>,
  );

  return { deck, onClose, onDismiss, onPlanReady, onPlanCleared, notification };
}

// ── Tests ──

describe("DetailDrawer integration — CTA behavior", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── "Move to Planning" CTA for agent tasks ───

  it('"Move to Planning" for implementation tasks should run /start-work skill', async () => {
    const { deck } = renderDrawer({ stage: "new", taskType: "implementation" });

    const btn = screen.getByText("Move to Planning");
    fireEvent.click(btn);

    // Should update stage to start_work
    expect(deck.updateNotificationById).toHaveBeenCalledWith(
      "test-notif-1",
      expect.objectContaining({ stage: "start_work" }),
    );

    // Should call runSkill with /start-work (the repo's skill creates structured plans)
    await waitFor(() => {
      expect(deck.runSkill).toHaveBeenCalledWith(
        expect.objectContaining({ skill: "/start-work", notificationId: "test-notif-1" }),
      );
    });

    // StartWorkModal should NOT be visible
    expect(screen.queryByText("Choose a repository")).toBeNull();
  });

  it("/start-work args include task context", async () => {
    const { deck } = renderDrawer({
      stage: "new",
      taskType: "implementation",
      title: "VEC-72 Fix auth tokens",
      summary: "Token refresh is broken in prod",
      url: "https://linear.app/mc/issue/VEC-72",
      links: [{ type: "linear", label: "VEC-72", url: "https://linear.app/mc/issue/VEC-72" }],
    });

    fireEvent.click(screen.getByText("Move to Planning"));

    await waitFor(() => {
      expect(deck.runSkill).toHaveBeenCalled();
    });

    const call = deck.runSkill.mock.calls[0]?.[0];
    expect(call.args).toContain("VEC-72 Fix auth tokens");
    expect(call.args).toContain("Token refresh is broken");
  });

  it("/start-work success should set stage to start_work and call runSkill", async () => {
    const { deck } = renderDrawer({ stage: "new", taskType: "implementation" });

    fireEvent.click(screen.getByText("Move to Planning"));

    // Stage should be set to start_work immediately
    expect(deck.updateNotificationById).toHaveBeenCalledWith(
      "test-notif-1",
      expect.objectContaining({ stage: "start_work" }),
    );

    // runSkill should be called with /start-work
    await waitFor(() => {
      expect(deck.runSkill).toHaveBeenCalledWith(
        expect.objectContaining({ skill: "/start-work" }),
      );
    });
  });

  it('"Prepare" for review tasks should call prepareWorkPlan (human track, no repo modal)', async () => {
    const { deck } = renderDrawer({ stage: "new", taskType: "review" });

    const btn = screen.getByText("Prepare");
    fireEvent.click(btn);

    // Review is on the human track, so stage goes to preparing
    expect(deck.updateNotificationById).toHaveBeenCalledWith(
      "test-notif-1",
      expect.objectContaining({ stage: "preparing" }),
    );

    await waitFor(() => {
      expect(deck.prepareWorkPlan).toHaveBeenCalled();
    });
    expect(deck.runSkill).not.toHaveBeenCalled();
  });

  // ─── "Approve & Start" CTA ───

  it('"Approve & Start" without repoPath should open repo selector modal', () => {
    // plan_review stage has CTA "Approve & Start" targeting hack
    // When no repoPath is set, the code opens StartWorkModal
    const { deck } = renderDrawer({ stage: "plan_review", taskType: "implementation" });

    const btn = screen.getByText("Approve & Start");
    fireEvent.click(btn);

    // Should NOT directly call runSkill — should open modal instead
    expect(deck.runSkill).not.toHaveBeenCalled();
  });

  it('"Approve & Start" with repoPath should call runSkill with /hack', async () => {
    const { deck } = renderDrawer({
      stage: "plan_review",
      taskType: "implementation",
      repoPath: "/Users/dev/projects/repo",
      sessionId: "sess-123",
    });

    const btn = screen.getByText("Approve & Start");
    fireEvent.click(btn);

    // Should update stage to hack
    expect(deck.updateNotificationById).toHaveBeenCalledWith(
      "test-notif-1",
      expect.objectContaining({ stage: "hack" }),
    );

    // Should call runSkill with /hack
    await waitFor(() => {
      expect(deck.runSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          skill: "/hack",
          repoPath: "/Users/dev/projects/repo",
          sessionId: "sess-123",
          notificationId: "test-notif-1",
        }),
      );
    });
  });

  // ─── "Prepare" CTA for human tasks ───

  it('"Prepare" CTA for response tasks should call prepareWorkPlan', async () => {
    const { deck } = renderDrawer({ stage: "new", taskType: "response" });

    const btn = screen.getByText("Prepare");
    fireEvent.click(btn);

    // Should update stage to preparing
    expect(deck.updateNotificationById).toHaveBeenCalledWith(
      "test-notif-1",
      expect.objectContaining({ stage: "preparing" }),
    );

    // Should call prepareWorkPlan (human task — no skill runner)
    await waitFor(() => {
      expect(deck.prepareWorkPlan).toHaveBeenCalledWith(
        expect.objectContaining({ id: "test-notif-1" }),
      );
    });

    // Should NOT call runSkill (human tasks use prepareWorkPlan)
    expect(deck.runSkill).not.toHaveBeenCalled();
  });

  it('"Prepare" CTA for meeting_prep tasks should call prepareWorkPlan', async () => {
    const { deck } = renderDrawer({ stage: "new", taskType: "meeting_prep" });

    const btn = screen.getByText("Prepare");
    fireEvent.click(btn);

    expect(deck.updateNotificationById).toHaveBeenCalledWith(
      "test-notif-1",
      expect.objectContaining({ stage: "preparing" }),
    );

    await waitFor(() => {
      expect(deck.prepareWorkPlan).toHaveBeenCalled();
    });
  });

  // ─── "Mark Done" CTA (ready → done) ───

  it('"Mark Done" for ready stage should update stage to done and run /done skill', async () => {
    const { deck } = renderDrawer({ stage: "ready", taskType: "response" });

    const btn = screen.getByText("Mark Done");
    fireEvent.click(btn);

    // done stage has skill: "/done" in STAGE_ACTIONS, so it goes through
    // the skill-based branch, NOT the plain onDismiss branch.
    expect(deck.updateNotificationById).toHaveBeenCalledWith(
      "test-notif-1",
      expect.objectContaining({ stage: "done" }),
    );

    await waitFor(() => {
      expect(deck.runSkill).toHaveBeenCalledWith(
        expect.objectContaining({ skill: "/done", notificationId: "test-notif-1" }),
      );
    });
  });
});

describe("DetailDrawer integration — secondary actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Archive button ───

  it("stage dropdown should be visible for non-terminal, non-new stages", () => {
    renderDrawer({ stage: "hack", taskType: "implementation" });
    // The dropdown trigger is a chevron button — check that Ship CTA and the action bar exist
    expect(screen.getByText("Ship")).toBeTruthy();
  });

  it("stage dropdown should only show reachable stages (hack = Re-plan + Re-hack only)", async () => {
    renderDrawer({ stage: "hack", taskType: "implementation" });
    // Find the chevron dropdown button (it's the second button in the action bar)
    const buttons = screen.getAllByRole("button");
    const chevronBtn = buttons.find(b => b.querySelector(".tabler-icon-chevron-down"));
    if (chevronBtn) fireEvent.click(chevronBtn);
    await waitFor(() => {
      expect(screen.getByText("Re-plan")).toBeTruthy();
      expect(screen.getByText("Re-hack")).toBeTruthy();
      // Re-ship and Re-review should NOT appear — task hasn't reached those stages
      expect(screen.queryByText("Re-ship")).toBeNull();
      expect(screen.queryByText("Re-review")).toBeNull();
      expect(screen.getByText("Reset to Inbox")).toBeTruthy();
      expect(screen.getByText("Archive")).toBeTruthy();
    });
  });

  it("should NOT show action bar for terminal stages", () => {
    renderDrawer({ stage: "done", taskType: "implementation" });
    expect(screen.queryByText("Ship")).toBeNull();
    expect(screen.queryByText("Re-plan")).toBeNull();
  });

  it("should NOT show secondary actions for new stage", () => {
    renderDrawer({ stage: "new", taskType: "implementation" });

    // Secondary bar condition: stage !== "new" && !isTerminalStage
    expect(screen.queryByText("Re-plan")).toBeNull();
    expect(screen.queryByText("Reset")).toBeNull();
  });
});

describe("DetailDrawer integration — human vs agent routing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("implementation task 'Move to Planning' goes through runSkill /start-work", async () => {
    const { deck } = renderDrawer({ stage: "new", taskType: "implementation" });

    fireEvent.click(screen.getByText("Move to Planning"));

    await waitFor(() => {
      expect(deck.runSkill).toHaveBeenCalledWith(
        expect.objectContaining({ skill: "/start-work" }),
      );
    });
    // prepareWorkPlan is for human tasks only
    expect(deck.prepareWorkPlan).not.toHaveBeenCalled();
  });

  it("response task 'Prepare' goes through prepareWorkPlan (human track)", async () => {
    const { deck } = renderDrawer({ stage: "new", taskType: "response" });

    fireEvent.click(screen.getByText("Prepare"));

    await waitFor(() => {
      expect(deck.prepareWorkPlan).toHaveBeenCalled();
    });
    expect(deck.runSkill).not.toHaveBeenCalled();
  });

  it("investigation task uses human track (Prepare + prepareWorkPlan)", async () => {
    const { deck } = renderDrawer({ stage: "new", taskType: "investigation" });

    fireEvent.click(screen.getByText("Prepare"));

    expect(deck.updateNotificationById).toHaveBeenCalledWith(
      "test-notif-1",
      expect.objectContaining({ stage: "preparing" }),
    );

    await waitFor(() => {
      expect(deck.prepareWorkPlan).toHaveBeenCalled();
    });
    expect(deck.runSkill).not.toHaveBeenCalled();
  });

  it("meeting_prep task uses human track (Prepare + prepareWorkPlan)", async () => {
    const { deck } = renderDrawer({ stage: "new", taskType: "meeting_prep" });

    fireEvent.click(screen.getByText("Prepare"));

    expect(deck.updateNotificationById).toHaveBeenCalledWith(
      "test-notif-1",
      expect.objectContaining({ stage: "preparing" }),
    );

    await waitFor(() => {
      expect(deck.prepareWorkPlan).toHaveBeenCalled();
    });
  });
});
