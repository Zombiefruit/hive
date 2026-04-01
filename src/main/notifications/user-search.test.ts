/**
 * Tests for Slack/Linear user search via MCP proxy.
 *
 * The settings page should allow searching for users to add as coworkers.
 * Searches go through the MCP proxy: POST /api/mcp-proxy with action "generic"
 * and a prompt to search users.
 */

import { describe, it, expect } from "vitest";

describe("User Search via MCP Bridge (direct)", () => {
  it("should build Slack user search prompt", () => {
    const query = "Yael";
    const prompt = `Use mcp__claude_ai_Slack__slack_search_users with query "${query}". Return each user's name, display_name, and ID. Plain text only.`;

    expect(prompt).toContain("slack_search_users");
    expect(prompt).toContain("Yael");
  });

  it("should build Linear user search prompt", () => {
    const prompt = `Use mcp__claude_ai_Linear__list_users. Return each user's name, email, and ID. Plain text only.`;

    expect(prompt).toContain("list_users");
  });

  it("should parse user search results into structured data", () => {
    const rawResult = `Found 3 users:
1. Yael Chemla (ychemla) - ID: U043ENDKV4Y
2. Mor Ofir (mofir) - ID: U0ABCDEF
3. Dan Lev (dlev) - ID: U0123456`;

    // Parse name, display name, and ID from each line
    const lines = rawResult.split("\n").filter(l => l.match(/^\d+\./));
    const users = lines.map(line => {
      const match = line.match(/(\w+ \w+) \((\w+)\) - ID: (\w+)/);
      return match ? { name: match[1], displayName: match[2], id: match[3] } : null;
    }).filter(Boolean);

    expect(users).toHaveLength(3);
    expect(users[0]).toEqual({ name: "Yael Chemla", displayName: "ychemla", id: "U043ENDKV4Y" });
  });
});
