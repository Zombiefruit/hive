/**
 * @vitest-environment jsdom
 */

// Mantine needs matchMedia in jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { PlanTab, hasPlanPhases } from "./PlanTab";

function renderTab(planText: string | null) {
  return render(
    <MantineProvider>
      <PlanTab planText={planText} />
    </MantineProvider>,
  );
}

describe("PlanTab", () => {
  it("shows empty state when planText is null", () => {
    renderTab(null);
    expect(screen.getByText("No plan yet.")).toBeTruthy();
  });

  it("renders raw markdown for non-phased plan text", () => {
    renderTab("## Summary\n\nThe Slack thread is about **deployment timelines**.\n\n### Key Points\n- Deploy by Friday");
    // Should NOT show empty state
    expect(screen.queryByText("No plan yet.")).toBeNull();
    // Should render the markdown content
    expect(screen.getByText(/deployment timelines/)).toBeTruthy();
  });

  it("renders PlanView for phased plan text", () => {
    const phased = `---
ticket: VEC-123
---

## Phase 1: Setup
### Task 1.1: Initial setup
- [ ] \`initial commit\`
  Set up the project`;
    renderTab(phased);
    expect(screen.queryByText("No plan yet.")).toBeNull();
    // PlanView should show the phase name
    expect(screen.getByText(/Setup/)).toBeTruthy();
  });
});

describe("hasPlanPhases", () => {
  it("returns false for null", () => {
    expect(hasPlanPhases(null)).toBe(false);
  });

  it("returns false for non-phased text", () => {
    expect(hasPlanPhases("Just a regular response about a Slack thread")).toBe(false);
  });

  it("returns true for phased plan", () => {
    expect(hasPlanPhases("## Phase 1: Setup\n### Task 1.1: Init\n- [ ] `commit`\n  desc")).toBe(true);
  });
});
