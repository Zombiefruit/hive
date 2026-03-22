import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

export interface DiscoveredSession {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  isAlive: boolean;
}

const SESSIONS_DIR = path.join(os.homedir(), ".claude", "sessions");

/** Check if a PID is alive and is actually a Claude process. */
function isClaudeProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 = check if alive
  } catch {
    return false;
  }

  // Verify it's actually a Claude process (avoid PID recycling false positives)
  try {
    const comm = execSync(`ps -p ${pid} -o comm=`, { encoding: "utf-8" }).trim();
    return comm.includes("claude");
  } catch {
    return false;
  }
}

/** Read a single session file. */
function readSessionFile(filePath: string): DiscoveredSession | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (!data.pid || !data.sessionId) return null;
    return {
      pid: data.pid,
      sessionId: data.sessionId,
      cwd: data.cwd ?? "",
      startedAt: data.startedAt ?? 0,
      isAlive: isClaudeProcessAlive(data.pid),
    };
  } catch {
    return null;
  }
}

/** Scan all session files and return discovered sessions. */
export function discoverSessions(): DiscoveredSession[] {
  if (!fs.existsSync(SESSIONS_DIR)) return [];

  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  const sessions: DiscoveredSession[] = [];

  for (const file of files) {
    const session = readSessionFile(path.join(SESSIONS_DIR, file));
    if (session) sessions.push(session);
  }

  return sessions;
}

/** Get only live (running) sessions. */
export function discoverLiveSessions(): DiscoveredSession[] {
  return discoverSessions().filter((s) => s.isAlive);
}

/** Watch for new session files. Returns a cleanup function. */
export function watchSessions(
  onUpdate: (sessions: DiscoveredSession[]) => void
): () => void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  const watcher = fs.watch(SESSIONS_DIR, { persistent: false }, () => {
    // Debounce slightly to let file writes complete
    setTimeout(() => {
      onUpdate(discoverSessions());
    }, 100);
  });

  // Also poll every 5s for liveness changes (a process may have exited)
  const pollInterval = setInterval(() => {
    onUpdate(discoverSessions());
  }, 5000);

  return () => {
    watcher.close();
    clearInterval(pollInterval);
  };
}
