import { describe, it, expect } from "vitest";

// Extract the clean function for testing — we'll test the logic directly
// since the component is just a wrapper around cleanClaudeOutput

const STRIP_TAGS = [
  "system-reminder", "antml:thinking", "antml:function_calls",
  "antml:invoke", "antml:parameter", "function_results",
  "local-command-caveat", "user-prompt-submit-hook", "fast_mode_info",
];

const BLOCK_TAGS = ["command-message", "command-name", "generate-plans", "skill-name"];

function stripJsonActionBlocks(text: string): string {
  // Find {"action": and walk forward matching braces to find the full block
  const marker = '"action"';
  let result = text;
  let safety = 0;
  while (safety++ < 10) {
    const idx = result.indexOf(marker);
    if (idx === -1) break;
    // Walk backwards to find the opening {
    let start = idx;
    while (start > 0 && result[start] !== "{") start--;
    if (result[start] !== "{") break;
    // Walk forward matching braces
    let depth = 0;
    let end = start;
    for (let i = start; i < result.length; i++) {
      if (result[i] === "{") depth++;
      else if (result[i] === "}") depth--;
      if (depth === 0) { end = i + 1; break; }
    }
    // Remove the block plus surrounding whitespace
    const before = result.slice(0, start).replace(/\n+$/, "");
    const after = result.slice(end).replace(/^\n+/, "");
    result = before + (after ? "\n" + after : "");
  }
  return result;
}

function stripContextBlocks(text: string): string {
  // [Context: ...] can contain nested brackets like [notification: ...]
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
  // Clean up leading newlines left after stripping
  result = result.replace(/^\n+/, "");
  return result;
}

function cleanClaudeOutput(raw: string): string {
  let text = raw;
  for (const tag of STRIP_TAGS) {
    text = text.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi"), "");
    text = text.replace(new RegExp(`<${tag}[^>]*/?>`, "gi"), "");
  }
  for (const tag of BLOCK_TAGS) {
    text = text.replace(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"), "$1");
  }
  text = text.replace(/<\/?(?:tool-use|tool-result|artifact|antArtifact)[^>]*>/gi, "");

  // Strip raw JSON action blocks — use brace-depth matching for nested objects
  text = text.replace(/```(?:json)?\s*\n?\{[\s\n]*"action"\s*:[\s\S]*?\}\n?\s*```/g, "");
  text = stripJsonActionBlocks(text);

  // Strip [Context: ...] blocks injected by the manager chat — handle nested brackets
  text = stripContextBlocks(text);

  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

describe("cleanClaudeOutput — JSON action blocks", () => {
  it("strips a simple action block", () => {
    const input = 'Done, marking VEC-67 as done.\n\n{"action": "update_task", "task_title": "VEC-67", "changes": {"stage": "done", "status": "done"}}';
    const result = cleanClaudeOutput(input);
    expect(result).toBe("Done, marking VEC-67 as done.");
    expect(result).not.toContain("{");
    expect(result).not.toContain("}");
  });

  it("strips action block with trailing newline", () => {
    const input = 'Done.\n{"action": "update_task", "task_title": "VEC-67", "changes": {"stage": "done"}}\n';
    const result = cleanClaudeOutput(input);
    expect(result).toBe("Done.");
  });

  it("strips action block in code fence", () => {
    const input = 'Done.\n\n```json\n{"action": "update_task", "task_title": "X", "changes": {"stage": "done"}}\n```';
    const result = cleanClaudeOutput(input);
    expect(result).toBe("Done.");
  });

  it("does NOT leave trailing brace", () => {
    const input = 'Done, marking VEC-67 as done.\n{"action": "update_task", "task_title": "VEC-67", "changes": {"stage": "done", "status": "done"}}';
    const result = cleanClaudeOutput(input);
    expect(result).not.toContain("}");
    expect(result).not.toMatch(/\}\s*$/);
  });

  it("handles action block with nested objects", () => {
    const input = 'Updated.\n\n{"action": "update_task", "task_title": "VEC-50", "changes": {"stage": "hack", "priority": "high", "links": [{"type": "pr", "url": "https://github.com"}]}}';
    const result = cleanClaudeOutput(input);
    expect(result).toBe("Updated.");
  });
});

describe("cleanClaudeOutput — Context blocks", () => {
  it("strips [Context: ...] prefix from user messages", () => {
    const input = '[Context: [notification: VEC-67: Email logo renders oversized — {"source":"linear","summary":"Bug report"}]]\n\nThis PR is finished. Can be moved to done';
    const result = cleanClaudeOutput(input);
    expect(result).toBe("This PR is finished. Can be moved to done");
    expect(result).not.toContain("[Context:");
    expect(result).not.toContain("notification:");
  });

  it("strips multiple context blocks", () => {
    const input = '[Context: [notification: X]]\n[Context: [agent: Y]]\n\nDo this task';
    const result = cleanClaudeOutput(input);
    expect(result).toBe("Do this task");
  });

  it("preserves message when no context block", () => {
    const input = "Just a normal message";
    const result = cleanClaudeOutput(input);
    expect(result).toBe("Just a normal message");
  });
});
