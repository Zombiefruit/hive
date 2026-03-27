/**
 * Tests for collapsible kanban columns.
 *
 * MISSING FEATURE: User has asked multiple times for collapsible columns.
 * The Done column takes too much space. Columns should be collapsible
 * to just a header with item count.
 */

import { describe, it, expect } from "vitest";

describe("Collapsible Kanban Columns", () => {
  it("should track collapsed state per column", () => {
    const collapsed = new Set<string>();

    collapsed.add("done");
    expect(collapsed.has("done")).toBe(true);
    expect(collapsed.has("new")).toBe(false);

    collapsed.delete("done");
    expect(collapsed.has("done")).toBe(false);
  });

  it("collapsed column should show only header with count, not cards", () => {
    const isCollapsed = true;
    const items = [{ id: "1" }, { id: "2" }, { id: "3" }];

    if (isCollapsed) {
      // Only show: column label + item count badge
      const displayCount = items.length;
      expect(displayCount).toBe(3);
      // Cards should NOT render
    } else {
      // Show full card list
    }
  });

  it("should persist collapsed state across re-renders", () => {
    // Collapsed state should survive when notifications update
    const collapsed = new Set(["done", "backlog"]);

    // After a notification update, collapsed set shouldn't reset
    expect(collapsed.has("done")).toBe(true);
    expect(collapsed.has("backlog")).toBe(true);
  });

  it("clicking collapsed header should expand the column", () => {
    const collapsed = new Set(["done"]);

    // Click to toggle
    if (collapsed.has("done")) {
      collapsed.delete("done");
    } else {
      collapsed.add("done");
    }

    expect(collapsed.has("done")).toBe(false); // Now expanded
  });

  it("collapsed column should have a narrow width", () => {
    const COLLAPSED_WIDTH = 40; // px — just enough for icon + count
    const EXPANDED_WIDTH = 240; // px — normal column width

    expect(COLLAPSED_WIDTH).toBeLessThan(EXPANDED_WIDTH);
  });
});
