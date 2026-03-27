/**
 * Tests for detail view routing — correct view component selected based on taskType.
 */
import { describe, it, expect } from "vitest";
import { getDetailViewType } from "../../shared/detail-view-routing";

describe("Detail View Router", () => {
  it("should route implementation tasks to ImplementationDetailView", () => {
    expect(getDetailViewType("implementation")).toBe("implementation");
  });

  it("should route investigation tasks to ImplementationDetailView", () => {
    expect(getDetailViewType("investigation")).toBe("implementation");
  });

  it("should route review tasks to ReviewDetailView", () => {
    expect(getDetailViewType("review")).toBe("review");
  });

  it("should route response tasks to ResponseDetailView", () => {
    expect(getDetailViewType("response")).toBe("response");
  });

  it("should route meeting_prep tasks to MeetingPrepDetailView", () => {
    expect(getDetailViewType("meeting_prep")).toBe("meeting_prep");
  });

  it("should default to implementation for unknown types", () => {
    expect(getDetailViewType("unknown")).toBe("implementation");
    expect(getDetailViewType(undefined)).toBe("implementation");
  });
});
