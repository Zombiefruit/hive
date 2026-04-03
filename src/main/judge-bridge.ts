/**
 * Judge Bridge — spawns lightweight ephemeral judge agents that verify
 * triage output, plans, and work results. All judges are read-only,
 * use Sonnet for speed/cost, and never block the main pipeline on failure.
 */

import { spawn } from "node:child_process";
import os from "node:os";
import { getClaudeCodePath } from "./claude-path";
import { trackProcess, untrackProcess } from "./process-monitor";
import { addDebugEntry } from "./mcp-bridge";
import { loadSkills } from "../shared/skill-loader";
import { parseTriageVerdict, parsePlanVerdict, parseWorkVerdict, parseBusinessContextVerdict } from "../shared/judge-parser";
import type { TriageVerdict, PlanVerdict, WorkVerdict, BusinessContextVerdict } from "../shared/judge-types";
import type { TriageResult } from "../shared/triage-parser";
import { getRelevantMemories, formatMemoriesForPrompt } from "./memory/service";
import { getBusinessContextForPrompt } from "./business-context";

// ── Shared judge process spawner ──

const JUDGE_SYSTEM_PROMPT = "You are a verification judge. Your ONLY job is to review agent output and produce a structured JSON verdict. Do NOT read local files, do NOT explore the filesystem. All context is provided in your prompt. Return ONLY a JSON object — no markdown, no narration, no explanation outside the JSON.";

function askJudgeProcess(prompt: string, label: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const claudePath = getClaudeCodePath();

    const proc = spawn(claudePath, [
      "--output-format", "stream-json",
      "--verbose",
      "--input-format", "stream-json",
      "--no-chrome",
      "--model", "claude-sonnet-4-6",
      "--no-session-persistence",
      "--disallowedTools", "Write,Edit,Bash,NotebookEdit,Agent,EnterWorktree,ExitWorktree,Read,Glob,Grep",
      "--system-prompt", JUDGE_SYSTEM_PROMPT,
    ], {
      cwd: os.homedir(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let outputBuffer = "";
    let resultText = "";
    let done = false;

    if (proc.pid) trackProcess(proc.pid, "judge", label);

    addDebugEntry("in", `⚖️ [JUDGE:${label}] Spawned (PID ${proc.pid})`, "judge");

    proc.stdin?.write(JSON.stringify({
      type: "user",
      message: { role: "user", content: prompt },
      parent_tool_use_id: null,
      session_id: "",
    }) + "\n");

    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        if (proc.pid) untrackProcess(proc.pid);
        addDebugEntry("out", `⏱️ [JUDGE:${label}] Timed out`, "judge");
        proc.kill();
        resolve(resultText || "");
      }
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      outputBuffer += chunk.toString("utf-8");
      const lines = outputBuffer.split("\n");
      outputBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "result" && !done) {
            resultText = String(msg.result ?? "");
            addDebugEntry("out", `✅ [JUDGE:${label}] Result: ${resultText.length} chars`, "judge");
            done = true;
            clearTimeout(timeout);
            if (proc.pid) untrackProcess(proc.pid);
            proc.kill();
            resolve(resultText);
          }
        } catch {}
      }
    });

    proc.stderr?.on("data", () => {});
    proc.on("exit", () => {
      if (proc.pid) untrackProcess(proc.pid);
      if (!done) {
        done = true;
        clearTimeout(timeout);
        resolve(resultText || "");
      }
    });
  });
}

// ── Public judge functions ──

export async function judgeTriage(
  rawData: string,
  triageResult: TriageResult,
  config: { userName: string; managerName?: string },
): Promise<TriageVerdict | null> {
  const startTime = Date.now();
  try {
    const skill = loadSkills(["judge-triage"]);
    const memories = await getRelevantMemories(
      `Triaging notifications for ${config.userName}: priorities, people importance, task patterns`,
      "triage",
      8,
    ).catch(() => []);
    const memorySection = formatMemoriesForPrompt(memories);

    const businessContext = getBusinessContextForPrompt();
    const prompt = `${skill}

## User Context
- User: ${config.userName}
${config.managerName ? `- Manager: ${config.managerName}` : ""}
${memorySection ? `\n${memorySection}\n` : ""}${businessContext}
## Raw Fetched Data
${rawData.slice(0, 15000)}

## Triage Output to Verify
\`\`\`json
${JSON.stringify(triageResult, null, 2).slice(0, 10000)}
\`\`\`

Produce your verdict as a JSON object.`;

    const response = await askJudgeProcess(prompt, "triage", 60000);
    const verdict = parseTriageVerdict(response);
    if (verdict) {
      verdict.durationMs = Date.now() - startTime;
      verdict.judgedAt = new Date().toISOString();
    }
    addDebugEntry("out", `⚖️ [JUDGE:triage] Verdict: ${verdict?.status ?? "parse_failed"} (${Date.now() - startTime}ms)`, "judge");
    return verdict;
  } catch (err) {
    addDebugEntry("out", `❌ [JUDGE:triage] Error: ${String(err).slice(0, 100)}`, "judge");
    return null;
  }
}

