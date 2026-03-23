import {
  ActionIcon,
  Badge,
  Code,
  Collapse,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  UnstyledButton,
} from "@mantine/core";
import { IconSend, IconPlayerStop, IconChevronDown, IconChevronRight, IconRobot, IconTool, IconSparkles } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentMessages } from "../stores/agent-store";
import { Markdown } from "./Markdown";
import type { Message } from "../../shared/types";

interface ChatPanelProps {
  agentId: string;
  agentStatus: string;
  isReadOnly?: boolean;
}

function ToolGroupMessage({ message }: { message: Message }) {
  const [open, setOpen] = useState(false);
  let items: string[] = [];
  try { items = JSON.parse(message.toolCallsJson ?? "[]"); } catch {}
  const isAgentGroup = message.content.startsWith("Spawned");

  return (
    <div style={{ padding: "2px 0" }}>
      <UnstyledButton
        onClick={() => setOpen(!open)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 6,
          fontSize: "0.75rem",
          color: "var(--mantine-color-dimmed)",
          backgroundColor: "var(--mantine-color-dark-6)",
          border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
        }}
      >
        {isAgentGroup ? <IconRobot size={12} /> : <IconTool size={12} />}
        <span>{message.content.split("\n")[0]}</span>
        {items.length > 0 && (open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />)}
      </UnstyledButton>
      {items.length > 0 && (
        <Collapse in={open}>
          <div style={{ paddingLeft: 20, paddingTop: 4 }}>
            {items.map((item, i) => (
              <Text key={i} size="xs" c="dimmed" ff="monospace" style={{ fontSize: "0.7rem" }}>
                {item}
              </Text>
            ))}
          </div>
        </Collapse>
      )}
    </div>
  );
}

function SkillMessage({ message }: { message: Message }) {
  return (
    <div style={{ padding: "2px 0" }}>
      <Badge
        variant="light"
        color="violet"
        size="sm"
        radius="sm"
        leftSection={<IconSparkles size={10} />}
      >
        {message.content}
      </Badge>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isToolUse = message.role === "tool_use";
  const isSystem = message.role === "system";
  const isManager = message.origin === "manager";

  // Tool groups and agent groups — render as collapsible pills
  if (isToolUse) {
    return <ToolGroupMessage message={message} />;
  }

  // Skills — render as badge
  if (isSystem && message.content.length < 100) {
    return <SkillMessage message={message} />;
  }

  // System messages — dimmed
  if (isSystem) {
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
      {isUser ? (
        <Markdown content={message.content} />
      ) : (
        <Markdown content={message.content} />
      )}
    </Paper>
  );
}

export function ChatPanel({ agentId, agentStatus, isReadOnly }: ChatPanelProps) {
  const messages = useAgentMessages(agentId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-viewport]");
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
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

  return (
    <Stack gap={0} h="100%">
      <ScrollArea ref={scrollRef} style={{ flex: 1 }} offsetScrollbars>
        <Stack gap={4} p="md" pb={60} style={{ display: "flex", flexDirection: "column" }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <Text size="sm" c="dimmed" mb="xs">No messages loaded yet</Text>
              <Text size="xs" c="dimmed">
                {isReadOnly
                  ? "This session's conversation file wasn't found. Close the Claude Code session and reopen this app to load its history."
                  : "Start typing below to begin the conversation."}
              </Text>
            </div>
          ) : (
            messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
          )}
        </Stack>
      </ScrollArea>

      {!isReadOnly && (
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
              styles={{ input: { fontSize: "0.85rem" } }}
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
              <IconSend size={14} stroke={1.5} />
            </ActionIcon>
            {isActive && (
              <ActionIcon variant="light" color="red" size="lg" onClick={handleInterrupt} aria-label="Interrupt">
                <IconPlayerStop size={14} stroke={1.5} />
              </ActionIcon>
            )}
          </Group>
        </Paper>
      )}
    </Stack>
  );
}
