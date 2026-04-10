/**
 * Advisor-based triage — uses Haiku executor + Opus advisor for classification.
 *
 * Falls back to askEphemeralProcess (Sonnet) if the Anthropic SDK is not
 * available or the API call fails.
 *
 * Requires: pnpm add @anthropic-ai/sdk
 */

import { askEphemeralProcess } from "./mcp-bridge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Anthropic: any = null;
try {
  // Dynamic import — gracefully falls back if SDK not installed
  // @ts-ignore — SDK may not be installed
  Anthropic = require("@anthropic-ai/sdk").default ?? require("@anthropic-ai/sdk");
} catch {
  Anthropic = null;
}

/**
 * Run triage using the advisor tool (Haiku + Opus) or fall back to Sonnet ephemeral.
 */
export async function triageWithAdvisor(
  prompt: string,
  timeoutMs: number,
): Promise<{ response: string; usedAdvisor: boolean }> {
  // Fall back to Sonnet ephemeral if SDK not available
  if (!Anthropic) {
    const response = await askEphemeralProcess(prompt, timeoutMs, "claude-sonnet-4-6", "poll-triage");
    return { response, usedAdvisor: false };
  }

  try {
    const client = new Anthropic();

    const result = await client.beta.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      betas: ["advisor-tool-2026-03-01"],
      tools: [
        {
          type: "advisor_20260301" as const,
          name: "advisor",
          model: "claude-opus-4-6",
          max_uses: 2, // Limit cost — advisor only needed for edge cases
        } as Record<string, unknown>,
      ],
      system: "You are a triage assistant. Classify and prioritize incoming work items. Return ONLY valid JSON.",
      messages: [{ role: "user", content: prompt }],
    });

    // Extract text from response
    const textBlocks = result.content.filter((b: { type: string }) => b.type === "text");
    const response = textBlocks.map((b: { type: string; text?: string }) => b.text ?? "").join("\n");

    return { response, usedAdvisor: true };
  } catch (err) {
    // Fall back to Sonnet ephemeral on any API error
    console.error(`[advisor-triage] API error, falling back to Sonnet: ${String(err).slice(0, 100)}`);
    const response = await askEphemeralProcess(prompt, timeoutMs, "claude-sonnet-4-6", "poll-triage");
    return { response, usedAdvisor: false };
  }
}
