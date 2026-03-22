import { ActionIcon, Group, Textarea } from "@mantine/core";
import { useCallback, useState } from "react";
import { useManagerStore } from "../../stores/manager-store";

interface ManagerInputProps {
  onSend: (message: string) => void;
}

export function ManagerInput({ onSend }: ManagerInputProps) {
  const [input, setInput] = useState("");
  const isStreaming = useManagerStore((s) => s.isStreaming);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput("");
  }, [input, isStreaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        padding: "8px 12px",
        borderTop: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <Group gap="xs" align="flex-end">
        <Textarea
          placeholder={isStreaming ? "Manager is thinking..." : "Ask the Manager..."}
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
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
          disabled={!input.trim() || isStreaming}
          loading={isStreaming}
          aria-label="Send"
        >
          <span style={{ fontSize: 14 }}>&uarr;</span>
        </ActionIcon>
      </Group>
    </div>
  );
}
