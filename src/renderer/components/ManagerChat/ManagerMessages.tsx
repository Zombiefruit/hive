import { Code, Loader, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { useEffect, useRef } from "react";
import { useManagerStore } from "../../stores/manager-store";
import { ClaudeContent } from "../ClaudeContent";
import type { ManagerMessage } from "../../stores/manager-store";

const SUGGESTED_PROMPTS = [
  "What should I work on next?",
  "Check on all running agents",
  "Start work on my highest priority ticket",
  "Show me fleet status",
];

function ToolCallBlock({ call }: { call: { name: string; input: Record<string, unknown>; result: string } }) {
  let resultPreview: string;
  try {
    const parsed = JSON.parse(call.result);
    resultPreview = JSON.stringify(parsed, null, 2).slice(0, 300);
  } catch {
    resultPreview = call.result.slice(0, 300);
  }

  return (
    <Paper
      p="xs"
      radius="sm"
      style={{
        backgroundColor: "var(--mantine-color-default)",
        borderLeft: "3px solid var(--mantine-color-blue-5)",
      }}
    >
      <Text size="xs" c="blue" fw={600}>
        {call.name}
      </Text>
      <Code
        block
        style={{ fontSize: "0.65rem", maxHeight: 80, overflow: "auto", marginTop: 4 }}
      >
        {resultPreview}
      </Code>
    </Paper>
  );
}

function MessageBubble({ message }: { message: ManagerMessage }) {
  const isUser = message.role === "user";

  return (
    <Stack gap={4}>
      <Paper
        p="sm"
        radius="sm"
        style={{
          backgroundColor: isUser
            ? "var(--mantine-color-blue-light)"
            : "var(--mantine-color-default)",
          alignSelf: isUser ? "flex-end" : "flex-start",
          maxWidth: "90%",
        }}
      >
        <ClaudeContent content={message.content} role={isUser ? "user" : "assistant"} />
      </Paper>
      {message.toolCalls?.map((call, i) => (
        <ToolCallBlock key={i} call={call} />
      ))}
    </Stack>
  );
}

interface ManagerMessagesProps {
  onSuggestedPrompt: (prompt: string) => void;
}

export function ManagerMessages({ onSuggestedPrompt }: ManagerMessagesProps) {
  const messages = useManagerStore((s) => s.messages);
  const isStreaming = useManagerStore((s) => s.isStreaming);
  const streamingText = useManagerStore((s) => s.streamingText);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-viewport]");
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages.length, streamingText]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <Stack align="center" justify="center" gap="md" p="xl" style={{ flex: 1 }}>
        <Text size="lg" fw={600} c="dimmed">
          Manager AI
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          I orchestrate your Claude Code agents. Ask me anything.
        </Text>
        <Stack gap="xs" w="100%" maw={300}>
          {SUGGESTED_PROMPTS.map((prompt) => (
            <Paper
              key={prompt}
              p="xs"
              radius="sm"
              withBorder
              style={{ cursor: "pointer" }}
              onClick={() => onSuggestedPrompt(prompt)}
            >
              <Text size="xs">{prompt}</Text>
            </Paper>
          ))}
        </Stack>
      </Stack>
    );
  }

  return (
    <ScrollArea ref={scrollRef} style={{ flex: 1 }} offsetScrollbars>
      <Stack gap="sm" p="md">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isStreaming && streamingText && (
          <Paper
            p="sm"
            radius="sm"
            style={{
              backgroundColor: "var(--mantine-color-default)",
              alignSelf: "flex-start",
              maxWidth: "90%",
            }}
          >
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {streamingText}
            </Text>
          </Paper>
        )}
        {isStreaming && !streamingText && (
          <Loader size="sm" type="dots" />
        )}
      </Stack>
    </ScrollArea>
  );
}
