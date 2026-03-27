/**
 * Process monitor — tracks all spawned Claude Code processes and their RSS.
 *
 * Provides visibility into how many processes are running and how much memory
 * they consume. Shown in the debug page.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

interface TrackedProcess {
  pid: number;
  type: "poll-bridge" | "planning" | "ephemeral" | "work" | "gh";
  label: string;
  startTime: number;
  lastRssKb: number | null;
}

const processes = new Map<number, TrackedProcess>();
let samplingInterval: ReturnType<typeof setInterval> | null = null;

function log(msg: string): void {
  try {
    const logPath = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "process-monitor.log");
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

export function trackProcess(pid: number, type: TrackedProcess["type"], label: string): void {
  processes.set(pid, { pid, type, label, startTime: Date.now(), lastRssKb: null });
  log(`TRACK pid=${pid} type=${type} label=${label}`);
}

export function untrackProcess(pid: number): void {
  const tracked = processes.get(pid);
  if (tracked) {
    log(`UNTRACK pid=${pid} type=${tracked.type} rss=${tracked.lastRssKb ?? "?"}KB uptime=${Math.round((Date.now() - tracked.startTime) / 1000)}s`);
  }
  processes.delete(pid);
}

export interface ProcessStats {
  processes: Array<{
    pid: number;
    type: string;
    label: string;
    uptimeMs: number;
    rssKb: number | null;
  }>;
  totalRssKb: number;
  count: number;
  selfRssKb: number;
}

export function getProcessStats(): ProcessStats {
  const now = Date.now();
  const procs = Array.from(processes.values()).map(p => ({
    pid: p.pid,
    type: p.type,
    label: p.label,
    uptimeMs: now - p.startTime,
    rssKb: p.lastRssKb,
  }));
  const totalRssKb = procs.reduce((sum, p) => sum + (p.rssKb ?? 0), 0);
  const selfRssKb = Math.round(process.memoryUsage.rss() / 1024);
  return { processes: procs, totalRssKb, count: procs.length, selfRssKb };
}

export function startProcessSampling(intervalMs = 10000): void {
  if (samplingInterval) return;
  samplingInterval = setInterval(sampleAll, intervalMs);
}

export function stopProcessSampling(): void {
  if (samplingInterval) {
    clearInterval(samplingInterval);
    samplingInterval = null;
  }
}

function sampleAll(): void {
  // Prune dead processes
  for (const [pid] of processes) {
    try {
      process.kill(pid, 0); // signal 0 = check if alive
    } catch {
      log(`PRUNE dead pid=${pid}`);
      processes.delete(pid);
    }
  }

  const pids = Array.from(processes.keys());
  if (pids.length === 0) return;

  // macOS: single ps call for all PIDs
  execFile("ps", ["-o", "pid=,rss=", "-p", pids.join(",")], { timeout: 5000 }, (err, stdout) => {
    if (err) return;
    for (const line of stdout.trim().split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const pid = parseInt(parts[0], 10);
        const rssKb = parseInt(parts[1], 10);
        const tracked = processes.get(pid);
        if (tracked && !isNaN(rssKb)) {
          tracked.lastRssKb = rssKb;
        }
      }
    }
  });
}

// Test helpers
export function _resetForTest(): void {
  processes.clear();
}

export function _setRssForTest(pid: number, rssKb: number): void {
  const tracked = processes.get(pid);
  if (tracked) tracked.lastRssKb = rssKb;
}
