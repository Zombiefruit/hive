import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "better-sqlite3",
        "@anthropic-ai/claude-agent-sdk",
        "@modelcontextprotocol/sdk",
        "fastembed",
        "onnxruntime-node",
        "@anush008/tokenizers",
        "@anush008/tokenizers-darwin-universal",
        "sqlite-vec",
      ],
    },
  },
});
