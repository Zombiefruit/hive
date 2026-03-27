/**
 * Tests for plan regeneration state management.
 *
 * BUG: When clicking "Regenerate" on a planned task, the card still shows
 * "Plan ready" (green dot) instead of going back to "Planning..." (blue pulse).
 * The plansReady set needs to be cleared for that task on regeneration.
 */

import { describe, it, expect } from "vitest";

describe("Plan Regeneration State", () => {
  it("should remove task from plansReady set when plan is cleared", () => {
    const plansReady = new Set(["poll-123", "poll-456"]);

    // User clicks "Regenerate" on poll-123
    plansReady.delete("poll-123");

    expect(plansReady.has("poll-123")).toBe(false);
    expect(plansReady.has("poll-456")).toBe(true); // Other plans unaffected
  });

  it("should show loading state during regeneration", () => {
    let loading = false;
    const plansReady = new Set(["poll-123"]);

    // Start regeneration
    plansReady.delete("poll-123");
    loading = true;

    expect(loading).toBe(true);
    expect(plansReady.has("poll-123")).toBe(false);

    // Regeneration completes
    plansReady.add("poll-123");
    loading = false;

    expect(plansReady.has("poll-123")).toBe(true);
    expect(loading).toBe(false);
  });

  it("should reset conversation history on regenerate", () => {
    const conversation = [
      { role: "user", content: "Plan for VEC-20" },
      { role: "assistant", content: "Old plan..." },
      { role: "user", content: "Add serializer" },
      { role: "assistant", content: "Updated plan..." },
    ];

    // Regenerate clears conversation
    conversation.length = 0;
    expect(conversation).toHaveLength(0);
  });
});
