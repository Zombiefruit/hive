#!/usr/bin/env node
/**
 * Standalone test script to investigate the parallel Claude Code spawn issue.
 *
 * PROBLEM: When Claude Deck spawns Claude Code processes in parallel (for
 * faster notification polling), the processes produce ZERO stdout — even
 * though a single spawn (the MCP bridge) works perfectly fine.
 *
 * This script reproduces the issue outside of Electron so we can iterate
 * quickly without rebuilding the full app.
 *
 * Usage:
 *   node scripts/test-parallel-spawn.mjs              # Run all tests
 *   node scripts/test-parallel-spawn.mjs single       # Test single spawn only
 *   node scripts/test-parallel-spawn.mjs parallel     # Test parallel spawns only
 *   node scripts/test-parallel-spawn.mjs serial       # Test serial spawns only
 *   node scripts/test-parallel-spawn.mjs parallel 3   # Test with 3 parallel processes
 */

import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// ── Configuration ──

const TIMEOUT_MS = 90_000; // How long to wait for init + response
const PROMPT = "Say hello in exactly 5 words.";
const MODEL = "claude-haiku-4-5-20251001";

// ── Find Claude ──

function findClaude() {
  try {
    return execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {
    const candidates = [
      path.join(homedir(), ".local/bin/claude"),
      "/usr/local/bin/claude",
      "/opt/homebrew/bin/claude",
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    throw new Error("Could not find claude binary");
  }
}

// ── Helpers ──

const ts = () => new Date().toISOString().slice(11, 23);

function colorize(text, color) {
  const colors = { red: 31, green: 32, yellow: 33, blue: 34, cyan: 36, gray: 90 };
  return `\x1b[${colors[color] ?? 0}m${text}\x1b[0m`;
}

// ── Spawn a single Claude Code process ──

function spawnClaude(id, claudePath, sendPromptOnInit = true, sendPromptImmediately = false) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const log = (msg) => console.log(`  ${colorize(`[${id}]`, "cyan")} ${colorize(ts(), "gray")} ${msg}`);

    log(`Spawning: ${claudePath}`);

    const proc = spawn(claudePath, [
      "--output-format", "stream-json",
      "--verbose",
      "--input-format", "stream-json",
      "--no-chrome",
      "--model", MODEL,
      "--no-session-persistence",
      "--disallowedTools", "Write,Edit,Bash,NotebookEdit,Agent,EnterWorktree,ExitWorktree",
      "--system-prompt", "You are a test. Respond briefly.",
    ], {
      cwd: process.env.TEST_CWD || process.cwd(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    log(`PID: ${proc.pid} (sendPromptImmediately=${sendPromptImmediately})`);

    let outputBuffer = "";
    let resultText = "";
    let done = false;
    let promptSent = false;

    // If sendPromptImmediately, write the prompt to stdin right away without waiting for init
    if (sendPromptImmediately) {
      const message = JSON.stringify({
        type: "user",
        message: { role: "user", content: PROMPT },
        parent_tool_use_id: null,
        session_id: "",
      }) + "\n";
      log(`Sending prompt immediately (${message.length} bytes)...`);
      promptSent = true;
      proc.stdin?.write(message);
    }
    let bytesReceived = 0;
    let linesReceived = 0;
    let initReceived = false;
    let initToolCount = 0;
    let initMcpCount = 0;
    let firstByteAt = 0;
    let initAt = 0;
    let resultAt = 0;

    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        const elapsed = Date.now() - startTime;
        log(colorize(`TIMEOUT after ${elapsed}ms — bytes=${bytesReceived}, lines=${linesReceived}, init=${initReceived}, promptSent=${promptSent}`, "red"));
        proc.kill();
        resolve({
          id,
          success: false,
          reason: "timeout",
          bytesReceived,
          linesReceived,
          initReceived,
          promptSent,
          elapsed,
        });
      }
    }, TIMEOUT_MS);

    proc.stdout?.on("data", (chunk) => {
      const chunkLen = chunk.length;
      if (bytesReceived === 0) {
        firstByteAt = Date.now() - startTime;
        log(`First stdout byte after ${firstByteAt}ms (${chunkLen} bytes)`);
        // Show first 300 bytes raw to understand the format
        log(`RAW START: ${JSON.stringify(chunk.toString("utf-8").slice(0, 300))}`);
      }
      bytesReceived += chunkLen;
      log(colorize(`chunk: ${chunkLen} bytes (total: ${bytesReceived})`, "gray"));

      outputBuffer += chunk.toString("utf-8");
      const lines = outputBuffer.split("\n");
      outputBuffer = lines.pop() ?? "";
      if (outputBuffer.length > 0) {
        log(colorize(`buffer remainder: ${outputBuffer.length} bytes`, "gray"));
      }

      for (const line of lines) {
        if (!line.trim()) continue;
        linesReceived++;

        try {
          const msg = JSON.parse(line);
          // Log every message type for debugging
          log(`LINE ${linesReceived}: type=${msg.type} subtype=${msg.subtype ?? "-"} (${line.length} bytes)`);

          if (msg.type === "system" && msg.subtype === "init") {
            initReceived = true;
            initAt = Date.now() - startTime;
            const tools = msg.tools ?? [];
            initToolCount = tools.length;
            initMcpCount = tools.filter((t) => t.includes("mcp__claude_ai")).length;
            log(colorize(`INIT received after ${initAt}ms — ${initToolCount} tools, ${initMcpCount} MCP`, "green"));

            if (sendPromptOnInit && !promptSent) {
              promptSent = true;
              const message = JSON.stringify({
                type: "user",
                message: { role: "user", content: PROMPT },
                parent_tool_use_id: null,
                session_id: msg.session_id ?? "",
              }) + "\n";
              log(`Sending prompt (${message.length} bytes)...`);
              proc.stdin?.write(message);
            }
          }

          if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
            for (const block of msg.message.content) {
              if (block.type === "text" && block.text) {
                log(`Assistant: ${block.text.slice(0, 100)}`);
              }
              if (block.type === "tool_use") {
                log(`Tool use: ${block.name}`);
              }
            }
          }

          if (msg.type === "result" && !done) {
            resultText = String(msg.result ?? "");
            resultAt = Date.now() - startTime;
            log(colorize(`RESULT after ${resultAt}ms: ${resultText.slice(0, 100)}`, "green"));
            done = true;
            clearTimeout(timeout);
            proc.kill();
            resolve({
              id,
              success: true,
              result: resultText.slice(0, 200),
              bytesReceived,
              linesReceived,
              initToolCount,
              initMcpCount,
              firstByteMs: firstByteAt,
              initMs: initAt,
              resultMs: resultAt,
            });
          }
        } catch {
          // Not valid JSON — log raw
          if (linesReceived <= 3) {
            log(colorize(`Non-JSON line: ${line.slice(0, 100)}`, "yellow"));
          }
        }
      }
    });

    proc.stderr?.on("data", (chunk) => {
      const msg = chunk.toString("utf-8").trim();
      if (msg) log(colorize(`STDERR: ${msg.slice(0, 150)}`, "yellow"));
    });

    proc.on("error", (err) => {
      log(colorize(`ERROR: ${err.message}`, "red"));
    });

    proc.on("exit", (code, signal) => {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        const elapsed = Date.now() - startTime;
        log(colorize(`EXIT code=${code} signal=${signal} after ${elapsed}ms — bytes=${bytesReceived}, init=${initReceived}, promptSent=${promptSent}`, "red"));
        resolve({
          id,
          success: false,
          reason: `exit(${code}/${signal})`,
          bytesReceived,
          linesReceived,
          initReceived,
          promptSent,
          elapsed,
        });
      }
    });
  });
}

