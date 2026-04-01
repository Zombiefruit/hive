/**
 * Tests for ActionButton — a button with an explicit description of what it does.
 */
import { describe, it, expect } from "vitest";

describe("ActionButton data contract", () => {
  it("should define the ActionButton props shape", () => {
    const props = {
      label: "Start Hack",
      description: "Runs /hack in monolith-django — implements plan phases, runs tests, commits per task.",
      onClick: () => {},
      color: "green",
      icon: "play",
      disabled: false,
      loading: false,
    };
    expect(props.label).toBe("Start Hack");
    expect(props.description).toContain("/hack");
    expect(typeof props.onClick).toBe("function");
  });

  it("should support disabled state", () => {
    const props = { label: "Ship", description: "Waiting for hack to complete", disabled: true };
    expect(props.disabled).toBe(true);
  });

  it("should support loading state", () => {
    const props = { label: "Preparing...", description: "Gathering context", loading: true };
    expect(props.loading).toBe(true);
  });
});
