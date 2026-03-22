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

    CREATE INDEX IF NOT EXISTS idx_messages_agentId ON messages(agentId);
    CREATE INDEX IF NOT EXISTS idx_approvals_agentId ON approvals(agentId);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
    CREATE INDEX IF NOT EXISTS idx_context_refs_agentId ON context_refs(agentId);
    CREATE INDEX IF NOT EXISTS idx_events_agentId ON events(agentId);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
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
    .prepare("SELECT id FROM agents WHERE sessionId = ? AND source = 'external'")
    .get(sessionId) as { id: string } | undefined;

  const status = isAlive ? "active" : "completed";
  const now = new Date().toISOString();
  const startedAtIso = new Date(startedAt).toISOString();

  if (existing) {
    db.prepare("UPDATE agents SET pid = ?, status = ?, updatedAt = ? WHERE id = ?")
      .run(pid, status, now, existing.id);
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

export function updateAgent(
  id: string,
  updates: Partial<Pick<Agent, "status" | "sessionId" | "pid" | "costUsd" | "inputTokens" | "outputTokens">>
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

export function closeDatabase(): void {
  db?.close();
}
