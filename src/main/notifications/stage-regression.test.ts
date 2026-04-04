import { describe, it, expect } from "vitest";
import { STAGE_ORDER } from "../../shared/task-utils";

describe("Stage regression guard", () => {
  it("STAGE_ORDER has correct ordering for regression detection", () => {
    // Critical: hack must be higher than start_work
    expect(STAGE_ORDER["hack"]).toBeGreaterThan(STAGE_ORDER["start_work"]);
    expect(STAGE_ORDER["start_work"]).toBeGreaterThan(STAGE_ORDER["new"]);
    expect(STAGE_ORDER["plan_review"]).toBeGreaterThan(STAGE_ORDER["start_work"]);
    expect(STAGE_ORDER["ship"]).toBeGreaterThan(STAGE_ORDER["hack"]);
    expect(STAGE_ORDER["code_review"]).toBeGreaterThan(STAGE_ORDER["ship"]);
    expect(STAGE_ORDER["done"]).toBeGreaterThan(STAGE_ORDER["code_review"]);
  });

  it("done/backlog/skipped are always valid targets regardless of order", () => {
    // These should always be allowed even if order is lower
    // (tested conceptually — the actual guard is in poll-service.ts)
    expect(STAGE_ORDER["done"]).toBeGreaterThan(STAGE_ORDER["hack"]);
    // backlog is lower but should be allowed — the guard checks explicitly
    expect(STAGE_ORDER["backlog"]).toBeLessThan(STAGE_ORDER["hack"]);
  });
});
