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

import { spawn, ChildProcess, execFileSync } from "node:child_process";
import { getClaudeCodePath } from "./claude-path";
import { trackProcess, untrackProcess } from "./process-monitor";
import { recordUsage } from "./usage-ledger";
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
export function buildSkillArgs(sessionId: string | null, message?: string): string[] {
  const args = [
    "--output-format",
    "stream-json",
    "--verbose",
    "--no-chrome",
    "--allowedTools",
    "*",
    "--permission-mode",
    "default",
  ];

  if (sessionId) {
    // Resume existing session — needs stream-json input for follow-up messages
    args.push("--resume", sessionId, "--input-format", "stream-json");
  } else if (message) {
    // New session — use -p to send the message as an arg (no stdin deadlock)
    args.push("-p", message);
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

// ── Running process registry (for sending messages to running agents) ──

const runningSkills = new Map<string, { proc: ChildProcess; sessionId: string | null }>();

/**
 * Send a follow-up message to a running skill process.
 * Returns true if the message was sent, false if no process found.
 */
export function sendToSkill(notificationId: string, message: string): boolean {
  const entry = runningSkills.get(notificationId);
  if (!entry?.proc?.stdin?.writable) return false;

  entry.proc.stdin.write(
    JSON.stringify({
      type: "user",
      message: { role: "user", content: message },
      parent_tool_use_id: null,
      uuid: randomUUID(),
      session_id: entry.sessionId ?? "",
    }) + "\n",
  );
  log(`[skill] Sent message to ${notificationId}: ${message.slice(0, 100)}`);
  return true;
}

/** Check if a skill process is currently running for a notification. */
export function isSkillRunning(notificationId: string): boolean {
  return runningSkills.has(notificationId);
}

/** Get all notification IDs that currently have a running skill. */
export function getRunningSkillIds(): string[] {
  return [...runningSkills.keys()];
}

// ── Worktree helpers ──

/** Skills that modify code and should run in an isolated worktree. */
const WORKTREE_SKILLS = new Set(["/hack", "/ship", "/code-review", "/handle-pr-feedback"]);

/**
 * Create a git worktree for a branch. Returns the worktree path.
 * Handles all edge cases: branch already has worktree, branch already exists, etc.
 */
export function createWorktree(repoPath: string, branch: string): string {
  const worktreeName = branch.replace(/[^a-zA-Z0-9_-]/g, "-");
  const worktreeBase = path.join(repoPath, "..", `.worktrees`);
  const worktreePath = path.join(worktreeBase, worktreeName);

  // 1. Check if the directory already exists and is valid
  if (fs.existsSync(worktreePath)) {
    log(`[worktree] Reusing existing directory: ${worktreePath}`);
    return worktreePath;
  }

  // 2. Check if this branch already has a worktree somewhere (via git worktree list)
  try {
    const listOutput = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repoPath, timeout: 10000 }).toString();
    const lines = listOutput.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("branch refs/heads/") && lines[i].endsWith(branch)) {
        // Found existing worktree for this branch — find its path (line before)
        for (let j = i - 1; j >= 0; j--) {
          if (lines[j].startsWith("worktree ")) {
            const existingPath = lines[j].slice("worktree ".length).trim();
            if (fs.existsSync(existingPath)) {
              log(`[worktree] Branch "${branch}" already has worktree at: ${existingPath}`);
              return existingPath;
            }
            break;
          }
        }
      }
    }
  } catch {
    // git worktree list failed — continue with creation attempt
  }

  // 3. Try to create the worktree
  try {
    fs.mkdirSync(worktreeBase, { recursive: true });
  } catch {}

  // 3a. Try checking out existing branch into new worktree
  const errors: string[] = [];
  try {
    execFileSync("git", ["worktree", "add", worktreePath, branch], { cwd: repoPath, timeout: 30000 });
    log(`[worktree] Created: ${worktreePath} (branch: ${branch})`);
    return worktreePath;
  } catch (err) {
    const msg = err instanceof Error ? (err as { stderr?: Buffer }).stderr?.toString() ?? err.message : String(err);
    errors.push(msg.split("\n")[0]?.trim() ?? msg.slice(0, 100));
    log(`[worktree] Add failed: ${msg.slice(0, 200)}`);
  }

  // 3b. Branch might not exist — create from HEAD
  try {
    execFileSync("git", ["worktree", "add", "-b", branch, worktreePath, "HEAD"], { cwd: repoPath, timeout: 30000 });
    log(`[worktree] Created with new branch: ${worktreePath}`);
    return worktreePath;
  } catch (err) {
    const msg = err instanceof Error ? (err as { stderr?: Buffer }).stderr?.toString() ?? err.message : String(err);
    errors.push(msg.split("\n")[0]?.trim() ?? msg.slice(0, 100));
    log(`[worktree] Add -b failed: ${msg.slice(0, 200)}`);
  }

  // 3c. Branch exists but worktree add failed — try detached HEAD at branch tip
  try {
    execFileSync("git", ["worktree", "add", "--detach", worktreePath, branch], { cwd: repoPath, timeout: 30000 });
    log(`[worktree] Created detached at ${branch}: ${worktreePath}`);
    return worktreePath;
  } catch (err) {
    const msg = err instanceof Error ? (err as { stderr?: Buffer }).stderr?.toString() ?? err.message : String(err);
    errors.push(msg.split("\n")[0]?.trim() ?? msg.slice(0, 100));
    log(`[worktree] All creation strategies failed: ${msg.slice(0, 200)}`);
  }

  // 3d. Last resort: prune stale worktrees and retry once
  try {
    execFileSync("git", ["worktree", "prune"], { cwd: repoPath, timeout: 10000 });
    execFileSync("git", ["worktree", "add", worktreePath, branch], { cwd: repoPath, timeout: 30000 });
    log(`[worktree] Created after prune: ${worktreePath}`);
    return worktreePath;
  } catch {
    log(`[worktree] Prune+retry also failed`);
  }

  // 4. All failed — fall back to the repo itself, store error for UI
  const errorDetail = errors[0] ?? "Unknown error";
  log(`[worktree] Falling back to repo: ${repoPath} (${errorDetail})`);
  // Store the error so the UI can show a useful message
  (createWorktree as { lastError?: string }).lastError = errorDetail;
  return repoPath;
}

