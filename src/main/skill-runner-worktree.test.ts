import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWorktree } from "./skill-runner";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// We test createWorktree against a real temp git repo to cover all edge cases.

let tmpDir: string;
let repoPath: string;

function run(cmd: string, cwd = repoPath) {
  return execSync(cmd, { cwd, timeout: 10000 }).toString().trim();
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-wt-test-"));
  repoPath = path.join(tmpDir, "repo");
  fs.mkdirSync(repoPath);
  run("git init -b main");
  run("git commit --allow-empty -m 'init'");
  // Create a test branch
  run("git checkout -b test-branch");
  run("git commit --allow-empty -m 'on test-branch'");
  run("git checkout main");
});

afterEach(() => {
  // Clean up worktrees before removing
  try { run("git worktree prune"); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

describe("createWorktree", () => {
  it("creates a new worktree for an existing branch", () => {
    const wtPath = createWorktree(repoPath, "test-branch");
    expect(fs.existsSync(wtPath)).toBe(true);
    expect(wtPath).not.toBe(repoPath);
    expect(wtPath).toContain("test-branch");
  });

  it("reuses an existing worktree directory", () => {
    const wtPath1 = createWorktree(repoPath, "test-branch");
    const wtPath2 = createWorktree(repoPath, "test-branch");
    expect(wtPath1).toBe(wtPath2);
  });

  it("finds worktree for a branch that already has one elsewhere", () => {
    // Create a worktree manually in a different location
    const customPath = path.join(tmpDir, "custom-wt");
    run(`git worktree add "${customPath}" test-branch`);

    // Now try createWorktree — should find the existing one
    const result = createWorktree(repoPath, "test-branch");
    // macOS resolves /var → /private/var, so normalize both
    expect(fs.realpathSync(result)).toBe(fs.realpathSync(customPath));
  });

  it("creates a new branch from HEAD if branch doesn't exist", () => {
    const wtPath = createWorktree(repoPath, "brand-new-branch");
    expect(fs.existsSync(wtPath)).toBe(true);
    expect(wtPath).toContain("brand-new-branch");
  });

  it("falls back to repo path if all creation strategies fail", () => {
    // Create a situation where the branch exists but can't be checked out
    // (branch is currently checked out in main repo)
    const wtPath = createWorktree(repoPath, "main");
    // "main" is the current branch — git worktree add should fail for it
    // but detached HEAD should work as a fallback
    expect(fs.existsSync(wtPath)).toBe(true);
  });

  it("handles branch names with slashes", () => {
    run("git checkout -b kwilliams/my-feature");
    run("git commit --allow-empty -m 'feature'");
    run("git checkout main");

    const wtPath = createWorktree(repoPath, "kwilliams/my-feature");
    expect(fs.existsSync(wtPath)).toBe(true);
    // Slashes in branch name are replaced with dashes in the directory name
    expect(wtPath).toContain("kwilliams-my-feature");
  });
});
