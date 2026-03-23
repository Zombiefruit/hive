import { spawn } from "node:child_process";

const claudePath = process.env.HOME + "/.local/bin/claude";
console.log("Using:", claudePath);
const proc = spawn(claudePath, [
  "--output-format", "stream-json",
  "--input-format", "stream-json",
  "--verbose",
  "--no-chrome",
  "--model", "claude-haiku-4-5-20251001",
  "--no-session-persistence",
  "--system-prompt", "You are a READ-ONLY data fetcher.",
], {
  env: { ...process.env, TERM: "dumb", FORCE_COLOR: "0" },
  cwd: "/Users/kieranwilliams/Documents/GitHub/claude-deck",
  stdio: ["pipe", "pipe", "pipe"],
});

let buf = "";
const start = Date.now();

proc.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  const lines = buf.split("\n");
  buf = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      if (msg.type === "system" && msg.subtype === "init") {
        const mcp = (msg.tools || []).filter(t => t.includes("mcp__claude_ai")).length;
        console.log(`[${elapsed}s] INIT: ${(msg.tools||[]).length} tools, ${mcp} MCP`);
        // Send prompt
        proc.stdin.write(JSON.stringify({
          type: "user",
          message: { role: "user", content: "Use mcp__claude_ai_Linear__list_issues to list issues assigned to kwilliams. Return as plain text." },
          parent_tool_use_id: null,
          session_id: msg.session_id,
        }) + "\n");
        console.log(`[${elapsed}s] PROMPT SENT`);
      } else if (msg.type === "result") {
        console.log(`[${elapsed}s] RESULT (${String(msg.result || "").length} chars): ${String(msg.result || "").slice(0, 200)}`);
        proc.kill();
        process.exit(0);
      } else if (msg.type === "system" && msg.subtype === "hook_started") {
        // skip
      } else if (msg.type === "system" && msg.subtype === "hook_response") {
        // skip
      } else if (msg.type === "assistant") {
        const content = msg.message?.content || [];
        for (const b of (Array.isArray(content) ? content : [])) {
          if (b.type === "tool_use") console.log(`[${elapsed}s] TOOL: ${b.name}`);
          if (b.type === "text") console.log(`[${elapsed}s] TEXT: ${b.text?.slice(0, 100)}`);
        }
      } else {
        console.log(`[${elapsed}s] ${msg.type}/${msg.subtype || ""}`);
      }
    } catch {}
  }
});

proc.stderr.on("data", (chunk) => {
  console.error("STDERR:", chunk.toString().slice(0, 200));
});

proc.stdout.on("end", () => console.log("STDOUT END"));
proc.stdout.on("close", () => console.log("STDOUT CLOSE"));
proc.stdout.on("error", (e) => console.log("STDOUT ERROR:", e));

// Check if process is actually alive
setInterval(() => {
  try {
    process.kill(proc.pid, 0); // check alive
  } catch {
    console.log(`[${((Date.now()-start)/1000).toFixed(0)}s] Process is dead`);
  }
}, 5000);

proc.on("exit", (code) => {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[${elapsed}s] PROCESS EXITED code=${code}`);
  process.exit(0);
});

setTimeout(() => {
  console.log(`[120s] TIMEOUT — killing`);
  proc.kill();
  process.exit(1);
}, 120000);
