/**
 * Advisor-based triage — uses Haiku executor + Opus advisor for classification.
 * Falls back to askEphemeralProcess (Sonnet) if the API call fails.
 */

import Anthropic from "@anthropic-ai/sdk";
import { askEphemeralProcess } from "./mcp-bridge";

/**
 * Run triage using the advisor tool (Haiku + Opus) or fall back to Sonnet ephemeral.
 */
export async function triageWithAdvisor(
  prompt: string,
  timeoutMs: number,
): Promise<{ response: string; usedAdvisor: boolean }> {
  try {
    const client = new Anthropic();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (client.beta.messages.create as any)({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      betas: ["advisor-tool-2026-03-01"],
      tools: [
        {
          type: "advisor_20260301",
          name: "advisor",
          model: "claude-opus-4-6",
          max_uses: 2,
        },
      ],
      system: "You are a triage assistant. Classify and prioritize incoming work items. Return ONLY valid JSON.",
      messages: [{ role: "user", content: prompt }],
    });

    const textBlocks = result.content.filter((b: { type: string }) => b.type === "text");
    const response = textBlocks.map((b: { type: string; text?: string }) => b.text ?? "").join("\n");

    return { response, usedAdvisor: true };
  } catch (err) {
    console.error(`[advisor-triage] API error, falling back to Sonnet: ${String(err).slice(0, 100)}`);
    const response = await askEphemeralProcess(prompt, timeoutMs, "claude-sonnet-4-6", "poll-triage");
    return { response, usedAdvisor: false };
  }
}
