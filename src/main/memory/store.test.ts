import { describe, it, expect } from "vitest";
import { cosineSimilarity, toBuffer, fromBuffer } from "./embedder";

describe("embedder utilities", () => {
  it("computes cosine similarity of identical vectors as 1.0", () => {
    const v = [1, 0, 0, 1];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("computes cosine similarity of orthogonal vectors as 0.0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it("computes cosine similarity of opposite vectors as -1.0", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it("computes cosine similarity of similar vectors as close to 1.0", () => {
    const sim = cosineSimilarity([0.9, 0.1, 0.5], [0.85, 0.15, 0.45]);
    expect(sim).toBeGreaterThan(0.99);
  });

  it("handles zero vectors gracefully", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("round-trips embeddings through Buffer", () => {
    const original = [0.1, -0.5, 0.99, 0.001, -0.12345];
    const buf = toBuffer(original);
    const restored = fromBuffer(buf);
    expect(restored).toHaveLength(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i], 5);
    }
  });

  it("produces a Buffer of expected size", () => {
    const buf = toBuffer(new Array(384).fill(0));
    expect(buf.byteLength).toBe(384 * 4); // Float32 = 4 bytes each
  });
});