// ── Test runners ──

async function testSingle(claudePath) {
  console.log(colorize("\n═══ TEST: Single Spawn ═══", "blue"));
  console.log(`  Spawning 1 process, waiting up to ${TIMEOUT_MS / 1000}s\n`);

  const result = await spawnClaude("single-1", claudePath);
  console.log(`\n  Result:`, JSON.stringify(result, null, 2));
  return [result];
}

async function testParallel(claudePath, count = 3) {
  console.log(colorize(`\n═══ TEST: Parallel Spawn (${count} processes, immediate prompt) ═══`, "blue"));
  console.log(`  Spawning ${count} processes simultaneously, sending prompt immediately\n`);

  const startTime = Date.now();
  const promises = [];
  for (let i = 1; i <= count; i++) {
    promises.push(spawnClaude(`par-${i}`, claudePath, false, true));
  }

  const results = await Promise.all(promises);
  const elapsed = Date.now() - startTime;

  console.log(colorize(`\n  All ${count} processes completed in ${elapsed}ms`, "blue"));
  console.log(`  Success: ${results.filter((r) => r.success).length}/${count}`);
  for (const r of results) {
    const status = r.success ? colorize("OK", "green") : colorize(`FAIL(${r.reason})`, "red");
    console.log(`    ${r.id}: ${status} — bytes=${r.bytesReceived ?? 0}, init=${r.initReceived ?? false}`);
  }
  return results;
}

