import { describe, it, expect } from "vitest";
import { buildSkillArgs, buildSkillEnv, extractSessionId, type SkillInvocation, type SkillResult } from "./skill-runner";

describe("Skill Runner — buildSkillArgs", () => {
  it("should build args without --resume on first invocation", () => {
    const args = buildSkillArgs(null);
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--input-format");
    expect(args).toContain("--verbose");
    expect(args).toContain("--no-chrome");
    expect(args).not.toContain("--resume");
  });

  it("should include --resume when sessionId is provided", () => {
    const args = buildSkillArgs("session-abc-123");
    expect(args).toContain("--resume");
    expect(args).toContain("session-abc-123");
  });

  it("should not include --no-session-persistence", () => {
    const args = buildSkillArgs(null);
    expect(args).not.toContain("--no-session-persistence");
  });
});

describe("Skill Runner — buildSkillEnv", () => {
  it("should set CLAUDE_HIVE=1", () => {
    const env = buildSkillEnv();
    expect(env.CLAUDE_HIVE).toBe("1");
  });

  it("should preserve existing env vars", () => {
    const env = buildSkillEnv();
    expect(env.PATH).toBeDefined();
  });
});

describe("Skill Runner — extractSessionId", () => {
  it("should extract session_id from init message", () => {
    const msg = { type: "system", subtype: "init", session_id: "sess-abc-123", tools: [] };
    expect(extractSessionId(msg)).toBe("sess-abc-123");
  });

  it("should return null for non-init messages", () => {
    const msg = { type: "assistant", message: { content: [] } };
    expect(extractSessionId(msg)).toBeNull();
  });

  it("should return null when session_id is missing", () => {
    const msg = { type: "system", subtype: "init", tools: [] };
    expect(extractSessionId(msg)).toBeNull();
  });
});

describe("Skill Runner — SkillInvocation type", () => {
  it("should define correct invocation shape", () => {
    const invocation: SkillInvocation = {
      skill: "/start-work",
      args: "VEC-24",
      repoPath: "/Users/kieran/repos/monolith-django",
      sessionId: null,
      notificationId: "poll-123-abc",
      timeoutMs: 300000,
    };
    expect(invocation.skill).toBe("/start-work");
    expect(invocation.sessionId).toBeNull();
  });
});

describe("Skill Runner — SkillResult type", () => {
  it("should define correct result shape", () => {
    const result: SkillResult = {
      success: true,
      sessionId: "sess-abc-123",
      events: [{ type: "init", content: "ready", timestamp: new Date().toISOString() }],
      resultText: "Plan created",
      error: null,
    };
    expect(result.success).toBe(true);
    expect(result.sessionId).toBe("sess-abc-123");
  });
});
