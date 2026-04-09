/**
 * Business Context — agent-maintained living document that grounds all agents
 * in the company's mission, priorities, and current state.
 * Refreshed weekly via MCP bridge scan, stored as a markdown file.
 */

import { askMcpPlanningAgent, askEphemeralProcess, addDebugEntry, type PlanningEvent } from "./mcp-bridge";
import { loadSkillTemplate } from "../shared/skill-loader";
import { getConfig } from "./config";
import { BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CONTEXT_PATH = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "business-context.md");
const SUMMARY_PATH = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "business-context-summary.txt");
const LOG_PATH = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "business-context.log");

function log(msg: string): void {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

/** Load the current business context document. Returns empty string if not found. */
export function loadBusinessContext(): string {
  try {
    return fs.readFileSync(CONTEXT_PATH, "utf-8");
  } catch {
    return "";
  }
}

/** Save the business context document. */
export function saveBusinessContext(content: string): void {
  const dir = path.dirname(CONTEXT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONTEXT_PATH, content, "utf-8");
}

/** Load the Haiku-generated summary (1-2 paragraphs). Returns empty string if not available. */
export function loadBusinessContextSummary(): string {
  try {
    return fs.readFileSync(SUMMARY_PATH, "utf-8").trim();
  } catch {
    return "";
  }
}

/** Save the Haiku-generated summary. */
function saveBusinessContextSummary(summary: string): void {
  const dir = path.dirname(SUMMARY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SUMMARY_PATH, summary, "utf-8");
}

/**
 * Get a brief business context summary for prompt grounding.
 * Uses the Haiku-generated summary if available, otherwise builds a minimal one-liner.
 * This is intentionally short — agents should use MCP tools to fetch details they need.
 */
export function getBusinessContextForPrompt(): string {
  const summary = loadBusinessContextSummary();
  if (summary) return `\n## Business Context\n${summary}\n`;

  // Minimal fallback from structured data
  const full = loadBusinessContext();
  if (!full) return "";
  try {
    const parsed = JSON.parse(full);
    return `\n## Business Context\n${parsed.company?.name ?? "Company"} — ${parsed.company?.mission ?? ""}\n`;
  } catch {
    return "";
  }
}

/** Check if the context needs refreshing (older than 7 days). */
export function needsRefresh(): boolean {
  try {
    const stat = fs.statSync(CONTEXT_PATH);
    return Date.now() - stat.mtimeMs > 7 * 86400000;
  } catch {
    return true; // File doesn't exist
  }
}

/**
 * Refresh the business context by scanning all sources via MCP.
 * Returns the new context document for user review.
 */
export async function refreshBusinessContext(
  onProgress?: (msg: string) => void,
): Promise<string> {
  const config = getConfig();
  const userName = config?.name ?? "User";
  const companyName = "Monte Carlo Data";

  addDebugEntry("in", "🏢 [CONTEXT] Starting business context refresh", "context");
  log("🏢 [CONTEXT] Starting refresh");
  onProgress?.("Scanning sources for business context...");

  let prompt: string;
  try {
    prompt = loadSkillTemplate("refresh-business-context", {
      COMPANY_NAME: companyName,
      USER_NAME: userName,
      DATE: new Date().toISOString().split("T")[0],
    });
    log(`🏢 [CONTEXT] Skill loaded: ${prompt.length} chars`);
  } catch (err) {
    log(`🏢 [CONTEXT] Skill load FAILED: ${String(err).slice(0, 200)}`);
    addDebugEntry("out", `❌ [CONTEXT] Skill load failed: ${String(err).slice(0, 100)}`, "context");
    return "";
  }

  if (!prompt || prompt.length < 50) {
    log(`🏢 [CONTEXT] Skill template empty or too short (${prompt?.length ?? 0} chars)`);
    addDebugEntry("out", "❌ [CONTEXT] Skill template empty", "context");
    return "";
  }

  try {
    log("🏢 [CONTEXT] Spawning MCP planning agent...");
    const response = await askMcpPlanningAgent(prompt, undefined, (event: PlanningEvent) => {
      if (event.type === "tool_use") {
        log(`🏢 [CONTEXT] Tool: ${event.content.slice(0, 80)}`);
        onProgress?.(`Scanning: ${event.content.slice(0, 60)}`);
      } else if (event.type === "status") {
        log(`🏢 [CONTEXT] Status: ${event.content}`);
      }
    }, "claude-sonnet-4-6");

    log(`🏢 [CONTEXT] Agent returned: ${response.length} chars`);

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*"company"[\s\S]*\}/);
    let context: string;
    if (jsonMatch) {
      // Find matching closing brace
      let depth = 0, end = 0;
      for (let i = 0; i < jsonMatch[0].length; i++) {
        if (jsonMatch[0][i] === "{") depth++;
        else if (jsonMatch[0][i] === "}") depth--;
        if (depth === 0) { end = i + 1; break; }
      }
      context = jsonMatch[0].slice(0, end);
      // Validate it parses
      try { JSON.parse(context); } catch { context = response; }
    } else {
      context = response;
    }

    addDebugEntry("out", `🏢 [CONTEXT] Generated: ${context.length} chars`, "context");
    log(`🏢 [CONTEXT] Final context: ${context.length} chars`);
    onProgress?.("Verifying context...");

    // Run business context judge to validate team members and flag stale info
    try {
      const { judgeBusinessContext } = await import("./judge-bridge");
      const verdict = await judgeBusinessContext(context, {
        name: userName,
        managerName: config?.managerName,
        coworkers: config?.coworkers ?? [],
      });

      if (verdict) {
        log(`🏢 [CONTEXT] Judge verdict: ${verdict.status} (${verdict.confidence}/10, ${verdict.staleTeamMembers.length} stale, ${verdict.missingPeople.length} missing)`);

        // Auto-fix: remove stale team members — but NEVER remove executives/leadership
        // The config only has immediate team, so C-suite/VPs won't be there.
        // Only remove people the judge flagged AND who have non-leadership roles.
        const PROTECTED_ROLES = /ceo|cto|cfo|coo|cpo|vp|vice president|chief|founder|co-founder|president|director|head of/i;
        if (verdict.staleTeamMembers.length > 0) {
          try {
            const parsed = JSON.parse(context);
            if (parsed.team) {
              const staleNames = new Set(verdict.staleTeamMembers.map((s: { name: string }) => s.name.toLowerCase()));
              const before = parsed.team.length;
              parsed.team = parsed.team.filter((t: { name: string; role?: string }) => {
                if (!staleNames.has(t.name.toLowerCase())) return true;
                // Keep executives even if not in config
                if (t.role && PROTECTED_ROLES.test(t.role)) {
                  log(`🏢 [CONTEXT] Kept ${t.name} (${t.role}) — protected leadership role`);
                  return true;
                }
                return false;
              });
              const removed = before - parsed.team.length;
              if (removed > 0) {
                log(`🏢 [CONTEXT] Removed ${removed} stale team members`);
                context = JSON.stringify(parsed, null, 2);
              }
            }
          } catch {}
        }

        // Auto-fix: add missing people
        if (verdict.missingPeople.length > 0) {
          try {
            const parsed = JSON.parse(context);
            if (!parsed.team) parsed.team = [];
            for (const missing of verdict.missingPeople) {
              if (!parsed.team.some((t: { name: string }) => t.name.toLowerCase() === missing.name.toLowerCase())) {
                parsed.team.push({ name: missing.name, role: missing.role, focus: `Added by judge — was missing from context` });
                log(`🏢 [CONTEXT] Added missing person: ${missing.name} (${missing.role})`);
              }
            }
            context = JSON.stringify(parsed, null, 2);
          } catch {}
        }
      }
    } catch (err) {
      log(`🏢 [CONTEXT] Judge error (non-fatal): ${String(err).slice(0, 100)}`);
    }

    onProgress?.("Business context ready.");

    // Save automatically
    if (context.length > 50) {
      saveBusinessContext(context);
      log("🏢 [CONTEXT] Auto-saved to disk");

      // Generate a Haiku summary (1-2 paragraphs) for prompt grounding.
      // Agents use MCP tools for details — this is just quick orientation.
      try {
        log("🏢 [CONTEXT] Generating Haiku summary...");
        const summaryPrompt = `Summarize this business context in 2 short paragraphs (max 400 chars total). First paragraph: company mission and top priorities. Second paragraph: current product focus and key themes. Be specific and concise — this will orient AI agents before they fetch details via tools.\n\n${context}`;
        const summary = await askEphemeralProcess(summaryPrompt, 30000, "claude-haiku-4-5-20251001");
        if (summary && summary.length > 50 && summary.length < 800) {
          saveBusinessContextSummary(summary);
          log(`🏢 [CONTEXT] Summary saved: ${summary.length} chars`);
        }
      } catch (err) {
        log(`🏢 [CONTEXT] Summary generation failed (non-fatal): ${String(err).slice(0, 100)}`);
      }
    }

    // Broadcast to UI
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("business-context:draft", context);
      }
    }

    return context;
  } catch (err) {
    log(`🏢 [CONTEXT] ERROR: ${String(err).slice(0, 200)}`);
    addDebugEntry("out", `❌ [CONTEXT] Error: ${String(err).slice(0, 100)}`, "context");
    onProgress?.("Failed to refresh business context.");
    return "";
  }
}
