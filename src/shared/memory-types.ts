/**
 * Agent memory types — persistent knowledge that agents learn over time.
 */

export type MemoryScope = "shared" | "triage" | "planning" | "work";
export type MemoryType = "preference" | "fact" | "relationship" | "procedure" | "context" | "feedback";
export type MemoryCategory = "people" | "priorities" | "business" | "workflow" | "coding" | "communication" | "impact";

export interface Memory {
  id: string;
  scope: MemoryScope;
  type: MemoryType;
  category: MemoryCategory;
  content: string;
  confidence: number;       // 0.0-1.0
  source?: string;          // What conversation/event created this
  accessCount: number;
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryInsert {
  scope: MemoryScope;
  type: MemoryType;
  category: MemoryCategory;
  content: string;
  confidence?: number;
  source?: string;
}

export interface MemoryQuery {
  text: string;
  scope?: MemoryScope;
  category?: MemoryCategory;
  limit?: number;
  minConfidence?: number;
}

export interface MemorySearchResult {
  memory: Memory;
  similarity: number;  // 0.0-1.0 cosine similarity
}
