import { describe, it, expect } from "vitest";

describe("Notification Fields for Skill Runner", () => {
  it("should define PollNotification with skill runner fields", () => {
    const notification = {
      id: "test-1",
      source: "linear" as const,
      priority: "high" as const,
      status: "new" as const,
      title: "VEC-24",
      summary: "Test",
      createdAt: new Date().toISOString(),
      sessionId: "abc-123-def",
      repoPath: "/Users/kieran/repos/monolith-django",
      branch: "kwilliams/vec-24-chat-rendering",
      workSlug: "vec-24-chat-rendering",
      projectId: "proj-perf-agent",
    };
    expect(notification.sessionId).toBe("abc-123-def");
    expect(notification.repoPath).toContain("monolith-django");
    expect(notification.branch).toContain("vec-24");
    expect(notification.workSlug).toBe("vec-24-chat-rendering");
    expect(notification.projectId).toBe("proj-perf-agent");
  });

  it("should define repoMappings in DeckConfig", () => {
    const config = {
      repoMappings: [
        { pattern: "VEC-*", repoPath: "/Users/kieran/repos/monolith-django" },
        { pattern: "#monolith-*", repoPath: "/Users/kieran/repos/monolith-django" },
      ],
    };
    expect(config.repoMappings).toHaveLength(2);
    expect(config.repoMappings[0].pattern).toBe("VEC-*");
  });
});
