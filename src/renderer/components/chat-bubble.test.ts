import { describe, it, expect } from "vitest";
import { isQuestion } from "./ChatBubble";

describe("isQuestion", () => {
  it("should detect questions ending with ?", () => {
    expect(isQuestion("Do you have a Linear ticket?")).toBe(true);
    expect(isQuestion("What repo should I use?")).toBe(true);
  });

  it("should detect input prompts", () => {
    expect(isQuestion("share the ticket ID or doc link")).toBe(true);
    expect(isQuestion("Otherwise, describe what you want to build")).toBe(true);
  });

  it("should not flag normal statements", () => {
    expect(isQuestion("I found 3 relevant files")).toBe(false);
    expect(isQuestion("Plan complete")).toBe(false);
  });
});
