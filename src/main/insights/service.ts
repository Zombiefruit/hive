/**
 * Insights Service — generates proactive insights by scanning Slack channels,
 * Gong calls, and Linear trends. Uses the MCP bridge to fetch data and
 * the memory system for relevance scoring.
 */

import { askMcpPlanningAgent } from "../mcp-bridge";
import { addDebugEntry } from "../mcp-bridge";
import { loadSkills } from "../../shared/skill-loader";
import {
  insertInsight, getInsights as dbGetInsights, updateInsight as dbUpdateInsight,
  upsertInsightSource, getInsightSources,
} from "../db/database";
import { getRelevantMemories, formatMemoriesForPrompt } from "../memory/service";
import { addMemory } from "../memory/store";
import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import type { Insight, InsightSource } from "../../shared/insight-types";

let isGenerating = false;

/**
 * Generate proactive insights by scanning multiple sources.
 * Uses the MCP bridge (full tool access) to read Slack, Gong, Linear.
 */
export async function generateInsights(
  userName: string,
  onProgress?: (msg: string) => void,
): Promise<Insight[]> {
  if (isGenerating) return [];
  isGenerating = true;

  try {
    addDebugEntry("in", "💡 [INSIGHTS] Starting generation", "insights");
    onProgress?.("Gathering source data...");

    // Get channel relevance from memory
    const knownSources = getInsightSources();
    const topChannels = knownSources
      .sort((a, b) => b.usefulness - a.usefulness)
      .slice(0, 10);

    // Get relevant memories for context
    const memories = await getRelevantMemories(
      "Proactive insights: feature ideas, customer pain points, trends, business priorities",
      "shared",
      10,
    ).catch(() => []);
    const memorySection = formatMemoriesForPrompt(memories);

    // Build the insights extraction prompt
    const skill = loadSkills(["extract-insights"]);
    const channelContext = topChannels.length > 0
      ? `\n## Channels to prioritize (by learned usefulness)\n${topChannels.map(c => `- #${c.channelName} (usefulness: ${c.usefulness.toFixed(2)})`).join("\n")}\n`
      : "";

    const prompt = `${skill}

## Context
You are scanning data sources for ${userName} to identify proactive insights.
${channelContext}
${memorySection ? `\n${memorySection}\n` : ""}
## Instructions
1. Search Slack channels for feature discussions, customer feedback, pain points, and team trends. Focus on channels with product, customer, or engineering discussions. Look especially at #customer-intel if it exists.
2. If Gong is available, check recent call summaries for customer themes.
3. Check Linear for ticket patterns — are certain areas getting repeated bugs? Are there stalled projects?

Scan broadly but filter aggressively. Only surface genuinely useful insights.

Return your insights as a JSON array.`;

    onProgress?.("Analyzing sources with AI...");

    const response = await askMcpPlanningAgent(prompt, 180000, (event) => {
      if (event.type === "tool_use") {
        onProgress?.(`Scanning: ${event.content.slice(0, 80)}`);
      }
    }, "claude-sonnet-4-6");

    // Parse insights from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      addDebugEntry("out", "💡 [INSIGHTS] No JSON found in response", "insights");
      return [];
    }

    let rawInsights: Array<{
      type: string; title: string; description: string;
      sources?: Array<{ type: string; label: string; url?: string }>;
      impactEstimate?: string; frequency?: number;
    }>;

    try {
      rawInsights = JSON.parse(jsonMatch[0]);
    } catch {
      addDebugEntry("out", "💡 [INSIGHTS] Failed to parse JSON", "insights");
      return [];
    }

    // Store insights in database
    const insights: Insight[] = [];
    for (const raw of rawInsights.slice(0, 15)) {
      const id = randomUUID();
      const insight: Insight = {
        id,
        type: (raw.type ?? "feature_idea") as Insight["type"],
        title: raw.title ?? "Untitled",
        description: raw.description ?? "",
        sources: raw.sources ?? [],
        relevanceScore: 0.5,
        impactEstimate: (raw.impactEstimate ?? "medium") as Insight["impactEstimate"],
        frequency: raw.frequency ?? 1,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        status: "new",
      };

      insertInsight({
        id, type: insight.type, title: insight.title, description: insight.description,
        sourcesJson: JSON.stringify(insight.sources), relevanceScore: insight.relevanceScore,
        impactEstimate: insight.impactEstimate, frequency: insight.frequency,
      });

      insights.push(insight);

      // Track channels as insight sources
      for (const src of insight.sources) {
        if (src.type === "slack" && src.label) {
          const channelMatch = src.label.match(/#([\w-]+)/);
          if (channelMatch) {
            upsertInsightSource(channelMatch[1], channelMatch[1]);
          }
        }
      }
    }

    addDebugEntry("out", `💡 [INSIGHTS] Generated ${insights.length} insights`, "insights");
    onProgress?.(`Found ${insights.length} insights`);

    // Broadcast to UI
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("insights:update", insights);
      }
    }

    return insights;
  } catch (err) {
    addDebugEntry("out", `❌ [INSIGHTS] Error: ${String(err).slice(0, 100)}`, "insights");
    return [];
  } finally {
    isGenerating = false;
  }
}

/** Get all stored insights. */
export function getStoredInsights(status?: string): Insight[] {
  const rows = dbGetInsights(status);
  return rows.map(r => ({
    id: r.id as string,
    type: r.type as Insight["type"],
    title: r.title as string,
    description: r.description as string,
    sources: r.sourcesJson ? JSON.parse(r.sourcesJson as string) : [],
    relevanceScore: r.relevanceScore as number,
    impactEstimate: r.impactEstimate as Insight["impactEstimate"],
    frequency: r.frequency as number,
    firstSeenAt: r.firstSeenAt as string,
    lastSeenAt: r.lastSeenAt as string,
    status: r.status as Insight["status"],
    convertedToTaskId: r.convertedToTaskId as string | undefined,
  }));
}

/** Update insight status (acknowledge, dismiss, convert). */
export function updateInsightStatus(id: string, status: Insight["status"], convertedToTaskId?: string): void {
  const changes: Record<string, unknown> = { status };
  if (convertedToTaskId) changes.convertedToTaskId = convertedToTaskId;
  dbUpdateInsight(id, changes);
}

/** Score a channel as useful or not useful (learning loop). */
export async function scoreChannel(channelId: string, channelName: string, useful: boolean): Promise<void> {
  const sources = getInsightSources();
  const existing = sources.find(s => s.channelId === channelId);
  const currentUsefulness = existing?.usefulness ?? 0.5;
  const newUsefulness = useful
    ? Math.min(1.0, currentUsefulness + 0.1)
    : Math.max(0.0, currentUsefulness - 0.1);

  upsertInsightSource(channelId, channelName, newUsefulness);

  // Also store as a memory for cross-session persistence
  await addMemory({
    scope: "shared",
    type: "feedback",
    category: "business",
    content: `Channel #${channelName} is ${useful ? "useful" : "not useful"} for insights (score: ${newUsefulness.toFixed(1)})`,
    confidence: 0.7,
    source: "insights-channel-scoring",
  });
}

/** Get all tracked insight sources with their scores. */
export function getTrackedSources(): InsightSource[] {
  return getInsightSources().map(s => ({
    channelId: s.channelId,
    channelName: s.channelName,
    usefulness: s.usefulness,
    lastScannedAt: s.lastScannedAt ?? undefined,
  }));
}
