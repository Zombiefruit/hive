import { describe, it, expect } from "vitest";
import { detectRepo, type RepoMapping } from "./repo-detection";

const MAPPINGS: RepoMapping[] = [
  { pattern: "VEC-*", repoPath: "/Users/kieran/repos/monolith-django" },
  { pattern: "DX-*", repoPath: "/Users/kieran/repos/claude-skills" },
  { pattern: "#monolith-*", repoPath: "/Users/kieran/repos/monolith-django" },
  {
    pattern: "monte-carlo-data/monolith-*",
    repoPath: "/Users/kieran/repos/monolith-django",
  },
];

describe("Repo Detection", () => {
  it("should detect repo from Linear ticket prefix", () => {
    const repo = detectRepo(
      { title: "VEC-24: Fix chat", links: [] },
      MAPPINGS,
    );
    expect(repo).toBe("/Users/kieran/repos/monolith-django");
  });

  it("should detect repo from DX ticket prefix", () => {
    const repo = detectRepo(
      { title: "DX-100: Add skill", links: [] },
      MAPPINGS,
    );
    expect(repo).toBe("/Users/kieran/repos/claude-skills");
  });

  it("should detect repo from GitHub PR URL", () => {
    const repo = detectRepo(
      {
        title: "Review PR",
        links: [
          {
            type: "github_pr",
            label: "PR #42",
            url: "https://github.com/monte-carlo-data/monolith-django/pull/42",
          },
        ],
      },
      MAPPINGS,
    );
    expect(repo).toBe("/Users/kieran/repos/monolith-django");
  });

  it("should detect repo from Slack channel name", () => {
    const repo = detectRepo(
      {
        title: "Check thread",
        links: [
          {
            type: "slack_channel",
            label: "#monolith-prs",
            url: "https://slack.com/archives/C123",
          },
        ],
      },
      MAPPINGS,
    );
    expect(repo).toBe("/Users/kieran/repos/monolith-django");
  });

  it("should return null when no mapping matches", () => {
    const repo = detectRepo({ title: "Random task", links: [] }, MAPPINGS);
    expect(repo).toBeNull();
  });

  it("should return null with empty mappings", () => {
    const repo = detectRepo({ title: "VEC-24: Fix chat", links: [] }, []);
    expect(repo).toBeNull();
  });
});
