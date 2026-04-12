/**
 * Setup Agent — auto-discovers user configuration via MCP tools.
 * Uses the discover-workspace skill. Re-runnable from Settings.
 * Stores discovered context as agent memories for future use.
 */

import { askMcpPlanningAgent, addDebugEntry, type PlanningEvent } from "./mcp-bridge";
import { loadSkillTemplate } from "../shared/skill-loader";
import { BrowserWindow } from "electron";

export interface DiscoveredConfig {
  slackUserId?: string;
  slackWorkspace?: string;
  linearUsername?: string;
  managerName?: string;
  teamName?: string;
  role?: string;
  timezone?: string;
  coworkers?: Array<{ name: string; role: string; slackUserId?: string }>;
  slackChannels?: Array<{ id: string; name: string }>;
  integrations?: Record<string, boolean>;
  discoveredContext?: {
    workingHours?: { start: string; end: string };
    heavyMeetingDays?: string[];
    regularMeetings?: string[];
    activeProjects?: string[];
    frequentCollaborators?: string[];
  };
}

/**
 * Run the setup agent to auto-discover configuration.
 * Broadcasts progress events to the renderer.
 */
export async function runSetupAgent(
  name: string,
  email: string,
  onProgress?: (msg: string) => void,
): Promise<DiscoveredConfig> {
  addDebugEntry("in", `🔧 [SETUP] Starting auto-discovery for ${name} (${email})`, "setup");

  const broadcastProgress = (msg: string) => {
    onProgress?.(msg);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("setup:progress", msg);
      }
    }
  };

  broadcastProgress("Connecting to your workspace tools...");

  const prompt = loadSkillTemplate("discover-workspace", {
    USER_NAME: name,
    USER_EMAIL: email,
  });

  try {
    const response = await askMcpPlanningAgent(prompt, undefined, (event: PlanningEvent) => {
      if (event.type === "tool_use") {
        const toolMatch = event.content.match(/Tool:\s*(\S+)/);
        if (toolMatch) {
          const tool = toolMatch[1];
          if (tool.includes("Slack")) broadcastProgress("Discovering Slack identity & channels...");
          else if (tool.includes("Linear")) broadcastProgress("Finding Linear account & team...");
          else if (tool.includes("Gmail")) broadcastProgress("Analyzing email patterns...");
          else if (tool.includes("Calendar")) broadcastProgress("Reading calendar for team structure...");
          else if (tool.includes("Notion")) broadcastProgress("Checking Notion access...");
          else if (tool.includes("Gong")) broadcastProgress("Checking Gong access...");
        }
      }
    }, "claude-sonnet-4-6");

    // Parse JSON from response
    const start = response.indexOf("{");
    if (start === -1) {
      addDebugEntry("out", "🔧 [SETUP] No JSON found in response", "setup");
      broadcastProgress("Discovery finished — no structured data found.");
      return {};
    }

    let depth = 0;
    let end = start;
    for (let i = start; i < response.length; i++) {
      if (response[i] === "{") depth++;
      else if (response[i] === "}") depth--;
      if (depth === 0) { end = i + 1; break; }
    }

    const config: DiscoveredConfig = JSON.parse(response.slice(start, end));
    addDebugEntry("out", `🔧 [SETUP] Discovered: slack=${config.slackUserId ?? "?"}, linear=${config.linearUsername ?? "?"}, ${config.slackChannels?.length ?? 0} channels, ${config.coworkers?.length ?? 0} coworkers`, "setup");

    // Store discovered context as memories for future agent use
    if (config.discoveredContext) {
      try {
        const { addMemory } = await import("./memory/store");
        const ctx = config.discoveredContext;

        if (ctx.activeProjects?.length) {
          await addMemory({
            scope: "shared", type: "context", category: "business",
            content: `Active projects: ${ctx.activeProjects.join(", ")}`,
            confidence: 0.8, source: "setup-discovery",
          });
        }
        if (ctx.regularMeetings?.length) {
          await addMemory({
            scope: "shared", type: "fact", category: "workflow",
            content: `Regular meetings: ${ctx.regularMeetings.join("; ")}`,
            confidence: 0.9, source: "setup-discovery",
          });
        }
        if (ctx.heavyMeetingDays?.length) {
          await addMemory({
            scope: "shared", type: "fact", category: "workflow",
            content: `Heavy meeting days: ${ctx.heavyMeetingDays.join(", ")} — prefer deep work on other days`,
            confidence: 0.8, source: "setup-discovery",
          });
        }
        if (ctx.frequentCollaborators?.length) {
          for (const person of ctx.frequentCollaborators.slice(0, 5)) {
            await addMemory({
              scope: "shared", type: "relationship", category: "people",
              content: `${person} is a frequent collaborator (discovered from email/calendar patterns)`,
              confidence: 0.7, source: "setup-discovery",
            });
          }
        }
        if (config.coworkers?.length) {
          for (const cw of config.coworkers) {
            await addMemory({
              scope: "shared", type: "relationship", category: "people",
              content: `${cw.name} — ${cw.role}${cw.slackUserId ? ` (Slack: ${cw.slackUserId})` : ""}`,
              confidence: 0.9, source: "setup-discovery",
            });
          }
        }
      } catch {
        // Memory storage failure is non-fatal
      }
    }

    broadcastProgress("Setup complete!");
    return config;
  } catch (err) {
    addDebugEntry("out", `❌ [SETUP] Error: ${String(err).slice(0, 100)}`, "setup");
    broadcastProgress("Setup failed — please configure manually.");
    return {};
  }
}
