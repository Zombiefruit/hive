/**
 * Skill Runner — spawns Claude Code processes to execute MC engineering skills.
 *
 * Unlike the MCP bridge (read-only, stateless), the skill runner:
 * - Runs skills like /start-work, /hack, /ship, /code-review
 * - Preserves sessions (no --no-session-persistence) for multi-turn work
 * - Supports --resume to continue existing sessions
 * - Sets CLAUDE_HIVE=1 so skills know they're running under orchestration
 * - Streams PlanningEvents for real-time UI updates
 */

import { spawn, ChildProcess } from "node:child_process";
import { getClaudeCodePath } from "./claude-path";
import { trackProcess, untrackProcess } from "./process-monitor";
import { type PlanningEvent } from "./mcp-bridge";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

const LOG_PATH = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "claude-deck",
  "skill-runner.log",
);

function log(msg: string): void {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

// ── Types ──

export interface SkillInvocation {
  skill: string;
  args: string;
  repoPath: string;
  sessionId: string | null;
  notificationId: string;
  timeoutMs?: number;
}

export interface SkillResult {
  success: boolean;
  sessionId: string | null;
  events: PlanningEvent[];
  resultText: string;
  error: string | null;
}

// ── Pure helpers (easily testable) ──

/**
 * Build CLI args for Claude Code.
 * Includes stream-json I/O, verbose, no-chrome.
 * Adds --resume <sessionId> when continuing an existing session.
 * Does NOT include --no-session-persistence — skills need persistent sessions.
 */
export function buildSkillArgs(sessionId: string | null): string[] {
  const args = [
    "--output-format",
    "stream-json",
    "--input-format",
    "stream-json",
    "--verbose",
    "--no-chrome",
    // Auto-approve all tools — skills run non-interactively under CLAUDE_HIVE
    "--allowedTools",
    "*",
  ];

  if (sessionId) {
    args.push("--resume", sessionId);
  }

  return args;
}

/**
 * Build environment variables for skill processes.
 * Sets CLAUDE_HIVE=1 so skills know they're running under orchestration.
 */
export function buildSkillEnv(): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    CLAUDE_HIVE: "1",
  };
}

/**
 * Extract session_id from a Claude Code init message.
 * Returns null if the message is not an init message or session_id is absent.
 */
export function extractSessionId(msg: Record<string, unknown>): string | null {
  if (msg.type === "system" && msg.subtype === "init" && typeof msg.session_id === "string") {
    return msg.session_id;
  }
  return null;
}

// ── Required skills check ──

const REQUIRED_SKILLS = ["start-work", "hack", "ship", "code-review"];

/**
 * Check that required MC engineering skills are installed.
 * Looks for ~/.claude/skills/{name}/SKILL.md for each required skill.
 */
export function checkRequiredSkills(): { installed: boolean; missing: string[] } {
  const skillsDir = path.join(os.homedir(), ".claude", "skills");
  const missing: string[] = [];

  for (const skill of REQUIRED_SKILLS) {
    const skillPath = path.join(skillsDir, skill, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      missing.push(skill);
    }
  }

  return { installed: missing.length === 0, missing };
}

// ── Main runner ──

/**
 * Spawn a Claude Code process to execute a skill.
 *
 * 1. Spawns claude with buildSkillArgs, cwd=invocation.repoPath, env=buildSkillEnv()
 * 2. Tracks process via trackProcess
 * 3. Sends skill command as user message via stdin
 * 4. Parses stdout for init, assistant/text, assistant/tool_use, result messages
 * 5. Handles premature results (< 200 chars without "---" markers)
 * 6. On timeout: kills process, resolves with error
 * 7. On exit: resolves with accumulated text
 */
