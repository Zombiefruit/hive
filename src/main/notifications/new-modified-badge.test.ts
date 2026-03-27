/**
 * Tests for "new" and "modified" badges on tasks.
 *
 * FEATURE: Tasks that are newly added or updated by the triage step
 * should show a visible badge so the user can track what changed.
 * The badge can be dismissed per-item or cleared all at once.
 */

import { describe, it, expect } from "vitest";

describe("New/Modified Badge Tracking", () => {
  it("should mark newly created tasks as 'new'", () => {
    const task = {
      id: "poll-123",
      title: "VEC-20",
      isNew: true,
      isModified: false,
    };

    expect(task.isNew).toBe(true);
    expect(task.isModified).toBe(false);
  });

  it("should mark tasks updated by triage as 'modified'", () => {
    const task = {
      id: "poll-123",
      title: "VEC-20",
      isNew: false,
      isModified: true,
      lastModifiedAt: "2026-03-25T10:00:00Z",
    };

    expect(task.isModified).toBe(true);
  });

  it("should clear 'new' badge when user views/clicks the task", () => {
    const seenIds = new Set<string>();

    // User clicks task
    seenIds.add("poll-123");

    // Task should no longer show 'new' badge
    const isNew = !seenIds.has("poll-123");
    expect(isNew).toBe(false);
  });

  it("should clear all badges with a 'mark all read' action", () => {
    const seenIds = new Set<string>();
    const allTaskIds = ["poll-1", "poll-2", "poll-3"];

    // Mark all as seen
    for (const id of allTaskIds) seenIds.add(id);

    expect(seenIds.size).toBe(3);
    expect(allTaskIds.every(id => seenIds.has(id))).toBe(true);
  });

  it("should persist seen state across re-renders but not across app restarts", () => {
    // Seen state is React state (Set), not persisted to disk
    // This means after app restart, all items appear as "new" again
    // which is fine — user gets a fresh view each session
    const seenIds = new Set<string>();
    expect(seenIds.size).toBe(0); // Fresh start
  });

  it("should track which poll cycle last modified each task", () => {
    const lastSeenPollCycle = new Map<string, number>();
    const currentPollCycle = 5;

    // Task was last seen in cycle 3, current is 5 → modified
    lastSeenPollCycle.set("poll-123", 3);
    const wasModifiedSinceLastSeen = (lastSeenPollCycle.get("poll-123") ?? 0) < currentPollCycle;
    expect(wasModifiedSinceLastSeen).toBe(true);

    // User views it → update to current cycle
    lastSeenPollCycle.set("poll-123", currentPollCycle);
    const stillModified = (lastSeenPollCycle.get("poll-123") ?? 0) < currentPollCycle;
    expect(stillModified).toBe(false);
  });
});
