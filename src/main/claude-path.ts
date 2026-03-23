import { execSync } from "node:child_process";

let cachedPath: string | null = null;

/**
 * Resolve the path to the Claude Code executable.
 * Needed because Vite's bundling breaks import.meta.url resolution
 * in the Agent SDK, so we must provide the path explicitly.
 */
export function getClaudeCodePath(): string {
  if (cachedPath) return cachedPath;

  try {
    const result = execSync("which claude", { encoding: "utf-8" }).trim();
    if (!result) throw new Error("which claude returned empty");
    cachedPath = result;
  } catch {
    // Fallback to common locations
    const fs = require("node:fs");
    const path = require("node:path");
    const home = require("node:os").homedir();
    const candidates = [
      path.join(home, ".local/bin/claude"),
      "/usr/local/bin/claude",
      "/opt/homebrew/bin/claude",
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        cachedPath = candidate;
        return candidate;
      }
    }
    throw new Error("Could not find Claude Code executable. Is it installed?");
  }

  return cachedPath!;
}