async function testSerial(claudePath, count = 3) {
  console.log(colorize(`\n═══ TEST: Serial Spawn (${count} processes, one at a time) ═══`, "blue"));
  console.log(`  Spawning ${count} processes sequentially\n`);

  const results = [];
  for (let i = 1; i <= count; i++) {
    const result = await spawnClaude(`ser-${i}`, claudePath);
    results.push(result);
    // Small gap between spawns
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(colorize(`\n  All ${count} serial processes completed`, "blue"));
  console.log(`  Success: ${results.filter((r) => r.success).length}/${count}`);
  for (const r of results) {
    const status = r.success ? colorize("OK", "green") : colorize(`FAIL(${r.reason})`, "red");
    console.log(`    ${r.id}: ${status} — bytes=${r.bytesReceived ?? 0}, init=${r.initReceived ?? false}`);
  }
  return results;
}

async function testImmediate(claudePath) {
  console.log(colorize("\n═══ TEST: Immediate Prompt (no init wait) ═══", "blue"));
  console.log(`  Sends prompt immediately on stdin without waiting for init\n`);

  const result = await spawnClaude("imm-1", claudePath, false, true);
  console.log(`\n  Result:`, JSON.stringify(result, null, 2));
  return [result];
}

async function testStaggered(claudePath, count = 3, delayMs = 5000) {
  console.log(colorize(`\n═══ TEST: Staggered Spawn (${count} processes, ${delayMs}ms apart) ═══`, "blue"));
  console.log(`  Spawning ${count} processes with ${delayMs}ms delay between each\n`);

  const promises = [];
  for (let i = 1; i <= count; i++) {
    if (i > 1) await new Promise((r) => setTimeout(r, delayMs));
    promises.push(spawnClaude(`stag-${i}`, claudePath));
  }

  const results = await Promise.all(promises);
  console.log(colorize(`\n  All ${count} staggered processes completed`, "blue"));
  console.log(`  Success: ${results.filter((r) => r.success).length}/${count}`);
  for (const r of results) {
    const status = r.success ? colorize("OK", "green") : colorize(`FAIL(${r.reason})`, "red");
    console.log(`    ${r.id}: ${status} — bytes=${r.bytesReceived ?? 0}, init=${r.initReceived ?? false}`);
  }
  return results;
}

// ── Main ──

async function main() {
  const claudePath = findClaude();
  console.log(colorize("Claude Code Parallel Spawn Test", "blue"));
  console.log(`  Binary: ${claudePath}`);
  console.log(`  CWD: ${process.cwd()}`);
  console.log(`  Node: ${process.version}`);
  console.log(`  Timeout: ${TIMEOUT_MS / 1000}s per process`);
  console.log(`  Model: ${MODEL}`);

  const mode = process.argv[2] ?? "all";
  const count = parseInt(process.argv[3]) || 3;

  const allResults = {};

  if (mode === "single" || mode === "all") {
    allResults.single = await testSingle(claudePath);
  }
  if (mode === "serial" || mode === "all") {
    allResults.serial = await testSerial(claudePath, count);
  }
  if (mode === "parallel" || mode === "all") {
    allResults.parallel = await testParallel(claudePath, count);
  }
  if (mode === "immediate" || mode === "all") {
    allResults.immediate = await testImmediate(claudePath);
  }
  if (mode === "staggered") {
    allResults.staggered = await testStaggered(claudePath, count, 5000);
  }

  // Summary
  console.log(colorize("\n═══ SUMMARY ═══", "blue"));
  for (const [test, results] of Object.entries(allResults)) {
    const ok = results.filter((r) => r.success).length;
    const total = results.length;
    const color = ok === total ? "green" : ok > 0 ? "yellow" : "red";
    console.log(`  ${test}: ${colorize(`${ok}/${total} succeeded`, color)}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
