/**
 * Persistent token-usage ledger.
 *
 * Stores an append-only array of UsageEntry in `usage-ledger.json` inside
 * Electron's userData directory. Survives database resets (`dev:clean`).
 *
 * - Atomic writes (write-to-tmp + rename).
 * - Debounced flush (at most once every 5 s).
 * - In-memory daily aggregation index for fast queries.
 * - Auto-rotation when file exceeds 10 MB (keeps last 90 days).
 */

import { app } from "electron";
import { readFileSync, writeFileSync, renameSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { UsageEntry, UsageSource, DailyUsage, UsageSummary } from "../shared/usage-types";

// ---------------------------------------------------------------------------
// Model pricing (per million tokens)
// ---------------------------------------------------------------------------

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-opus-4-6[1m]": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4 },
  "claude-haiku-4-5": { input: 0.80, output: 4 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-opus-4-5": { input: 15, output: 75 },
};

const FALLBACK_PRICING = MODEL_PRICING["claude-sonnet-4-6"];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEDGER_FILENAME = "usage-ledger.json";
const FLUSH_INTERVAL_MS = 5_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const RETENTION_DAYS = 90;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let entries: UsageEntry[] = [];
let dailyIndex: Map<string, DailyUsage> = new Map();
let initialized = false;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ledgerPath(): string {
  return join(app.getPath("userData"), LEDGER_FILENAME);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function emptyDailyUsage(date: string): DailyUsage {
  return {
    date,
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    callCount: 0,
    bySource: {},
    byModel: {},
  };
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? FALLBACK_PRICING;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Daily index management
// ---------------------------------------------------------------------------

function addEntryToIndex(entry: UsageEntry): void {
  const date = entry.timestamp.slice(0, 10);
  let day = dailyIndex.get(date);
  if (!day) {
    day = emptyDailyUsage(date);
    dailyIndex.set(date, day);
  }

  day.totalCostUsd += entry.costUsd;
  day.totalInputTokens += entry.inputTokens;
  day.totalOutputTokens += entry.outputTokens;
  day.callCount += 1;

  // By source
  const src = day.bySource[entry.source];
  if (src) {
    src.costUsd += entry.costUsd;
    src.callCount += 1;
  } else {
    day.bySource[entry.source] = { costUsd: entry.costUsd, callCount: 1 };
  }

  // By model
  const mdl = day.byModel[entry.model];
  if (mdl) {
    mdl.costUsd += entry.costUsd;
    mdl.callCount += 1;
    mdl.inputTokens += entry.inputTokens;
    mdl.outputTokens += entry.outputTokens;
  } else {
    day.byModel[entry.model] = {
      costUsd: entry.costUsd,
      callCount: 1,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
    };
  }
}

function buildDailyIndex(): void {
  dailyIndex = new Map();
  for (const entry of entries) {
    addEntryToIndex(entry);
  }
}

// ---------------------------------------------------------------------------
// Disk I/O
// ---------------------------------------------------------------------------

function loadFromDisk(): void {
  const fp = ledgerPath();
  if (!existsSync(fp)) {
    entries = [];
    buildDailyIndex();
    return;
  }

  try {
    const raw = readFileSync(fp, "utf-8");
    const parsed = JSON.parse(raw);
    entries = Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupted file — start fresh but don't delete; user can recover manually.
    entries = [];
  }

  buildDailyIndex();
}

function flushToDisk(): void {
  if (!dirty) return;

  const fp = ledgerPath();
  const tmp = fp + ".tmp";

  try {
    writeFileSync(tmp, JSON.stringify(entries), "utf-8");
    renameSync(tmp, fp);
    dirty = false;
  } catch {
    // Best-effort — data is still in memory and will retry on next flush.
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToDisk();
    rotateLedger();
  }, FLUSH_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

function rotateLedger(): void {
  const fp = ledgerPath();
  if (!existsSync(fp)) return;

  try {
    const { size } = statSync(fp);
    if (size <= MAX_FILE_BYTES) return;
  } catch {
    return;
  }

  const cutoff = dateNDaysAgo(RETENTION_DAYS);
  entries = entries.filter((e) => e.timestamp.slice(0, 10) >= cutoff);
  buildDailyIndex();
  dirty = true;
  flushToDisk();
}

// ---------------------------------------------------------------------------
// Lazy init
// ---------------------------------------------------------------------------

function ensureInit(): void {
  if (initialized) return;
  initialized = true;
  loadFromDisk();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function recordUsage(entry: Omit<UsageEntry, "id">): void {
  ensureInit();

  const full: UsageEntry = {
    ...entry,
    id: randomUUID(),
    costUsd: entry.costUsd || estimateCost(entry.model, entry.inputTokens, entry.outputTokens),
  };

  entries.push(full);
  addEntryToIndex(full);
  dirty = true;
  scheduleFlush();
}

export function getDailyUsage(date: string): DailyUsage {
  ensureInit();
  return dailyIndex.get(date) ?? emptyDailyUsage(date);
}

export function getUsageSummary(): UsageSummary {
  ensureInit();

  const today = todayKey();

  const last7Days: DailyUsage[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = dateNDaysAgo(i);
    last7Days.push(dailyIndex.get(d) ?? emptyDailyUsage(d));
  }

  const last30Days: DailyUsage[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = dateNDaysAgo(i);
    last30Days.push(dailyIndex.get(d) ?? emptyDailyUsage(d));
  }

  let allTimeCostUsd = 0;
  let allTimeCallCount = 0;
  for (const day of dailyIndex.values()) {
    allTimeCostUsd += day.totalCostUsd;
    allTimeCallCount += day.callCount;
  }

  return {
    today: dailyIndex.get(today) ?? emptyDailyUsage(today),
    last7Days,
    last30Days,
    allTimeCostUsd,
    allTimeCallCount,
  };
}

export function getRecentEntries(limit = 100): UsageEntry[] {
  ensureInit();
  return entries.slice(-limit).reverse();
}