export function runSkill(
  invocation: SkillInvocation,
  onEvent?: (event: PlanningEvent) => void,
): Promise<SkillResult> {
  const timeoutMs = invocation.timeoutMs ?? 300000;

  return new Promise((resolve) => {
    const claudePath = getClaudeCodePath();
    const args = buildSkillArgs(invocation.sessionId);
    const skillLabel = `${invocation.skill} ${invocation.args}`.trim();

    log(`[skill] Spawning: ${skillLabel} in ${invocation.repoPath} (session=${invocation.sessionId ?? "new"})`);

    let proc: ChildProcess;
    try {
      proc = spawn(claudePath, args, {
        cwd: invocation.repoPath,
        env: buildSkillEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log(`[skill] Failed to spawn: ${errorMsg}`);
      resolve({
        success: false,
        sessionId: null,
        events: [{ type: "error", content: `Failed to spawn: ${errorMsg}`, timestamp: new Date().toISOString() }],
        resultText: "",
        error: errorMsg,
      });
      return;
    }

    let outputBuffer = "";
    let resultText = "";
    let assistantText = "";
    let sessionId = invocation.sessionId;
    let done = false;
    let bytesReceived = 0;
    let initialized = false;
    const events: PlanningEvent[] = [];

    const emit = (type: PlanningEvent["type"], content: string) => {
      const event: PlanningEvent = { type, content, timestamp: new Date().toISOString() };
      events.push(event);
      onEvent?.(event);
    };

    if (proc.pid) trackProcess(proc.pid, "planning", skillLabel);

    log(`[skill] Spawned PID ${proc.pid}`);
    emit("status", `Spawned skill runner — loading tools...`);

    // Send skill command as user message
    const userMessage = `${invocation.skill} ${invocation.args}`.trim();
    proc.stdin?.write(
      JSON.stringify({
        type: "user",
        message: { role: "user", content: userMessage },
        parent_tool_use_id: null,
        uuid: randomUUID(),
        session_id: sessionId ?? "",
      }) + "\n",
    );

    // Periodic status updates during silent init
    const startTs = Date.now();
    const initTicker = setInterval(() => {
      if (!initialized && !done) {
        const elapsed = Math.round((Date.now() - startTs) / 1000);
        emit("status", `Loading tools... (${elapsed}s)`);
      }
    }, 10000);

    // Timeout handler
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        clearInterval(initTicker);
        if (proc.pid) untrackProcess(proc.pid);
        log(`[skill] Timed out after ${Math.round(timeoutMs / 1000)}s (${bytesReceived} bytes received)`);
        emit("error", `Timed out after ${Math.round(timeoutMs / 1000)}s`);
        proc.kill();
        resolve({
          success: false,
          sessionId,
          events,
          resultText: resultText || assistantText || "",
          error: `Timed out after ${Math.round(timeoutMs / 1000)}s`,
        });
      }
    }, timeoutMs);

    // Process stdout
    proc.stdout?.on("data", (chunk: Buffer) => {
      bytesReceived += chunk.length;
      outputBuffer += chunk.toString("utf-8");
      const lines = outputBuffer.split("\n");
      outputBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);

          // System init — extract session ID, tool count
          if (msg.type === "system" && msg.subtype === "init") {
            initialized = true;
            clearInterval(initTicker);
            const extractedId = extractSessionId(msg);
            if (extractedId) sessionId = extractedId;
            const tools: string[] = msg.tools ?? [];
            log(`[skill] Initialized: ${tools.length} tools, session=${sessionId}`);
            emit("init", `Agent ready — ${tools.length} tools`);
          }

          // Assistant content — text and tool_use blocks
          if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
            for (const block of msg.message.content as Array<{
              type: string;
              name?: string;
              text?: string;
              input?: Record<string, unknown>;
            }>) {
              if (block.type === "tool_use" && block.name) {
                const input = block.input ?? {};
                let detail = block.name;
                if (block.name.includes("Bash")) detail = `Bash: ${JSON.stringify(input).slice(0, 100)}`;
                else if (block.name.includes("Edit")) detail = `Edit: ${JSON.stringify(input).slice(0, 100)}`;
                else if (block.name.includes("Write")) detail = `Write: ${JSON.stringify(input).slice(0, 100)}`;
                else if (block.name.includes("Read")) detail = `Read: ${JSON.stringify(input).slice(0, 100)}`;
                emit("tool_use", detail);
              }
              if (block.type === "text" && block.text?.trim()) {
                assistantText += (assistantText ? "\n" : "") + block.text;
                emit("text", block.text.slice(0, 500));
              }
            }
          }

          // Result message
          if (msg.type === "result" && !done) {
            resultText = String(msg.result ?? "");
            const finalText = resultText.trim() || assistantText.trim();

            // Check for premature result — same logic as askMcpPlanningAgent.
            // MCP agents do multi-turn tool calling and can emit empty/partial
            // results before the actual work is done.
            const hasPlanContent = finalText.includes("---") && finalText.length > 200;
            if (!hasPlanContent && finalText.length < 200) {
              log(`[skill] Ignoring premature result (${finalText.length} chars, no plan markers)`);
              emit("status", `Agent still working... (${finalText.length} chars so far)`);
              // Don't resolve — wait for process to continue or exit
              return;
            }

            log(`[skill] Result: ${finalText.length} chars (result=${resultText.length}, assistant=${assistantText.length})`);
            emit("result", `Skill complete (${finalText.length} chars)`);
            done = true;
            clearInterval(initTicker);
            clearTimeout(timeout);
            if (proc.pid) untrackProcess(proc.pid);
            proc.kill();
            resolve({
              success: true,
              sessionId,
              events,
              resultText: finalText,
              error: null,
            });
          }
        } catch {}
      }
    });

    // Stderr — log but don't surface
    proc.stderr?.on("data", (chunk: Buffer) => {
      log(`[skill] STDERR: ${chunk.toString("utf-8").slice(0, 200)}`);
    });

    // Process exit
    proc.on("exit", (code) => {
      clearInterval(initTicker);
      if (proc.pid) untrackProcess(proc.pid);
      if (!done) {
        done = true;
        clearTimeout(timeout);
        const finalText = resultText.trim() || assistantText.trim();
        log(`[skill] Exited code=${code}, bytes=${bytesReceived}, text=${finalText.length}`);
        emit("error", `Agent exited (code ${code})`);
        resolve({
          success: !!finalText,
          sessionId,
          events,
          resultText: finalText || "Process exited without result",
          error: finalText ? null : `Process exited with code ${code}`,
        });
      }
    });
  });
}
