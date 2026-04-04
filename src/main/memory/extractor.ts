/**
 * Memory Extractor — uses an ephemeral LLM process to extract structured
 * memories from conversations (judge verdicts, user feedback, etc.)
 */

import { askEphemeralProcess } from "../mcp-bridge";
import type { MemoryInsert } from "../../shared/memory-types";

interface ExtractionInput {
  conversation: Array<{ role: string; content: string }>;
  agentType: "triage" | "planning" | "work";
  additionalContext?: string;
}

/**
 * Extract memories from a conversation. Returns structured memory inserts.
 * Uses an ephemeral process (no MCP tools, fast startup).
 */
export async function extractMemories(input: ExtractionInput): Promise<MemoryInsert[]> {
  const { conversation, agentType, additionalContext } = input;

  const conversationText = conversation
    .map(m => `${m.role}: ${m.content}`)
    .join("\n\n")
    .slice(0, 8000);

  const prompt = `Analyze this conversation from a ${agentType} agent and extract any facts worth remembering for future conversations. Focus on:

1. **Preferences**: How the user likes things done (communication style, priority weighting, tool preferences)
2. **People**: Who is important, their role, how the user relates to them
3. **Business context**: Projects, goals, deadlines, team dynamics
4. **Workflow patterns**: Recurring patterns in how the user works
5. **Impact knowledge**: What types of work the user considers high-impact vs low-impact

${additionalContext ? `Additional context: ${additionalContext}\n` : ""}
## Conversation
${conversationText}

## Output Format
Return a JSON array of memories to store. Each memory should be:
\`\`\`json
[
  {
    "type": "preference|fact|relationship|procedure|context|feedback",
    "category": "people|priorities|business|workflow|coding|communication|impact",
    "content": "The actual memory text — be specific and actionable",
    "confidence": 0.5-1.0
  }
]
\`\`\`

Rules:
- Only extract genuinely useful, non-obvious information
- Be specific: "User's manager Yael prioritizes observability work" not "User has a manager"
- If nothing worth remembering, return an empty array []
- Maximum 5 memories per extraction
- Confidence: 0.9+ for explicit statements, 0.6-0.8 for inferences, 0.5 for weak signals`;

  try {
    const response = await askEphemeralProcess(prompt, 60000, "claude-haiku-4-5", "memory-extract");

    // Parse JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      type: string; category: string; content: string; confidence: number;
    }>;

    return parsed
      .filter(m => m.content && m.type && m.category)
      .slice(0, 5)
      .map(m => ({
        scope: agentType as MemoryInsert["scope"],
        type: m.type as MemoryInsert["type"],
        category: m.category as MemoryInsert["category"],
        content: m.content,
        confidence: Math.max(0.1, Math.min(1.0, m.confidence ?? 0.5)),
        source: `${agentType}-extraction`,
      }));
  } catch {
    return [];
  }
}

/**
 * Extract a memory from a user's answer to a judge question.
 * More targeted than general extraction — stores the Q&A directly.
 */
export function memoryFromUserAnswer(question: string, answer: string, agentType: string): MemoryInsert {
  return {
    scope: agentType as MemoryInsert["scope"],
    type: "feedback",
    category: "priorities",
    content: `When asked "${question}", user answered: "${answer}"`,
    confidence: 0.9, // User-provided answers are high confidence
    source: `${agentType}-user-answer`,
  };
}
