/**
 * Memory Store — CRUD + semantic search over agent memories.
 * Uses SQLite for storage and fastembed for vector similarity.
 */

import { randomUUID } from "node:crypto";
import {
  insertMemory, getMemoryById, getAllMemories, updateMemory, deleteMemory,
  insertMemoryEmbedding, getAllMemoryEmbeddings,
  decayMemories as dbDecayMemories, getMemoryStats,
} from "../db/database";
import { embed, toBuffer, fromBuffer, cosineSimilarity } from "./embedder";
import type { Memory, MemoryInsert, MemoryQuery, MemorySearchResult } from "../../shared/memory-types";

const MERGE_SIMILARITY_THRESHOLD = 0.85;

/** Add a new memory, deduplicating against existing similar memories. */
export async function addMemory(input: MemoryInsert): Promise<Memory> {
  // Check for similar existing memories to merge
  const existing = await findSimilar(input.content, input.scope, MERGE_SIMILARITY_THRESHOLD);
  if (existing) {
    // Merge: boost confidence, update content if new version is longer
    const newConfidence = Math.min(1.0, existing.memory.confidence + 0.1);
    const newContent = input.content.length > existing.memory.content.length ? input.content : existing.memory.content;
    updateMemory(existing.memory.id, { confidence: newConfidence, content: newContent });
    return { ...existing.memory, confidence: newConfidence, content: newContent };
  }

  // Insert new memory
  const id = randomUUID();
  insertMemory(id, input.scope, input.type, input.category, input.content, input.confidence ?? 0.5, input.source);

  // Generate and store embedding
  try {
    const embedding = await embed(input.content);
    insertMemoryEmbedding(id, toBuffer(embedding));
  } catch {
    // Embedding failure is non-fatal — memory still stored, just not searchable
  }

  return getMemoryById(id) as unknown as Memory;
}

/** Semantic search: find memories most relevant to the given text. */
export async function queryMemories(query: MemoryQuery): Promise<MemorySearchResult[]> {
  const limit = query.limit ?? 10;
  const minConfidence = query.minConfidence ?? 0.1;

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embed(query.text);
  } catch {
    // Fallback: return keyword-matched memories sorted by confidence
    return keywordFallback(query.text, query.scope, query.category, limit);
  }

  // Get all embeddings and compute similarity
  const allEmbeddings = getAllMemoryEmbeddings();
  const memories = getAllMemories(query.scope, query.category);
  const memoryMap = new Map(memories.map(m => [m.id as string, m]));

  const scored: MemorySearchResult[] = [];
  for (const { memoryId, embedding } of allEmbeddings) {
    const mem = memoryMap.get(memoryId);
    if (!mem) continue;
    if ((mem.confidence as number) < minConfidence) continue;

    const similarity = cosineSimilarity(queryEmbedding, fromBuffer(embedding));
    if (similarity > 0.3) { // minimum relevance threshold
      scored.push({ memory: mem as unknown as Memory, similarity });
    }
  }

  // Sort by similarity * confidence (relevance-weighted)
  scored.sort((a, b) => (b.similarity * b.memory.confidence) - (a.similarity * a.memory.confidence));

  // Reinforce accessed memories
  const topResults = scored.slice(0, limit);
  for (const result of topResults) {
    updateMemory(result.memory.id, { accessCount: result.memory.accessCount + 1 });
  }

  return topResults;
}

/** Find a single memory similar to content (for dedup). */
async function findSimilar(content: string, scope?: string, threshold = MERGE_SIMILARITY_THRESHOLD): Promise<MemorySearchResult | null> {
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embed(content);
  } catch {
    return null;
  }

  const allEmbeddings = getAllMemoryEmbeddings();
  const memories = getAllMemories(scope);
  const memoryMap = new Map(memories.map(m => [m.id as string, m]));

  let best: MemorySearchResult | null = null;
  for (const { memoryId, embedding } of allEmbeddings) {
    const mem = memoryMap.get(memoryId);
    if (!mem) continue;

    const similarity = cosineSimilarity(queryEmbedding, fromBuffer(embedding));
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { memory: mem as unknown as Memory, similarity };
    }
  }

  return best;
}

/** Keyword fallback when embedder is unavailable. */
function keywordFallback(text: string, scope?: string, category?: string, limit = 10): MemorySearchResult[] {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const memories = getAllMemories(scope, category);

  return memories
    .map(m => {
      const content = (m.content as string).toLowerCase();
      const matchCount = words.filter(w => content.includes(w)).length;
      return { memory: m as unknown as Memory, similarity: words.length > 0 ? matchCount / words.length : 0 };
    })
    .filter(r => r.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** Decay unused memories (reduce confidence for stale entries). */
export function decayUnused(daysThreshold = 7, decayFactor = 0.9): number {
  return dbDecayMemories(daysThreshold, decayFactor);
}

/** Get memory statistics for the Settings UI. */
export function getStats() {
  return getMemoryStats();
}

/** Remove a memory by ID. */
export function removeMemory(id: string): void {
  deleteMemory(id);
}

/** Get all memories for a scope/category (direct access, no search). */
export function listMemories(scope?: string, category?: string): Memory[] {
  return getAllMemories(scope, category) as unknown as Memory[];
}
