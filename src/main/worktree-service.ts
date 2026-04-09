/**
 * Worktree Service — list git worktrees, find worktree for a task, open in editor.
 */

import { execSync, execFile } from "node:child_process";
import fs from "node:fs";
import type { WorktreeInfo, EditorCommand } from "../shared/worktree-types";

/** List all git worktrees for a repo, with status info. */
export function listWorktrees(repoPath: string): WorktreeInfo[] {
  try {
    const raw = execSync("git worktree list --porcelain", {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: 10000,
    });

    const entries: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of raw.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) entries.push(finalizeEntry(current, repoPath));
        current = { path: line.slice("worktree ".length).trim() };
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice("HEAD ".length).trim();
      } else if (line.startsWith("branch ")) {
        // branch refs/heads/foo → foo
        current.branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
      } else if (line === "bare") {
        current.isMainWorktree = true;
      } else if (line === "") {
        // blank line separates entries
        if (current.path) {
          entries.push(finalizeEntry(current, repoPath));
          current = {};
        }
      }
    }
    // Handle trailing entry without final blank line
    if (current.path) entries.push(finalizeEntry(current, repoPath));

    return entries;
  } catch {
    return [];
  }
}

function finalizeEntry(partial: Partial<WorktreeInfo>, repoPath: string): WorktreeInfo {
  const wtPath = partial.path ?? "";
  let modifiedFiles = 0;
  let untrackedFiles = 0;
  let headShort = (partial.head ?? "").slice(0, 7);
  let headMessage = "";

  try {
    const status = execSync("git status --porcelain", {
      cwd: wtPath,
      encoding: "utf-8",
      timeout: 5000,
    });
    for (const line of status.split("\n")) {
      if (!line.trim()) continue;
      if (line.startsWith("??")) {
        untrackedFiles++;
      } else {
        modifiedFiles++;
      }
    }
  } catch {
    // ignore — worktree may be in a bad state
  }

  try {
    const logLine = execSync('git log -1 --format="%h %s"', {
      cwd: wtPath,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    const spaceIdx = logLine.indexOf(" ");
    if (spaceIdx > 0) {
      headShort = logLine.slice(0, spaceIdx);
      headMessage = logLine.slice(spaceIdx + 1);
    }
  } catch {
    // ignore
  }

  // Determine if this is the main worktree (first entry, or same as repoPath)
  const isMain = partial.isMainWorktree ?? (wtPath === repoPath);

  return {
    path: wtPath,
    branch: partial.branch ?? "(detached)",
    head: headShort,
    headMessage,
    isMainWorktree: isMain,
    modifiedFiles,
    untrackedFiles,
    repoPath,
  };
}

/** Find the worktree for a specific task by matching branch name. */
export function getWorktreeForTask(data: { repoPath?: string; branch?: string }): WorktreeInfo | null {
  if (!data.repoPath || !data.branch) return null;
  const worktrees = listWorktrees(data.repoPath);
  return worktrees.find(wt => wt.branch === data.branch) ?? null;
}

/** Open a worktree directory in the user's editor. */
export function openInEditor(worktreePath: string, editor: EditorCommand, customCmd?: string): void {
  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Worktree path does not exist: ${worktreePath}`);
  }

  let bin: string;
  switch (editor) {
    case "code":
      bin = "code";
      break;
    case "cursor":
      bin = "cursor";
      break;
    case "zed":
      bin = "zed";
      break;
    case "custom":
      if (!customCmd) throw new Error("Custom editor command not configured");
      bin = customCmd;
      break;
    default:
      bin = "code";
  }

  // Fire-and-forget — don't block on editor launch.
  // Use execFile (no shell) to avoid command injection via worktreePath or customCmd.
  execFile(bin, [worktreePath], (err) => {
    if (err) console.error(`[worktree-service] Failed to open editor: ${err.message}`);
  });
}
