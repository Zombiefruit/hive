/**
 * Embedder — lazy-loaded fastembed model for generating text embeddings.
 * Uses BAAI/bge-small-en-v1.5 (384 dimensions, ~130MB one-time download).
 */

import { FlagEmbedding, EmbeddingModel } from "fastembed";

let instance: FlagEmbedding | null = null;
let initPromise: Promise<FlagEmbedding> | null = null;

export const EMBEDDING_DIM = 384;

async function getEmbedder(): Promise<FlagEmbedding> {
  if (instance) return instance;
  if (initPromise) return initPromise;

  initPromise = FlagEmbedding.init({
    model: EmbeddingModel.BGESmallENV15,
  });

  instance = await initPromise;
  initPromise = null;
  return instance;
}

/** Generate embedding for a single text query. Returns 384-dim float array. */
export async function embed(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  return embedder.queryEmbed(text);
}

/** Generate embeddings for a batch of texts. Returns array of 384-dim float arrays. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const embedder = await getEmbedder();
  const results: number[][] = [];
  for await (const batch of embedder.embed(texts, 32)) {
    results.push(...batch);
  }
  return results;
}

/** Convert number[] to Buffer for SQLite storage. */
export function toBuffer(embedding: number[]): Buffer {
  const float32 = new Float32Array(embedding);
  return Buffer.from(float32.buffer);
}

/** Convert Buffer from SQLite back to number[]. */
export function fromBuffer(buf: Buffer): number[] {
  const float32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(float32);
}

/** Compute cosine similarity between two vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Check if embedder model is loaded (for status display). */
export function isEmbedderReady(): boolean {
  return instance !== null;
}
