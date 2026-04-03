import { Code, Paper, Text } from "@mantine/core";
import { Markdown } from "./Markdown";

/**
 * Claude Code output contains XML-like tags from skills, system reminders,
 * and tool output. This component cleans and renders them properly.
 */

// Tags to completely strip (system internals, not useful to display)
const STRIP_TAGS = [
  "system-reminder",
  "antml:thinking",
  "antml:function_calls",
  "antml:invoke",
  "antml:parameter",
  "function_results",
  "local-command-caveat",
  "user-prompt-submit-hook",
  "fast_mode_info",
];

// Tags to render as styled blocks
const BLOCK_TAGS = [
  "command-message",
  "command-name",
  "generate-plans",
  "skill-name",
];

interface ClaudeContentProps {
  content: string;
  role?: "user" | "assistant";
}

export function ClaudeContent({ content, role }: ClaudeContentProps) {
  const cleaned = cleanClaudeOutput(content);

  if (!cleaned.trim()) {
    return <Text size="xs" c="dimmed" fs="italic">{'(internal operation)'}</Text>;
  }

  if (role === "user") {
    return <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{cleaned}</Text>;
  }

  return <Markdown content={cleaned} />;
}

function cleanClaudeOutput(raw: string): string {
  let text = raw;

  // Strip tags and their content completely
  for (const tag of STRIP_TAGS) {
    const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
    text = text.replace(regex, "");
    // Also handle self-closing
    text = text.replace(new RegExp(`<${tag}[^>]*/?>`, "gi"), "");
  }

  // Convert block tags to readable format
  for (const tag of BLOCK_TAGS) {
    // Opening + content + closing → just the content
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
    text = text.replace(regex, "$1");
  }

  // Strip any remaining XML-like tags that look like Claude internals
  text = text.replace(/<\/?(?:tool-use|tool-result|artifact|antArtifact)[^>]*>/gi, "");

  // Strip raw JSON action blocks that the manager outputs ({"action": "update_task", ...})
  // These are machine-readable actions, not for human display
  text = text.replace(/\n?\{[\s\n]*"action"\s*:\s*"[^"]+?"[\s\S]*?\}\n?/g, "");

  // Also strip standalone JSON blocks wrapped in code fences that contain action fields
  text = text.replace(/```(?:json)?\s*\n?\{[\s\n]*"action"\s*:[\s\S]*?\}\n?\s*```/g, "");

  // Clean up excessive whitespace from tag removal
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}
