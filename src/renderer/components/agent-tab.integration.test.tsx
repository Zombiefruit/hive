/**
 * @vitest-environment jsdom
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

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { AgentTab } from "./AgentTab";

const noop = () => {};
const defaultHandlers = {
  onRunSkill: noop,
  onUpdateLinear: noop,
  onSendSlack: noop,
  onSendEmail: noop,
  onOpenUrl: noop,
  onDismiss: noop,
  onSnooze: noop,
};

function renderTab(props: Partial<Parameters<typeof AgentTab>[0]> = {}) {
  return render(
    <MantineProvider>
      <AgentTab
        notificationId="test-1"
        stage="new"
        conversation={[]}
        activity={[]}
        loading={false}
        skillRunning={false}
        onSendMessage={noop}
        actionHandlers={defaultHandlers}
        {...props}
      />
    </MantineProvider>,
  );
}

describe("AgentTab integration", () => {
  it("shows 'Move to Planning' when stage is new and no conversation", () => {
    renderTab({ stage: "new" });
    expect(screen.getByText(/Move to Planning/i)).toBeTruthy();
  });

  it("shows 'Planning...' when stage is start_work and loading", () => {
    renderTab({ stage: "start_work", loading: true });
    expect(screen.getByText(/Planning/i)).toBeTruthy();
  });

  it("shows 'Gathering context...' when stage is preparing and loading", () => {
    renderTab({ stage: "preparing", loading: true });
    expect(screen.getByText(/Gathering context/i)).toBeTruthy();
  });

  it("does NOT show 'Move to Planning' when stage is start_work", () => {
    renderTab({ stage: "start_work", loading: false, activity: [{ type: "init", content: "Ready", timestamp: "" }] });
    expect(screen.queryByText(/Move to Planning/)).toBeNull();
  });

  it("renders assistant messages with Markdown", () => {
    renderTab({
      stage: "ready",
      conversation: [{ role: "assistant", content: "**Bold text** here" }],
    });
    // Markdown should render the bold tag
    const bold = document.querySelector("strong");
    expect(bold).toBeTruthy();
  });

  it("shows Mark Done for no_action when stage is ready", () => {
    renderTab({
      stage: "ready",
      conversation: [{
        role: "assistant",
        content: "Already responded.\n\n```actions\n[{\"type\":\"no_action\",\"label\":\"Already responded\"}]\n```",
      }],
    });
    expect(screen.getByRole("button", { name: "Mark Done" })).toBeTruthy();
  });

  it("does NOT show Mark Done when stage is done", () => {
    renderTab({
      stage: "done",
      conversation: [{
        role: "assistant",
        content: "Done.\n\n```actions\n[{\"type\":\"no_action\",\"label\":\"Complete\"}]\n```",
      }],
    });
    expect(screen.queryByText("Mark Done")).toBeNull();
  });

  it("shows Thinking indicator when loading with conversation", () => {
    renderTab({
      stage: "start_work",
      loading: true,
      conversation: [{ role: "user", content: "Hello" }],
    });
    expect(screen.getByText("Thinking...")).toBeTruthy();
  });
});
