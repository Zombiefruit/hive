import Database from "better-sqlite3";
import path from "node:path";
import { app } from "electron";
import type {
  Agent,
  AgentEvent,
  Approval,
  ContextRef,
  Message,
  SpawnAgentConfig,
} from "../../shared/types";
import { randomUUID } from "node:crypto";

let db: Database.Database;

function getDbPath(): string {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "claude-deck.db");
}

export function initDatabase(): void {
  db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  createTables();
  migrate();
}

function migrate(): void {
  // Add summary column to agents if it doesn't exist (added 2026-04-01)
  try {
    db.prepare("SELECT summary FROM agents LIMIT 0").run();
  } catch {
    try { db.exec("ALTER TABLE agents ADD COLUMN summary TEXT"); } catch {}
  }
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      sessionId TEXT,
      pid INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL DEFAULT 'deck',
      task TEXT NOT NULL,
      summary TEXT,
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      branch TEXT,
      cwd TEXT NOT NULL,
      parentAgentId TEXT,
      permissionMode TEXT NOT NULL DEFAULT 'default',
      maxBudgetUsd REAL,
      costUsd REAL NOT NULL DEFAULT 0,
      inputTokens INTEGER NOT NULL DEFAULT 0,
      outputTokens INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parentAgentId) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      toolCallsJson TEXT,
      costUsd REAL,
      tokenUsageJson TEXT,
      origin TEXT NOT NULL DEFAULT 'user',
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      toolName TEXT NOT NULL,
      toolInput TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      riskLevel TEXT NOT NULL DEFAULT 'low',
      status TEXT NOT NULL DEFAULT 'pending',
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS context_refs (
      id TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      type TEXT NOT NULL,
      resourceId TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      url TEXT,
      detectedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      metadataJson TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      source TEXT,
      accessCount INTEGER NOT NULL DEFAULT 0,
      lastAccessedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory_embeddings (
      memoryId TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      FOREIGN KEY (memoryId) REFERENCES memories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS insights (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      sourcesJson TEXT,
      relevanceScore REAL NOT NULL DEFAULT 0.5,
      impactEstimate TEXT NOT NULL DEFAULT 'medium',
      frequency INTEGER NOT NULL DEFAULT 1,
      firstSeenAt TEXT NOT NULL DEFAULT (datetime('now')),
      lastSeenAt TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'new',
      convertedToTaskId TEXT
    );

    CREATE TABLE IF NOT EXISTS insight_sources (
      channelId TEXT PRIMARY KEY,
      channelName TEXT NOT NULL,
      usefulness REAL NOT NULL DEFAULT 0.5,
      lastScannedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_agentId ON messages(agentId);
    CREATE INDEX IF NOT EXISTS idx_approvals_agentId ON approvals(agentId);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
    CREATE INDEX IF NOT EXISTS idx_context_refs_agentId ON context_refs(agentId);
    CREATE INDEX IF NOT EXISTS idx_events_agentId ON events(agentId);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_memories_confidence ON memories(confidence);
    CREATE INDEX IF NOT EXISTS idx_insights_status ON insights(status);
    CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);
  `);
}

// --- Agent CRUD ---

export function createAgent(config: SpawnAgentConfig): Agent {
  const id = randomUUID();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO agents (id, status, source, task, model, branch, cwd, parentAgentId, permissionMode, maxBudgetUsd, createdAt, updatedAt)
    VALUES (?, 'active', 'deck', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    config.task,
    config.model,
    config.branch ?? null,
    config.cwd,
    config.parentAgentId ?? null,
    config.permissionMode,
    config.maxBudgetUsd ?? null,
    now,
    now
  );
  return getAgent(id)!;
}

export function getAgent(id: string): Agent | undefined {
  return db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as
    | Agent
    | undefined;
}

export function getAllAgents(): Agent[] {
  return db.prepare("SELECT * FROM agents ORDER BY createdAt DESC").all() as Agent[];
}

/** Upsert an external (non-deck-spawned) agent from session discovery. */
export function upsertExternalAgent(
  sessionId: string,
  pid: number,
  cwd: string,
  startedAt: number,
  isAlive: boolean,
): void {
  const existing = db
    .prepare("SELECT id, source FROM agents WHERE sessionId = ?")
    .get(sessionId) as { id: string; source: string } | undefined;

  const status = isAlive ? "active" : "completed";
  const now = new Date().toISOString();
  const startedAtIso = new Date(startedAt).toISOString();

  if (existing) {
    // Don't downgrade deck-managed agents back to external
    if (existing.source === "deck") {
      db.prepare("UPDATE agents SET pid = ?, status = ?, updatedAt = ? WHERE id = ?")
        .run(pid, status, now, existing.id);
    } else {
      db.prepare("UPDATE agents SET pid = ?, status = ?, updatedAt = ? WHERE id = ?")
        .run(pid, status, now, existing.id);
    }
    return;
  } else {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO agents (id, sessionId, pid, status, source, task, model, cwd, permissionMode, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 'external', ?, 'unknown', ?, 'default', ?, ?)
    `).run(id, sessionId, pid, status, `Claude Code session (${cwd.split("/").pop()})`, cwd, startedAtIso, now);
  }
}

