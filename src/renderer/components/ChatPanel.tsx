import {
  ActionIcon,
  Code,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentMessages } from "../stores/agent-store";
import { ClaudeContent } from "./ClaudeContent";
import type { Message } from "../../shared/types";

interface ChatPanelProps {
  agentId: string;
  agentStatus: string;
  isReadOnly?: boolean;
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isManager = message.origin === "manager";
  const isToolUse = message.role === "tool_use";
  const isToolResult = message.role === "tool_result";
  const isSystem = message.role === "system";

  if (isToolUse) {
    let toolInfo: { name?: string; input?: unknown } = {};
    try {
      toolInfo = JSON.parse(message.toolCallsJson ?? "{}");
    } catch { /* ignore */ }

    return (
      <Paper
        p="xs"
        radius="sm"
        style={{
          backgroundColor: "var(--mantine-color-dark-7)",
          borderLeft: "3px solid var(--mantine-color-violet-5)",
        }}
      >
        <Text size="xs" c="violet" fw={600} mb={2}>
          Tool: {message.content}
        </Text>
        {toolInfo.input && (
          <Code block style={{ fontSize: "0.7rem", maxHeight: 120, overflow: "auto" }}>
            {JSON.stringify(toolInfo.input, null, 2)}
          </Code>
        )}
      </Paper>
    );
  }

  if (isSystem || isToolResult) {
    return (
      <Text size="xs" c="dimmed" ta="center" py={2}>
        {message.content.slice(0, 200)}
      </Text>
    );
  }

  const bgColor = isManager
    ? "color-mix(in srgb, var(--mantine-color-violet-5) 15%, transparent)"
    : isUser
      ? "color-mix(in srgb, var(--mantine-color-blue-5) 15%, transparent)"
      : "var(--mantine-color-dark-6)";

  return (
    <Paper
      p="sm"
      radius="sm"
      style={{
        backgroundColor: bgColor,
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        border: isUser ? undefined : "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
      }}
    >
      {isManager && (
        <Text size="xs" c="violet" fw={600} mb={2} style={{ fontSize: "0.65rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Manager
        </Text>
      )}
      <ClaudeContent content={message.content} role={isUser ? "user" : "assistant"} />
      <Text size="xs" c="dimmed" mt={2}>
        {new Date(message.timestamp).toLocaleTimeString()}
      </Text>
    </Paper>
  );
}

export function ChatPanel({ agentId, agentStatus, isReadOnly }: ChatPanelProps) {
  const messages = useAgentMessages(agentId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-viewport]");
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await window.deck.sendMessage(agentId, input.trim());
      setInput("");
    } finally {
      setSending(false);
    }
  }, [agentId, input, sending]);

  const handleInterrupt = useCallback(async () => {
    await window.deck.interruptAgent(agentId);
  }, [agentId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isActive = agentStatus === "active" && !isReadOnly;
  const canSend = isActive;

  return (
    <Stack gap={0} h="100%">
      <ScrollArea ref={scrollRef} style={{ flex: 1 }} offsetScrollbars>
        <Stack gap="sm" p="md" style={{ display: "flex", flexDirection: "column" }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <Text size="sm" c="dimmed" mb="xs">
                No messages loaded yet
              </Text>
              <Text size="xs" c="dimmed">
                {isReadOnly
                  ? "This session's conversation file wasn't found. Close the Claude Code session and reopen this app to load its history."
                  : "Start typing below to begin the conversation."}
              </Text>
            </div>
          ) : (
            messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))
          )}
        </Stack>
      </ScrollArea>

      <Paper p="sm" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
        <Group gap="xs" align="flex-end">
          <Textarea
            placeholder={isActive ? "Send a message..." : "Agent is not active"}
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={!isActive}
            autosize
            minRows={1}
            maxRows={4}
            style={{ flex: 1 }}
          />
          <ActionIcon
            variant="filled"
            color="blue"
            size="lg"
            onClick={handleSend}
            disabled={!input.trim() || !isActive}
            loading={sending}
            aria-label="Send"
          >
            <Text size="sm" fw={700}>&uarr;</Text>
          </ActionIcon>
          {isActive && (
            <ActionIcon
              variant="light"
              color="red"
              size="lg"
              onClick={handleInterrupt}
              aria-label="Interrupt"
            >
              <Text size="sm" fw={700}>&times;</Text>
            </ActionIcon>
          )}
        </Group>
      </Paper>
    </Stack>
  );
}
