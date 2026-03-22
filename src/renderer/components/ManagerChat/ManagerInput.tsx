import { ActionIcon, Group, Paper, Stack, Text, Textarea } from "@mantine/core";
import { IconSend, IconCommand } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { useManagerStore } from "../../stores/manager-store";

const QUICK_ACTIONS = [
  { label: "Check all agents", command: "What's the status of all running agents?" },
  { label: "Start from ticket", command: "Start work on my highest priority Linear ticket" },
  { label: "Review approvals", command: "Review and handle all pending approval requests" },
  { label: "Fleet metrics", command: "Show me a summary of fleet costs and token usage" },
];

interface ManagerInputProps {
  onSend: (message: string) => void;
}

export function ManagerInput({ onSend }: ManagerInputProps) {
  const [input, setInput] = useState("");
  const [showActions, setShowActions] = useState(false);
  const isStreaming = useManagerStore((s) => s.isStreaming);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput("");
    setShowActions(false);
  }, [input, isStreaming, onSend]);

  const handleQuickAction = (command: string) => {
    onSend(command);
    setShowActions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "/" && !input) {
      setShowActions(true);
    }
    if (e.key === "Escape") {
      setShowActions(false);
    }
  };

  return (
    <div
      style={{
        padding: "8px 12px",
        borderTop: "1px solid var(--mantine-color-default-border)",
      }}
    >
      {/* Quick actions palette */}
      {showActions && (
        <Stack gap={2} mb="xs">
          {QUICK_ACTIONS.map((action) => (
            <Paper
              key={action.label}
              p="xs"
              radius="sm"
              style={{
                cursor: "pointer",
                backgroundColor: "var(--mantine-color-dark-6)",
                border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
              }}
              onClick={() => handleQuickAction(action.command)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--mantine-color-dark-5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--mantine-color-dark-6)";
              }}
            >
              <Text size="xs">{action.label}</Text>
            </Paper>
          ))}
        </Stack>
      )}

      <Group gap="xs" align="flex-end">
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={() => setShowActions(!showActions)}
          aria-label="Quick actions"
          color={showActions ? "blue" : "gray"}
        >
          <IconCommand size={14} stroke={1.5} />
        </ActionIcon>
        <Textarea
          placeholder={isStreaming ? "Manager is thinking..." : "Ask the Manager... (/ for actions)"}
          value={input}
          onChange={(e) => {
            setInput(e.currentTarget.value);
            if (e.currentTarget.value && showActions) setShowActions(false);
          }}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          autosize
          minRows={1}
          maxRows={4}
          style={{ flex: 1 }}
          styles={{
            input: {
              fontSize: "0.8rem",
              fontFamily: "var(--mantine-font-family-monospace)",
              backgroundColor: "var(--mantine-color-dark-6)",
              border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)",
            },
          }}
        />
        <ActionIcon
          variant="filled"
          color="blue"
          size="lg"
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          loading={isStreaming}
          aria-label="Send"
        >
          <IconSend size={14} stroke={1.5} />
        </ActionIcon>
      </Group>
    </div>
  );
}
