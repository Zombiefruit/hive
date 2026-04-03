/**
 * Memory Service — high-level API used by judges, insights engine, and UI.
 * Wraps the store and extractor with convenient functions.
 */

import { addMemory, queryMemories, decayUnused, getStats, listMemories, removeMemory } from "./store";
import { extractMemories, memoryFromUserAnswer } from "./extractor";
import type { Memory, MemoryInsert, MemorySearchResult, MemoryScope } from "../../shared/memory-types";

/**
 * Get memories relevant to a task context, scoped to a specific agent type.
 * Returns both agent-specific and shared memories.
 */
export async function getRelevantMemories(
  context: string,
  agentScope?: MemoryScope,
  limit = 10,
): Promise<MemorySearchResult[]> {
  // Query both the agent's own scope and shared memories
  const scoped = agentScope
    ? await queryMemories({ text: context, scope: agentScope, limit: Math.ceil(limit / 2) })
    : [];
  const shared = await queryMemories({ text: context, scope: "shared", limit: Math.ceil(limit / 2) });

  // Merge, dedup by memory ID, sort by weighted relevance
  const seen = new Set<string>();
  const merged: MemorySearchResult[] = [];
  for (const result of [...scoped, ...shared]) {
    if (!seen.has(result.memory.id)) {
      seen.add(result.memory.id);
      merged.push(result);
    }
  }

  return merged
    .sort((a, b) => (b.similarity * b.memory.confidence) - (a.similarity * a.memory.confidence))
    .slice(0, limit);
}

/**
 * Format memories for injection into an agent prompt.
 */
export function formatMemoriesForPrompt(memories: MemorySearchResult[]): string {
  if (memories.length === 0) return "";
  const lines = memories.map(
    m => `- [${m.memory.category}] ${m.memory.content} (confidence: ${m.memory.confidence.toFixed(1)})`,
  );
  return `## What I've learned about this user\n${lines.join("\n")}`;
}

/**
 * Learn from a completed conversation (e.g., after a judge finishes).
 */
export async function learnFromConversation(
  conversation: Array<{ role: string; content: string }>,
  agentType: "triage" | "planning" | "work",
): Promise<Memory[]> {
  const inserts = await extractMemories({ conversation, agentType });
  const stored: Memory[] = [];
  for (const insert of inserts) {
    const memory = await addMemory(insert);
    stored.push(memory);
  }
  return stored;
}

/**
 * Learn from a user's direct answer to a judge question.
 */
export async function learnFromUserAnswer(
  question: string,
  answer: string,
  agentType: string,
): Promise<Memory> {
  const insert = memoryFromUserAnswer(question, answer, agentType);
  return addMemory(insert);
}

/**
 * Record when a user overrides triage (priority change, dismiss, etc.).
 */
export async function learnFromTriageOverride(
  title: string,
  action: "priority_change" | "dismissed" | "reclassified",
  details: string,
): Promise<Memory> {
  return addMemory({
    scope: "triage",
    type: "feedback",
    category: "priorities",
    content: `User ${action}: "${title}" — ${details}`,
    confidence: 0.85,
    source: "triage-override",
  });
}

/**
 * Get all memories about a specific person.
 */
export async function getPersonMemories(name: string): Promise<MemorySearchResult[]> {
  return queryMemories({ text: `person ${name}`, category: "people", limit: 5 });
}

/**
 * Get all priority/impact guidance memories.
 */
export function getPriorityGuidance(): Memory[] {
  return [
    ...listMemories(undefined, "priorities"),
    ...listMemories(undefined, "impact"),
  ];
}

/**
 * Run periodic maintenance: decay unused memories.
 */
export function runMaintenance(): { decayed: number } {
  const decayed = decayUnused(7, 0.9);
  return { decayed };
}

/**
 * Get stats for the Settings UI.
 */
export function getMemoryStats() {
  return getStats();
}

/**
 * Delete a specific memory (from Settings UI).
 */
export function deleteMemory(id: string): void {
  removeMemory(id);
}

/**
 * List all memories (for Settings UI).
 */
export function getAllMemoriesList(scope?: MemoryScope): Memory[] {
  return listMemories(scope);
}