/** Remove stale external agents whose sessions no longer exist. */
export function cleanupStaleExternalAgents(activeSessionIds: Set<string>): void {
  const externals = db
    .prepare("SELECT id, sessionId FROM agents WHERE source = 'external'")
    .all() as Array<{ id: string; sessionId: string }>;
  for (const ext of externals) {
    if (!activeSessionIds.has(ext.sessionId)) {
      db.prepare("DELETE FROM agents WHERE id = ?").run(ext.id);
    }
  }
}

export function updateAgentTask(id: string, task: string, branch?: string): void {
  const now = new Date().toISOString();
  if (branch) {
    db.prepare("UPDATE agents SET task = ?, branch = ?, updatedAt = ? WHERE id = ?").run(task, branch, now, id);
  } else {
    db.prepare("UPDATE agents SET task = ?, updatedAt = ? WHERE id = ?").run(task, now, id);
  }
}

export function updateAgentSummary(id: string, summary: string): void {
  try {
    db.prepare("UPDATE agents SET summary = ?, updatedAt = ? WHERE id = ?").run(summary, new Date().toISOString(), id);
  } catch {
    // summary column may not exist in old databases — add it
    try {
      db.exec("ALTER TABLE agents ADD COLUMN summary TEXT");
      db.prepare("UPDATE agents SET summary = ?, updatedAt = ? WHERE id = ?").run(summary, new Date().toISOString(), id);
    } catch {}
  }
}

export function updateAgent(
  id: string,
  updates: Partial<Pick<Agent, "status" | "source" | "sessionId" | "pid" | "costUsd" | "inputTokens" | "outputTokens">>
): void {
  const fields = Object.entries(updates)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => `${k} = ?`);
  if (fields.length === 0) return;
  fields.push("updatedAt = ?");
  const values = Object.values(updates).filter((v) => v !== undefined);
  values.push(new Date().toISOString());
  values.push(id);
  db.prepare(`UPDATE agents SET ${fields.join(", ")} WHERE id = ?`).run(
    ...values
  );
}

export function deleteAgent(id: string): void {
  db.prepare("DELETE FROM agents WHERE id = ?").run(id);
}

// --- Messages ---