/** Remove a git worktree if it exists. */
export function cleanupWorktree(repoPath: string, worktreePath: string): void {
  if (worktreePath === repoPath) return; // Not a worktree
  try {
    execFileSync("git", ["worktree", "remove", worktreePath, "--force"], { cwd: repoPath, timeout: 15000 });
    log(`[worktree] Cleaned up: ${worktreePath}`);
  } catch {
    log(`[worktree] Cleanup failed (may already be removed): ${worktreePath}`);
  }
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
  const _timeoutMs = invocation.timeoutMs; // unused — inactivity timeout used instead

  return new Promise((resolve) => {
    const claudePath = getClaudeCodePath();
    const userMessage = `${invocation.skill} ${invocation.args}`.trim();
    const args = buildSkillArgs(invocation.sessionId, userMessage);
    const skillLabel = userMessage;

    // Ensure plan is on disk for /hack (failsafe — plan may exist in cache but not .work/)
    if (invocation.skill === "/hack" && invocation.repoPath) {
      try {
        const { getPlan } = require("../notifications/work-dispatcher") as { getPlan: (id: string) => { plan: string } | null };
        const { getNotifications } = require("../notifications/poll-service") as { getNotifications: () => Array<{ id: string; branch?: string; workSlug?: string }> };
        const notif = getNotifications().find(n => n.id === invocation.notificationId);
        const branch = notif?.branch ?? "";
        const slug = notif?.workSlug || branch.replace(/^[^/]+\//, "");
        if (slug) {
          const planDir = path.join(invocation.repoPath, ".work", slug);
          const planPath = path.join(planDir, "plan.md");
          if (!fs.existsSync(planPath)) {
            const cachedPlan = getPlan(invocation.notificationId);
            if (cachedPlan?.plan) {
              fs.mkdirSync(planDir, { recursive: true });
              fs.writeFileSync(planPath, cachedPlan.plan, "utf-8");
              log(`[skill] Wrote cached plan to ${planPath} (${cachedPlan.plan.length} chars)`);
            }
          }
        }
      } catch (err) {
        log(`[skill] Plan write failsafe error (non-fatal): ${String(err).slice(0, 100)}`);
      }
    }

    // Create worktree for code-modifying skills
    let effectiveCwd = invocation.repoPath;
    const needsWorktree = WORKTREE_SKILLS.has(invocation.skill) && invocation.repoPath;
    if (needsWorktree) {
      // Get branch from the notification (set during repo selection) or fall back to git HEAD
      let branch = "";
      try {
        const { getNotifications } = require("../notifications/poll-service") as { getNotifications: () => Array<{ id: string; branch?: string }> };
        const notif = getNotifications().find(n => n.id === invocation.notificationId);
        branch = notif?.branch ?? "";
      } catch {}
      if (!branch) {
        try {
          branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: invocation.repoPath, timeout: 5000 }).toString().trim();
        } catch {}
      }
      if (branch && branch !== "HEAD" && branch !== "main" && branch !== "master") {
        effectiveCwd = createWorktree(invocation.repoPath, branch);
        // Persist worktreePath on the notification so WorktreePanel can find it
        try {
          const { updateNotificationById } = require("../notifications/poll-service") as { updateNotificationById: (id: string, changes: Record<string, unknown>) => boolean };
          updateNotificationById(invocation.notificationId, { worktreePath: effectiveCwd, branch });
        } catch {}
      }
    }

    // Emit worktree status so it shows in the AgentTab
    if (needsWorktree && effectiveCwd !== invocation.repoPath) {
      onEvent?.({ type: "status", content: `Worktree ready: ${effectiveCwd.split("/").slice(-2).join("/")}`, timestamp: new Date().toISOString() });
    } else if (needsWorktree) {
      // Branch is already checked out in the main repo — that's fine, just note it
      onEvent?.({ type: "status", content: `Running in repo (branch already checked out)`, timestamp: new Date().toISOString() });
    }

    log(`[skill] Spawning: ${skillLabel} in ${effectiveCwd} (session=${invocation.sessionId ?? "new"})`);

    let proc: ChildProcess;
    try {
      proc = spawn(claudePath, args, {
        cwd: effectiveCwd,
        env: buildSkillEnv(),
        // stdin must be 'inherit' for new sessions — Claude Code blocks after hooks
        // if stdin is a pipe with no data or ignored. Resumed sessions need pipe for follow-ups.
        stdio: [invocation.sessionId ? "pipe" : "inherit", "pipe", "pipe"],
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
    let autoResponded = false; // Only auto-continue once per session
    const events: PlanningEvent[] = [];

    const emit = (type: PlanningEvent["type"], content: string) => {
      const event: PlanningEvent = { type, content, timestamp: new Date().toISOString() };
      events.push(event);
      onEvent?.(event);
    };

    if (proc.pid) trackProcess(proc.pid, "planning", skillLabel);
    // Register so we can send follow-up messages
    runningSkills.set(invocation.notificationId, { proc, sessionId: invocation.sessionId });

    log(`[skill] Spawned PID ${proc.pid}`);
    emit("status", `Spawned ${invocation.skill} — loading tools...`);

    // For new sessions, message is sent via -p arg (no stdin deadlock).
    // For resumed sessions, we'll send follow-up messages via stdin later.
    if (!invocation.sessionId) {
      log(`[skill] Message sent via -p arg: ${userMessage.slice(0, 100)}`);
    } else {
      // Resumed session — send via stdin
      proc.stdin?.write(
        JSON.stringify({
          type: "user",
          message: { role: "user", content: userMessage },
          parent_tool_use_id: null,
          uuid: randomUUID(),
          session_id: sessionId ?? "",
        }) + "\n",
      );
      log(`[skill] Sent command via stdin (resumed): ${userMessage.slice(0, 100)}`);
    }

    // Periodic status updates during silent init
    const startTs = Date.now();
    const initTicker = setInterval(() => {
      if (!initialized && !done) {
        const elapsed = Math.round((Date.now() - startTs) / 1000);
        emit("status", `Loading tools... (${elapsed}s)`);
      }
    }, 10000);

    // Two-phase timeout:
    // Phase 1 (init): 5 min hard limit for MCP tool loading.
    // Phase 2 (working): 120s inactivity limit after init.
    const INIT_TIMEOUT_MS = 120_000; // 120s for tool loading (normally ~10s, but can be slower on cold start)
    const INACTIVITY_LIMIT_MS = 120_000;
    let lastActivityTs = Date.now();
    let inactivityCheck: ReturnType<typeof setInterval> | null = null;

    // Phase 1: init timeout
    const initTimeout = setTimeout(() => {
      if (!initialized && !done) {
        done = true;
        clearInterval(initTicker);
        if (proc.pid) untrackProcess(proc.pid);
        runningSkills.delete(invocation.notificationId);
        const elapsed = Math.round((Date.now() - startTs) / 1000);
        log(`[skill] Init timeout: tools never loaded after ${elapsed}s (${bytesReceived} bytes received, initialized=${initialized}, bufferLen=${outputBuffer.length}, bufferStart=${outputBuffer.slice(0, 150)})`);
        emit("error", `MCP tools failed to load after ${elapsed}s. Check MCP server connectivity.`);
        proc.kill("SIGKILL");
        resolve({
          success: false,
          sessionId,
          events,
          resultText: "",
          error: `MCP tools failed to load after ${elapsed}s`,
        });
      }
    }, INIT_TIMEOUT_MS);

    // Phase 2: starts after init
    const startInactivityTimer = () => {
      if (inactivityCheck) return;
      clearTimeout(initTimeout);
      lastActivityTs = Date.now();
      inactivityCheck = setInterval(() => {
        if (done) return;
        const silentMs = Date.now() - lastActivityTs;
        if (silentMs >= INACTIVITY_LIMIT_MS) {
          done = true;
          clearInterval(initTicker);
          if (inactivityCheck) clearInterval(inactivityCheck);
          if (proc.pid) untrackProcess(proc.pid);
          runningSkills.delete(invocation.notificationId);
          const elapsed = Math.round((Date.now() - startTs) / 1000);
          log(`[skill] Inactivity timeout: ${Math.round(silentMs / 1000)}s silent after init, total ${elapsed}s, ${bytesReceived} bytes`);
          emit("error", `Agent unresponsive for ${Math.round(silentMs / 1000)}s — killed`);
          proc.kill("SIGKILL");
          resolve({
            success: false,
            sessionId,
            events,
            resultText: resultText || assistantText || "",
            error: `Agent unresponsive for ${Math.round(silentMs / 1000)}s`,
          });
        }
      }, 10000);
    };

    // Process stdout
    proc.stdout?.on("data", (chunk: Buffer) => {
      bytesReceived += chunk.length;
      lastActivityTs = Date.now(); // Reset inactivity timer
      const raw = chunk.toString("utf-8");
      outputBuffer += raw;
      const lines = outputBuffer.split("\n");
      outputBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          // Log EVERY message type during init for debugging
          if (!initialized) {
            log(`[skill] msg: type=${msg.type} subtype=${msg.subtype ?? ""} (${line.length} bytes)`);
          }

          // System init — extract session ID, tool count
          if (msg.type === "system" && msg.subtype === "init") {
            initialized = true;
            clearInterval(initTicker);
            const extractedId = extractSessionId(msg);
            if (extractedId) {
              sessionId = extractedId;
              // Update registry with real session ID
              const entry = runningSkills.get(invocation.notificationId);
              if (entry) entry.sessionId = extractedId;
              // Immediately persist sessionId on the notification so WorktreePanel can show "Resume in Terminal"
              try {
                const { updateNotificationById } = require("../notifications/poll-service") as { updateNotificationById: (id: string, changes: Record<string, unknown>) => boolean };
                updateNotificationById(invocation.notificationId, { sessionId: extractedId });
              } catch {}
            }
            const tools: string[] = msg.tools ?? [];
            log(`[skill] Initialized: ${tools.length} tools, session=${sessionId}`);
            emit("init", `Agent ready — ${tools.length} tools`);
            // Start inactivity timer now that init is done
            startInactivityTimer();
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

            log(`[skill] Result: ${finalText.length} chars (result=${resultText.length}, assistant=${assistantText.length})`);
            try {
              recordUsage({
                timestamp: new Date().toISOString(),
                source: "skill-runner",
                model: "unknown",
                inputTokens: msg.usage?.input_tokens ?? 0,
                outputTokens: msg.usage?.output_tokens ?? 0,
                costUsd: msg.total_cost_usd ?? 0,
                durationMs: Date.now() - startTs,
                label: skillLabel,
                notificationId: invocation.notificationId,
              });
            } catch {}

            // If the agent is waiting for confirmation — asking a question, waiting for go-ahead,
            // or pausing before acting — auto-respond so it works autonomously.
            const looksLikeWaiting = finalText.endsWith("?") ||
              /ready to (start|proceed|continue)\??/i.test(finalText) ||
              /shall I (proceed|start|continue|begin)\??/i.test(finalText) ||
              /want me to/i.test(finalText) ||
              /waiting for (your|the).*go.ahead/i.test(finalText) ||
              /your go.ahead/i.test(finalText) ||
              /let me know/i.test(finalText) ||
              /would you like/i.test(finalText) ||
              /confirm/i.test(finalText) ||
              /should I/i.test(finalText);

            if (looksLikeWaiting && !autoResponded && proc.stdin?.writable) {
              autoResponded = true;
              log(`[skill] Auto-responding to waiting/confirmation prompt`);
              emit("status", "Auto-proceeding...");
              lastActivityTs = Date.now();
              assistantText = "";
              resultText = "";
              proc.stdin.write(
                JSON.stringify({
                  type: "user",
                  message: { role: "user", content: "Yes, proceed. Commit, push, and open the PR. Do not ask for confirmation — complete everything autonomously including git operations." },
                  parent_tool_use_id: null,
                  uuid: randomUUID(),
                  session_id: sessionId ?? "",
                }) + "\n",
              );
              return; // Don't resolve — agent continues working
            }

            emit("result", `Skill complete (${finalText.length} chars)`);
            done = true;
            clearInterval(initTicker);
            clearTimeout(initTimeout);
            if (inactivityCheck) clearInterval(inactivityCheck);
            if (proc.pid) untrackProcess(proc.pid);
            proc.kill("SIGTERM");

            // Detect skill failure: short result, error keywords, or no plan found
            const looksLikeFailure = finalText.length < 300 && (
              finalText.includes("No plan found") ||
              finalText.includes("failed") ||
              finalText.includes("error") ||
              finalText.includes("Prompt is too long") ||
              finalText.includes("timed out") ||
              finalText.includes("unresponsive")
            );

            if (looksLikeFailure) {
              emit("error", `Skill may have failed: ${finalText.slice(0, 150)}`);
            }

            resolve({
              success: !looksLikeFailure,
              sessionId,
              events,
              resultText: finalText,
              error: looksLikeFailure ? finalText.slice(0, 200) : null,
            });
          }
        } catch (parseErr) {
          if (!initialized) {
            log(`[skill] JSON parse error: ${String(parseErr).slice(0, 60)} | line start: ${line.slice(0, 80)}`);
          }
        }
      }
    });

    // Stderr — surface during init so user can see MCP connection progress
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8").trim();
      if (!text) return;
      log(`[skill] STDERR: ${text.slice(0, 200)}`);
      // During init, stderr often has MCP server connection status — show it
      if (!initialized && !done) {
        emit("status", text.slice(0, 120));
      }
    });

    // Process exit
    proc.on("exit", (code) => {
      clearInterval(initTicker);
      clearTimeout(initTimeout);
      if (proc.pid) untrackProcess(proc.pid);
      runningSkills.delete(invocation.notificationId);
      if (!done) {
        done = true;
        if (inactivityCheck) clearInterval(inactivityCheck);
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
