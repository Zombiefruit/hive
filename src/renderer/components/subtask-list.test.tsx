/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { SubtaskList } from "./SubtaskList";
import { STAGE_META } from "../../shared/ui-constants";

// Mocks required for Mantine in jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;

function renderList(props: Partial<Parameters<typeof SubtaskList>[0]> = {}) {
  const defaultSubtasks = [
    { id: "sub-1", title: "Implement API endpoint", stage: "hack" },
    { id: "sub-2", title: "Write tests for parser", stage: "done" },
    { id: "sub-3", title: "Update documentation", stage: "new" },
  ];
  return render(
    <MantineProvider>
      <SubtaskList
        subtasks={defaultSubtasks}
        onSelect={vi.fn()}
        {...props}
      />
    </MantineProvider>,
  );
}

describe("SubtaskList", () => {
  it("renders correct number of subtask rows", () => {
    renderList();
    expect(screen.getByText("Implement API endpoint")).toBeTruthy();
    expect(screen.getByText("Write tests for parser")).toBeTruthy();
    expect(screen.getByText("Update documentation")).toBeTruthy();
  });

  it("shows 'X of Y done' progress text", () => {
    renderList();
    // 1 of 3 subtasks is "done"
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
  });

  it("shows '0 of N done' when nothing is done", () => {
    renderList({
      subtasks: [
        { id: "a", title: "Task A", stage: "new" },
        { id: "b", title: "Task B", stage: "hack" },
      ],
    });
    expect(screen.getByText("0 of 2 done")).toBeTruthy();
  });

  it("shows 'N of N done' when all are done", () => {
    renderList({
      subtasks: [
        { id: "a", title: "Task A", stage: "done" },
        { id: "b", title: "Task B", stage: "done" },
      ],
    });
    expect(screen.getByText("2 of 2 done")).toBeTruthy();
  });

  it("clicking a row calls onSelect with the subtask id", () => {
    const onSelect = vi.fn();
    renderList({ onSelect });
    fireEvent.click(screen.getByText("Implement API endpoint"));
    expect(onSelect).toHaveBeenCalledWith("sub-1");
  });

  it("stage dots use correct colors from STAGE_META", () => {
    // Helper to convert hex (#rrggbb) to rgb(r, g, b)
    function hexToRgb(hex: string): string {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgb(${r}, ${g}, ${b})`;
    }

    const { container } = renderList({
      subtasks: [
        { id: "a", title: "Hacking task", stage: "hack" },
        { id: "b", title: "Done task", stage: "done" },
      ],
    });
    const dots = container.querySelectorAll("[data-testid='stage-dot']");
    expect(dots).toHaveLength(2);
    // STAGE_META colors are CSS variables — compare directly
    expect((dots[0] as HTMLElement).style.backgroundColor).toBe(STAGE_META.hack.color);
    expect((dots[1] as HTMLElement).style.backgroundColor).toBe(STAGE_META.done.color);
  });

  it("renders progress bar", () => {
    const { container } = renderList();
    const bar = container.querySelector("[data-testid='subtask-progress-bar']");
    expect(bar).toBeTruthy();
  });

  it("renders empty state when no subtasks", () => {
    renderList({ subtasks: [] });
    expect(screen.getByText("No subtasks")).toBeTruthy();
  });
});
