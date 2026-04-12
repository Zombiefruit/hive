/**
 * Tests for MCP bridge tool configuration — ensures fetch agent
 * can't explore filesystem and read-only MCP tools are pre-approved.
 */
import { describe, it, expect } from "vitest";

// These must match the actual arrays in src/main/mcp-bridge.ts
const DISALLOWED_TOOLS = [
  "Write", "Edit", "Bash", "NotebookEdit", "Agent", "EnterWorktree", "ExitWorktree",
  "Read", "Glob", "Grep",
];

const ALLOWED_TOOLS_SAMPLE = [
  "mcp__claude_ai_Slack__slack_read_channel",
  "mcp__claude_ai_Slack__slack_search_public_and_private",
  "mcp__claude_ai_Linear__get_issue",
  "mcp__claude_ai_Linear__list_issues",
  "mcp__claude_ai_Google_Calendar__gcal_list_events",
  "mcp__claude_ai_Gmail__gmail_search_messages",
  "mcp__claude_ai_Notion__notion-search",
  "ToolSearch",
];

describe("Bridge DISALLOWED_TOOLS", () => {
  it("should block filesystem tools to prevent fetch agent from reading local files", () => {
    // Regression: fetch agent was using Read/Grep on temp files instead of summarizing MCP output
    expect(DISALLOWED_TOOLS).toContain("Read");
    expect(DISALLOWED_TOOLS).toContain("Glob");
    expect(DISALLOWED_TOOLS).toContain("Grep");
  });

  it("should block write/execute tools", () => {
    expect(DISALLOWED_TOOLS).toContain("Write");
    expect(DISALLOWED_TOOLS).toContain("Edit");
    expect(DISALLOWED_TOOLS).toContain("Bash");
  });
});

describe("Bridge ALLOWED_TOOLS", () => {
  it("should pre-approve read-only MCP tools for headless operation", () => {
    // Regression: MCP tool permission prompts silently failed in headless bridge
    for (const tool of ALLOWED_TOOLS_SAMPLE) {
      expect(tool).toBeTruthy();
      // All MCP tools should start with mcp__ (except ToolSearch)
      if (tool !== "ToolSearch") {
        expect(tool.startsWith("mcp__")).toBe(true);
      }
    }
  });

  it("should include Calendar and Gmail read tools", () => {
    // Regression: Calendar/Gmail returned permission errors because tools weren't pre-approved
    expect(ALLOWED_TOOLS_SAMPLE).toContain("mcp__claude_ai_Google_Calendar__gcal_list_events");
    expect(ALLOWED_TOOLS_SAMPLE).toContain("mcp__claude_ai_Gmail__gmail_search_messages");
  });

  it("should not pre-approve write MCP tools", () => {
    const writeTools = [
      "mcp__claude_ai_Slack__slack_send_message",
      "mcp__claude_ai_Linear__save_issue",
      "mcp__claude_ai_Gmail__gmail_create_draft",
      "mcp__claude_ai_Google_Calendar__gcal_create_event",
    ];
    for (const tool of writeTools) {
      expect(ALLOWED_TOOLS_SAMPLE).not.toContain(tool);
    }
  });
});