export async function judgePlan(
  notification: { title: string; summary: string; taskType?: string },
  plan: string,
  fetchedContext: Array<{ type: string; content: string; timestamp: string }>,
): Promise<PlanVerdict | null> {
  const startTime = Date.now();
  try {
    const skill = loadSkills(["judge-plan"]);
    const contextSummary = fetchedContext
      .filter(e => e.type === "text" || e.type === "tool_use")
      .map(e => e.content)
      .join("\n")
      .slice(0, 8000);

    const memories = await getRelevantMemories(
      `Planning: ${notification.title} (${notification.taskType ?? "implementation"})`,
      "planning",
      6,
    ).catch(() => []);
    const memorySection = formatMemoriesForPrompt(memories);

    const businessContext = getBusinessContextForPrompt();
    const prompt = `${skill}

## Task Being Planned
- **Title**: ${notification.title}
- **Summary**: ${notification.summary}
- **Task Type**: ${notification.taskType ?? "implementation"}
${memorySection ? `\n${memorySection}\n` : ""}${businessContext}
## Context Gathered During Planning
${contextSummary || "(No context gathered)"}

## Plan to Verify
${plan.slice(0, 15000)}

Produce your verdict as a JSON object.`;

    const response = await askJudgeProcess(prompt, "plan", 90000);
    const verdict = parsePlanVerdict(response);
    if (verdict) {
      verdict.durationMs = Date.now() - startTime;
      verdict.judgedAt = new Date().toISOString();
    }
    addDebugEntry("out", `⚖️ [JUDGE:plan] Verdict: ${verdict?.status ?? "parse_failed"} (${Date.now() - startTime}ms)`, "judge");
    return verdict;
  } catch (err) {
    addDebugEntry("out", `❌ [JUDGE:plan] Error: ${String(err).slice(0, 100)}`, "judge");
    return null;
  }
}

export async function judgeWork(
  plan: string,
  workEvents: Array<{ type: string; content: string; timestamp: string }>,
  resultText: string,
): Promise<WorkVerdict | null> {
  const startTime = Date.now();
  try {
    const skill = loadSkills(["judge-work"]);
    const eventSummary = workEvents
      .slice(-50)
      .map(e => `[${e.type}] ${e.content}`)
      .join("\n")
      .slice(0, 10000);

    const memories = await getRelevantMemories(
      `Reviewing work output: ${plan.slice(0, 200)}`,
      "work",
      6,
    ).catch(() => []);
    const memorySection = formatMemoriesForPrompt(memories);

    const businessContext = getBusinessContextForPrompt();
    const prompt = `${skill}

## Approved Plan
${plan.slice(0, 10000)}
${memorySection ? `\n${memorySection}\n` : ""}${businessContext}
## Work Agent Activity (last 50 events)
${eventSummary || "(No events recorded)"}

## Final Result
${resultText.slice(0, 10000)}

Produce your verdict as a JSON object.`;

    const response = await askJudgeProcess(prompt, "work", 120000);
    const verdict = parseWorkVerdict(response);
    if (verdict) {
      verdict.durationMs = Date.now() - startTime;
      verdict.judgedAt = new Date().toISOString();
    }
    addDebugEntry("out", `⚖️ [JUDGE:work] Verdict: ${verdict?.status ?? "parse_failed"} (${Date.now() - startTime}ms)`, "judge");
    return verdict;
  } catch (err) {
    addDebugEntry("out", `❌ [JUDGE:work] Error: ${String(err).slice(0, 100)}`, "judge");
    return null;
  }
}

export async function judgeBusinessContext(
  contextJson: string,
  knownTeam: { name: string; managerName?: string; coworkers: Array<{ name: string; role: string }> },
): Promise<BusinessContextVerdict | null> {
  const startTime = Date.now();
  try {
    const skill = loadSkills(["judge-business-context"]);
    const knownPeople = [
      ...(knownTeam.managerName ? [`- ${knownTeam.managerName} (manager)`] : []),
      ...knownTeam.coworkers.map(c => `- ${c.name} (${c.role})`),
    ].join("\n");

    const prompt = `${skill}

## KNOWN TEAM (ground truth from user's config)
${knownPeople || "(No team configured — skip team validation)"}

## Business Context to Verify
\`\`\`json
${contextJson.slice(0, 15000)}
\`\`\`

Produce your verdict as a JSON object. Be strict about departed employees — if someone is NOT in the known team list, flag them.`;

    const response = await askJudgeProcess(prompt, "business-context", 90000);
    const verdict = parseBusinessContextVerdict(response);
    if (verdict) {
      verdict.durationMs = Date.now() - startTime;
      verdict.judgedAt = new Date().toISOString();
    }
    addDebugEntry("out", `⚖️ [JUDGE:context] Verdict: ${verdict?.status ?? "parse_failed"} (${Date.now() - startTime}ms)`, "judge");
    return verdict;
  } catch (err) {
    addDebugEntry("out", `❌ [JUDGE:context] Error: ${String(err).slice(0, 100)}`, "judge");
    return null;
  }
}
