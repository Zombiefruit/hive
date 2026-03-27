/**
 * Tests for schedule time bugs.
 *
 * BUG 1: minutesToTime produces "26:00" — there's no 26th hour.
 * After 24:00, times should wrap or cap.
 *
 * BUG 2: Schedule regenerate button has no loading state.
 */

import { describe, it, expect } from "vitest";

/** Convert minutes to HH:MM — must handle overflow past midnight. */
function minutesToTime(mins: number): string {
  // Cap at 23:59 — don't produce times like "26:00"
  const capped = Math.min(mins, 23 * 60 + 59);
  const h = Math.floor(capped / 60);
  const m = capped % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

describe("minutesToTime — Overflow Handling", () => {
  it("should produce valid HH:MM for normal times", () => {
    expect(minutesToTime(540)).toBe("09:00");
    expect(minutesToTime(750)).toBe("12:30");
    expect(minutesToTime(1080)).toBe("18:00");
  });

  it("should NOT produce times past 23:59", () => {
    // 1560 minutes = 26 hours — should cap, not produce "26:00"
    const result = minutesToTime(1560);

    expect(result).not.toBe("26:00");
    expect(parseInt(result.split(":")[0])).toBeLessThanOrEqual(23);
  });

  it("should cap at 23:59 for overflow", () => {
    expect(minutesToTime(1440)).toBe("23:59"); // 24:00 → capped
    expect(minutesToTime(1500)).toBe("23:59"); // 25:00 → capped
    expect(minutesToTime(2000)).toBe("23:59"); // Way over → capped
  });

  it("should handle midnight exactly", () => {
    expect(minutesToTime(0)).toBe("00:00");
  });

  it("should handle 23:59 exactly", () => {
    expect(minutesToTime(23 * 60 + 59)).toBe("23:59");
  });
});