export function addMessage(
  agentId: string,
  role: Message["role"],
  content: string,
  opts?: { toolCallsJson?: string; costUsd?: number; tokenUsageJson?: string; origin?: Message["origin"] }
): Message {
  const id = randomUUID();
  const now = new Date().toISOString();
  const origin = opts?.origin ?? "user";
  db.prepare(
    `INSERT INTO messages (id, agentId, role, content, toolCallsJson, costUsd, tokenUsageJson, origin, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    agentId,
    role,
    content,
    opts?.toolCallsJson ?? null,
    opts?.costUsd ?? null,
    opts?.tokenUsageJson ?? null,
    origin,
    now
  );
  return { id, agentId, role, content, origin, toolCallsJson: opts?.toolCallsJson ?? null, costUsd: opts?.costUsd ?? null, tokenUsageJson: opts?.tokenUsageJson ?? null, timestamp: now };
}

export function getMessages(agentId: string): Message[] {
  return db
    .prepare("SELECT * FROM messages WHERE agentId = ? ORDER BY timestamp ASC")
    .all(agentId) as Message[];
}

// --- Approvals ---

export function createApproval(
  agentId: string,
  toolName: string,
  toolInput: string,
  description: string,
  riskLevel: Approval["riskLevel"]
): Approval {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO approvals (id, agentId, toolName, toolInput, description, riskLevel, status, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(id, agentId, toolName, toolInput, description, riskLevel, now);
  return { id, agentId, toolName, toolInput, description, riskLevel, status: "pending", timestamp: now };
}

export function resolveApproval(
  id: string,
  status: "approved" | "rejected"
): void {
  db.prepare("UPDATE approvals SET status = ? WHERE id = ?").run(status, id);
}

export function getPendingApprovals(): Approval[] {
  return db
    .prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY timestamp ASC")
    .all() as Approval[];
}

// --- Context Refs ---

export function addContextRef(
  agentId: string,
  type: ContextRef["type"],
  resourceId: string,
  title: string,
  url?: string
): ContextRef {
  const id = randomUUID();
  const now = new Date().toISOString();
  // Avoid duplicates
  const existing = db
    .prepare(
      "SELECT id FROM context_refs WHERE agentId = ? AND type = ? AND resourceId = ?"
    )
    .get(agentId, type, resourceId);
  if (existing) return existing as ContextRef;

  db.prepare(
    `INSERT INTO context_refs (id, agentId, type, resourceId, title, url, detectedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, agentId, type, resourceId, title, url ?? null, now);
  return { id, agentId, type, resourceId, title, url: url ?? null, detectedAt: now };
}

export function getContextRefs(agentId: string): ContextRef[] {
  return db
    .prepare("SELECT * FROM context_refs WHERE agentId = ? ORDER BY detectedAt ASC")
    .all(agentId) as ContextRef[];
}

export function getAllContextRefs(): ContextRef[] {
  return db.prepare("SELECT * FROM context_refs ORDER BY detectedAt DESC").all() as ContextRef[];
}

// --- Events ---

export function addEvent(
  agentId: string,
  type: string,
  summary: string,
  metadata?: Record<string, unknown>
): AgentEvent {
  const id = randomUUID();
  const now = new Date().toISOString();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  db.prepare(
    `INSERT INTO events (id, agentId, type, summary, metadataJson, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, agentId, type, summary, metadataJson, now);
  return { id, agentId, type, summary, metadataJson, timestamp: now };
}

export function getEvents(agentId: string): AgentEvent[] {
  return db
    .prepare("SELECT * FROM events WHERE agentId = ? ORDER BY timestamp ASC")
    .all(agentId) as AgentEvent[];
}

export function getRecentEvents(limit = 50): AgentEvent[] {
  return db
    .prepare("SELECT * FROM events ORDER BY timestamp DESC LIMIT ?")
    .all(limit) as AgentEvent[];
}

// --- Memory CRUD ---

export function insertMemory(
  id: string, scope: string, type: string, category: string,
  content: string, confidence: number, source?: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO memories (id, scope, type, category, content, confidence, source, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, scope, type, category, content, confidence, source ?? null, now, now);
}

export function getMemoryById(id: string): Record<string, unknown> | undefined {
  return db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as Record<string, unknown> | undefined;
}

export function getAllMemories(scope?: string, category?: string): Array<Record<string, unknown>> {
  let sql = "SELECT * FROM memories WHERE 1=1";
  const params: unknown[] = [];
  if (scope) { sql += " AND scope = ?"; params.push(scope); }
  if (category) { sql += " AND category = ?"; params.push(category); }
  sql += " ORDER BY confidence DESC, updatedAt DESC";
  return db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
}

export function updateMemory(id: string, changes: { confidence?: number; content?: string; accessCount?: number }): void {
  const now = new Date().toISOString();
  const sets: string[] = ["updatedAt = ?"];
  const params: unknown[] = [now];
  if (changes.confidence !== undefined) { sets.push("confidence = ?"); params.push(changes.confidence); }
  if (changes.content !== undefined) { sets.push("content = ?"); params.push(changes.content); }
  if (changes.accessCount !== undefined) { sets.push("accessCount = ?, lastAccessedAt = ?"); params.push(changes.accessCount, now); }
  params.push(id);
  db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function deleteMemory(id: string): void {
  db.prepare("DELETE FROM memories WHERE id = ?").run(id);
}

export function insertMemoryEmbedding(memoryId: string, embedding: Buffer): void {
  db.prepare("INSERT OR REPLACE INTO memory_embeddings (memoryId, embedding) VALUES (?, ?)").run(memoryId, embedding);
}

export function getMemoryEmbedding(memoryId: string): Buffer | undefined {
  const row = db.prepare("SELECT embedding FROM memory_embeddings WHERE memoryId = ?").get(memoryId) as { embedding: Buffer } | undefined;
  return row?.embedding;
}

export function getAllMemoryEmbeddings(): Array<{ memoryId: string; embedding: Buffer }> {
  return db.prepare("SELECT memoryId, embedding FROM memory_embeddings").all() as Array<{ memoryId: string; embedding: Buffer }>;
}

export function decayMemories(daysThreshold: number, decayFactor: number): number {
  const cutoff = new Date(Date.now() - daysThreshold * 86400000).toISOString();
  const result = db.prepare(
    `UPDATE memories SET confidence = MAX(0.1, confidence * ?), updatedAt = datetime('now')
     WHERE (lastAccessedAt IS NULL OR lastAccessedAt < ?) AND confidence > 0.1`,
  ).run(decayFactor, cutoff);
  return result.changes;
}

export function getMemoryStats(): { total: number; byScope: Record<string, number>; byCategory: Record<string, number> } {
  const total = (db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number }).c;
  const byScope = Object.fromEntries(
    (db.prepare("SELECT scope, COUNT(*) as c FROM memories GROUP BY scope").all() as Array<{ scope: string; c: number }>).map(r => [r.scope, r.c]),
  );
  const byCategory = Object.fromEntries(
    (db.prepare("SELECT category, COUNT(*) as c FROM memories GROUP BY category").all() as Array<{ category: string; c: number }>).map(r => [r.category, r.c]),
  );
  return { total, byScope, byCategory };
}

// --- Insight CRUD ---

export function insertInsight(insight: {
  id: string; type: string; title: string; description: string;
  sourcesJson?: string; relevanceScore?: number; impactEstimate?: string; frequency?: number;
}): void {
  db.prepare(
    `INSERT INTO insights (id, type, title, description, sourcesJson, relevanceScore, impactEstimate, frequency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(insight.id, insight.type, insight.title, insight.description,
    insight.sourcesJson ?? null, insight.relevanceScore ?? 0.5, insight.impactEstimate ?? "medium", insight.frequency ?? 1);
}

export function getInsights(status?: string): Array<Record<string, unknown>> {
  if (status) return db.prepare("SELECT * FROM insights WHERE status = ? ORDER BY relevanceScore DESC").all(status) as Array<Record<string, unknown>>;
  return db.prepare("SELECT * FROM insights ORDER BY relevanceScore DESC").all() as Array<Record<string, unknown>>;
}

export function updateInsight(id: string, changes: Record<string, unknown>): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(changes)) {
    sets.push(`${key} = ?`);
    params.push(value);
  }
  if (sets.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE insights SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function upsertInsightSource(channelId: string, channelName: string, usefulness?: number): void {
  db.prepare(
    `INSERT INTO insight_sources (channelId, channelName, usefulness, lastScannedAt) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(channelId) DO UPDATE SET channelName = ?, usefulness = COALESCE(?, usefulness), lastScannedAt = datetime('now')`,
  ).run(channelId, channelName, usefulness ?? 0.5, channelName, usefulness ?? null);
}

export function getInsightSources(): Array<{ channelId: string; channelName: string; usefulness: number; lastScannedAt: string | null }> {
  return db.prepare("SELECT * FROM insight_sources ORDER BY usefulness DESC").all() as Array<{ channelId: string; channelName: string; usefulness: number; lastScannedAt: string | null }>;
}

export function getDb(): Database.Database { return db; }

export function closeDatabase(): void {
  db?.close();
}
