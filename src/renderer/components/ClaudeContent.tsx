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

/** Strip JSON action blocks by walking brace depth — handles nested objects. */
function stripJsonActionBlocks(text: string): string {
  const marker = '"action"';
  let result = text;
  let safety = 0;
  while (safety++ < 10) {
    const idx = result.indexOf(marker);
    if (idx === -1) break;
    let start = idx;
    while (start > 0 && result[start] !== "{") start--;
    if (result[start] !== "{") break;
    let depth = 0;
    let end = start;
    for (let i = start; i < result.length; i++) {
      if (result[i] === "{") depth++;
      else if (result[i] === "}") depth--;
      if (depth === 0) { end = i + 1; break; }
    }
    const before = result.slice(0, start).replace(/\n+$/, "");
    const after = result.slice(end).replace(/^\n+/, "");
    result = before + (after ? "\n" + after : "");
  }
  return result;
}

/** Strip [Context: ...] blocks — handles nested brackets. */
function stripContextBlocks(text: string): string {
  let result = text;
  let safety = 0;
  while (safety++ < 10) {
    const idx = result.indexOf("[Context:");
    if (idx === -1) break;
    let depth = 0;
    let end = idx;
    for (let i = idx; i < result.length; i++) {
      if (result[i] === "[") depth++;
      else if (result[i] === "]") depth--;
      if (depth === 0) { end = i + 1; break; }
    }
    result = result.slice(0, idx) + result.slice(end);
  }
  return result.replace(/^\n+/, "");
}

function cleanClaudeOutput(raw: string): string {
  let text = raw;

  // Strip tags and their content completely
  for (const tag of STRIP_TAGS) {
    const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
    text = text.replace(regex, "");
    text = text.replace(new RegExp(`<${tag}[^>]*/?>`, "gi"), "");
  }

  // Convert block tags to readable format
  for (const tag of BLOCK_TAGS) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
    text = text.replace(regex, "$1");
  }

  // Strip any remaining XML-like tags that look like Claude internals
  text = text.replace(/<\/?(?:tool-use|tool-result|artifact|antArtifact)[^>]*>/gi, "");

  // Strip JSON action blocks in code fences
  text = text.replace(/```(?:json)?\s*\n?\{[\s\n]*"action"\s*:[\s\S]*?\}\n?\s*```/g, "");

  // Strip raw JSON action blocks (brace-depth matching for nested objects)
  text = stripJsonActionBlocks(text);

  // Strip [Context: ...] blocks injected by the manager chat
  text = stripContextBlocks(text);

  // Clean up excessive whitespace from tag removal
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}
