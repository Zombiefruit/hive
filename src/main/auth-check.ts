import { execFile } from "node:child_process";
import { getClaudeCodePath } from "./claude-path";

export interface AuthStatus {
  installed: boolean;
  version: string | null;
  authenticated: boolean;
}

function execPromise(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      { timeout: timeoutMs, encoding: "utf-8" },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
        }
      }
    );
    // Ensure cleanup on timeout
    void child;
  });
}

export async function checkClaudeAuth(): Promise<AuthStatus> {
  let claudePath: string;
  try {
    claudePath = getClaudeCodePath();
  } catch {
    return { installed: false, version: null, authenticated: false };
  }

  // Check version
  let version: string | null = null;
  try {
    const { stdout } = await execPromise(claudePath, ["--version"], 5000);
    version = stdout.trim() || null;
  } catch {
    return { installed: false, version: null, authenticated: false };
  }

  // Verify authentication by running a minimal prompt
  let authenticated = false;
  try {
    const { stdout } = await execPromise(
      claudePath,
      ["-p", "hello", "--output-format", "json", "--max-turns", "1", "--model", "claude-haiku-4-5-20251001"],
      15000
    );
    // If we got valid JSON back and exit 0, auth works
    const parsed = JSON.parse(stdout);
    authenticated = parsed != null;
  } catch {
    authenticated = false;
  }

  return { installed: true, version, authenticated };
}
