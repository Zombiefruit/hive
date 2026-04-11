/**
 * Tests for WorkTab — git diff display and worktree info.
 */
import { describe, it, expect } from "vitest";

describe("WorkTab diff parsing", () => {
  it("should parse diff stat output into file objects", () => {
    // Simulates the git diff --numstat output parsing
    const diffStatRaw = "10\t2\tsrc/main/index.ts\n5\t0\tsrc/renderer/App.tsx\n0\t15\tsrc/old-file.ts";
    const files = diffStatRaw.trim().split("\n").filter(Boolean).map(line => {
      const [add, del, ...pathParts] = line.split("\t");
      return { path: pathParts.join("\t"), additions: parseInt(add) || 0, deletions: parseInt(del) || 0 };
    });
    expect(files).toHaveLength(3);
    expect(files[0]).toEqual({ path: "src/main/index.ts", additions: 10, deletions: 2 });
    expect(files[1]).toEqual({ path: "src/renderer/App.tsx", additions: 5, deletions: 0 });
    expect(files[2]).toEqual({ path: "src/old-file.ts", additions: 0, deletions: 15 });
  });

  it("should calculate totals correctly", () => {
    const files = [
      { path: "a.ts", additions: 10, deletions: 2 },
      { path: "b.ts", additions: 5, deletions: 8 },
    ];
    const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
    const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);
    expect(totalAdditions).toBe(15);
    expect(totalDeletions).toBe(10);
  });

  it("should handle empty diff", () => {
    const diffStatRaw = "";
    const files = diffStatRaw.trim().split("\n").filter(Boolean);
    expect(files).toHaveLength(0);
  });

  it("should handle file paths with tabs", () => {
    // Renamed files show as: additions\tdeletions\told\tnew
    const line = "10\t5\tsrc/old.ts\tsrc/new.ts";
    const [add, del, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");
    expect(filePath).toBe("src/old.ts\tsrc/new.ts");
    expect(parseInt(add)).toBe(10);
    expect(parseInt(del)).toBe(5);
  });
});
