/**
 * Parse raw JSONL lines into grouped, display-ready messages.
 * Collapses sequential tool calls into summary groups.
 */

export interface DisplayMessage {
  role: "user" | "assistant" | "tool_group" | "skill" | "agent_group";
  content: string;
  /** For tool_group/agent_group: the individual items */
  items?: string[];
}

interface RawLine {
  type: string;
  message?: { content?: unknown };
}

export function parseSessionToDisplayMessages(lines: string[], limit = 150): DisplayMessage[] {
  const messages: DisplayMessage[] = [];
  const pendingTools: string[] = [];
  const pendingTasks: string[] = [];
  const pendingAgents: string[] = [];
  const pendingSetup: string[] = [];

  function flushPending() {
    if (pendingSetup.length > 0) {
      messages.push({
        role: "tool_group",
        content: `Setting up ${pendingSetup.length} tool${pendingSetup.length > 1 ? "s" : ""}`,
        items: [...pendingSetup],
      });
      pendingSetup.length = 0;
    }
    if (pendingTasks.length > 0) {
      messages.push({
        role: "tool_group",
        content: `${pendingTasks.length} task operation${pendingTasks.length > 1 ? "s" : ""}`,
        items: [...pendingTasks],
      });
      pendingTasks.length = 0;
    }
    if (pendingAgents.length > 0) {
      messages.push({
        role: "agent_group",
        content: `Spawned ${pendingAgents.length} sub-agent${pendingAgents.length > 1 ? "s" : ""}`,
        items: [...pendingAgents],
      });
      pendingAgents.length = 0;
    }
    if (pendingTools.length > 0) {
      messages.push({
        role: "tool_group",
        content: `${pendingTools.length} tool call${pendingTools.length > 1 ? "s" : ""}`,
        items: [...pendingTools],
      });
      pendingTools.length = 0;
    }
  }

  for (const line of lines) {
    if (messages.length >= limit) break;
    if (!line.trim()) continue;

    let data: RawLine;
    try { data = JSON.parse(line); } catch { continue; }

    // Skip non-message types
    if (!data.type || !["user", "assistant"].includes(data.type)) continue;

    const content = data.message?.content;

    // User messages
    if (data.type === "user") {
      // Skip tool_result blocks (internal responses to tool calls)
      if (Array.isArray(content)) {
        const hasToolResult = (content as Array<{ type: string }>).some(b => b.type === "tool_result");
        if (hasToolResult) continue;

        // Extract text from array content
        const texts = (content as Array<{ type: string; text?: string }>)
          .filter(b => b.type === "text" && b.text)
          .map(b => b.text!);
        if (texts.length > 0) {
          flushPending();
          messages.push({ role: "user", content: texts.join("\n") });
        }
        continue;
      }

      // String content — actual user message
      if (typeof content === "string" && content.trim()) {
        // Clean skill invocation tags
        const cleaned = content
          .replace(/<command-message>[^<]*<\/command-message>\s*/g, "")
          .replace(/<command-name>([^<]*)<\/command-name>\s*/g, "")
          .replace(/<[^>]+>/g, "")
          .trim();
        if (cleaned) {
          flushPending();
          messages.push({ role: "user", content: cleaned });
        }
      }
      continue;
    }

    // Assistant messages
    if (data.type === "assistant" && Array.isArray(content)) {
      for (const block of content as Array<{ type: string; text?: string; thinking?: string; name?: string; input?: Record<string, unknown> }>) {
        if (block.type === "text" && block.text?.trim()) {
          flushPending();
          messages.push({ role: "assistant", content: block.text });
        } else if (block.type === "tool_use" && block.name) {
          const name = block.name;
          const input = block.input ?? {};

          if (name === "Skill") {
            flushPending();
            messages.push({ role: "skill", content: String(input.skill ?? "unknown") });
          } else if (name === "ToolSearch") {
            pendingSetup.push(String(input.query ?? "tools"));
          } else if (name === "TaskCreate") {
            pendingTasks.push(`Create: ${input.subject ?? "task"}`);
          } else if (name === "TaskUpdate") {
            pendingTasks.push(`Update: ${input.status ?? input.subject ?? "task"}`);
          } else if (name === "Agent") {
            pendingAgents.push(String(input.description ?? input.prompt ?? "sub-agent").slice(0, 80));
          } else if (name === "Read") {
            pendingTools.push(`Read ${input.file_path ?? "file"}`);
          } else if (name === "Write") {
            pendingTools.push(`Write ${input.file_path ?? "file"}`);
          } else if (name === "Edit") {
            pendingTools.push(`Edit ${input.file_path ?? "file"}`);
          } else if (name === "Bash") {
            pendingTools.push(`Run \`${String(input.command ?? "").slice(0, 60)}\``);
          } else if (name === "Glob" || name === "Grep") {
            pendingTools.push(`${name}: ${input.pattern ?? ""}`);
          } else if (name.startsWith("mcp__")) {
            const short = name.replace(/^mcp__claude_ai_/, "").replace(/__/g, ".");
            pendingTools.push(short);
          } else {
            pendingTools.push(name);
          }
        }
        // Skip thinking blocks entirely
      }
    }
  }

  flushPending();
  return messages;
}
