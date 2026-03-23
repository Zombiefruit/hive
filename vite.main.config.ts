import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: ["better-sqlite3", "@anthropic-ai/claude-agent-sdk", "@modelcontextprotocol/sdk"],
    },
  },
});
