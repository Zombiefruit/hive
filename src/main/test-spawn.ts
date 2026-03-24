/**
 * Diagnostic: test spawning Claude Code from Electron main process.
 * Called via IPC from the renderer to debug the parallel spawn issue.
 */
import { spawn } from "node:child_process";
import { app } from "electron";
import os from "node:os";
import { getClaudeCodePath } from "./claude-path";

export async function testSpawn(): Promise<string> {
  const claudePath = getClaudeCodePath();
  const cwd = app.isPackaged ? os.homedir() : app.getAppPath();
  const log: string[] = [];

  log.push(`Claude path: ${claudePath}`);
  log.push(`CWD: ${cwd}`);
  log.push(`Starting spawn...`);

  return new Promise((resolve) => {
    const proc = spawn(claudePath, [
      "--output-format", "stream-json",
      "--verbose",
      "--input-format", "stream-json",
      "--no-chrome",
      "--model", "claude-haiku-4-5-20251001",
      "--no-session-persistence",
      "--disallowedTools", "Write,Edit,Bash,NotebookEdit,Agent",
      "--system-prompt", "Say hello.",
    ], {
      cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    log.push(`Spawned PID: ${proc.pid}`);
    let bytes = 0;
    let lines = 0;
    let firstLine = "";
    let hasInit = false;

    proc.stdout?.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      const text = chunk.toString("utf-8");
      const newLines = text.split("\n").filter(l => l.trim());
      lines += newLines.length;
      if (!firstLine && newLines.length > 0) firstLine = newLines[0].slice(0, 200);

      // Check for init
      for (const line of newLines) {
        try {
          const msg = JSON.parse(line);
          if (msg.type === "system" && msg.subtype === "init") {
            hasInit = true;
            const mcpCount = ((msg.tools ?? []) as string[]).filter((t: string) => t.includes("mcp__claude_ai")).length;
            log.push(`INIT received: ${(msg.tools ?? []).length} tools, ${mcpCount} MCP`);
          }
        } catch {}
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      log.push(`STDERR: ${chunk.toString("utf-8").trim().slice(0, 100)}`);
    });

    proc.on("error", (err) => {
      log.push(`ERROR event: ${err.message}`);
    });

    proc.on("exit", (code, signal) => {
      log.push(`EXIT: code=${code}, signal=${signal}, bytes=${bytes}, lines=${lines}, hasInit=${hasInit}`);
      if (firstLine) log.push(`First line: ${firstLine}`);
    });

    // After 30s, report and kill
    setTimeout(() => {
      log.push(`--- 30s report ---`);
      log.push(`Alive: ${!proc.killed}`);
      log.push(`Bytes received: ${bytes}`);
      log.push(`Lines received: ${lines}`);
      log.push(`Has init: ${hasInit}`);
      if (firstLine) log.push(`First line: ${firstLine}`);

      proc.kill();
      resolve(log.join("\n"));
    }, 30000);
  });
}
