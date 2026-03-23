import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");

export interface HistoricalSession {
  sessionId: string;
  firstPrompt: string;
  fileSize: number;
  lastModified: number;
  cwd: string;
  messageCount: number;
}

function extractFirstPrompt(filePath: string): { prompt: string; messageCount: number } {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");
  let prompt = "";
  let messageCount = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      if (d.type === "user" || d.type === "assistant") messageCount++;
      if (!prompt && d.type === "user") {
        const content = d.message?.content;
        if (typeof content === "string") {
          prompt = content.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
        } else if (Array.isArray(content)) {
          for (const b of content) {
            if (b.type === "text" && b.text) {
              prompt = b.text.replace(/\s+/g, " ").trim().slice(0, 120);
              break;
            }
          }
        }
      }
      if (prompt && messageCount > 20) break; // Good enough estimate
    } catch {}
  }

  return { prompt: prompt || "Untitled session", messageCount };
}

/**
 * List all historical sessions from ~/.claude/projects/.
 * Returns sessions sorted by last modified (newest first).
 */
export function listAllSessions(): HistoricalSession[] {
  const sessions: HistoricalSession[] = [];
  const projectsDir = path.join(CLAUDE_DIR, "projects");
  if (!fs.existsSync(projectsDir)) return sessions;

  for (const dir of fs.readdirSync(projectsDir)) {
    const projectPath = path.join(projectsDir, dir);
    if (!fs.statSync(projectPath).isDirectory()) continue;

    // Decode cwd from directory name
    const cwd = dir.replace(/^-/, "/").replace(/-/g, "/");

    const files = fs.readdirSync(projectPath).filter(f => f.endsWith(".jsonl"));
    for (const file of files) {
      const filePath = path.join(projectPath, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.size < 100) continue; // Skip tiny/empty files

        const sessionId = file.replace(".jsonl", "");
        const { prompt, messageCount } = extractFirstPrompt(filePath);

        sessions.push({
          sessionId,
          firstPrompt: prompt,
          fileSize: stats.size,
          lastModified: stats.mtimeMs,
          cwd,
          messageCount,
        });
      } catch {}
    }
  }

  sessions.sort((a, b) => b.lastModified - a.lastModified);
  return sessions;
}
