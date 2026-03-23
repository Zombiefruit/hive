import { ActionIcon, CloseButton, Group, Text, Tooltip } from "@mantine/core";
import { useCallback, useEffect } from "react";
import { useManagerStore } from "../../stores/manager-store";
import { ConversationSidebar } from "./ConversationSidebar";
import { ContextChips } from "./ContextChips";
import { ManagerMessages } from "./ManagerMessages";
import { ManagerInput } from "./ManagerInput";
import type { ManagerMessage, ManagerConversation } from "../../stores/manager-store";

export function PinnedPanel() {
  const isPinned = useManagerStore((s) => s.isPinned);
  const togglePinned = useManagerStore((s) => s.togglePinned);
  const setStreaming = useManagerStore((s) => s.setStreaming);
  const appendStreamingText = useManagerStore((s) => s.appendStreamingText);
  const clearStreamingText = useManagerStore((s) => s.clearStreamingText);
  const addMessage = useManagerStore((s) => s.addMessage);
  const setConversations = useManagerStore((s) => s.setConversations);
  const setMessages = useManagerStore((s) => s.setMessages);
  const contextItems = useManagerStore((s) => s.contextItems);

  useEffect(() => {
    (async () => {
      const convos = await window.deck.getManagerConversations();
      if (convos) setConversations(convos);
      const msgs = await window.deck.getManagerMessages();
      if (msgs) setMessages(msgs);
    })();
  }, [setConversations, setMessages]);

  useEffect(() => {
    const unsub = window.deck.onManagerStream((event: unknown) => {
      const evt = event as { type: string; text?: string; message?: ManagerMessage; error?: string };
      switch (evt.type) {
        case "message_start":
          setStreaming(true);
          clearStreamingText();
          break;
        case "text_delta":
          appendStreamingText(evt.text ?? "");
          break;
        case "message_complete":
          setStreaming(false);
          clearStreamingText();
          if (evt.message) addMessage(evt.message);
          window.deck.getManagerConversations().then((convos: ManagerConversation[]) => {
            if (convos) setConversations(convos);
          });
          break;
        case "error":
          setStreaming(false);
          clearStreamingText();
          break;
      }
    });
    return unsub;
  }, [setStreaming, appendStreamingText, clearStreamingText, addMessage, setConversations]);

  const handleSend = useCallback(
    async (message: string) => {
      let fullMessage = message;
      if (contextItems.length > 0) {
        const contextStr = contextItems
          .map((c) => `[${c.type}: ${c.label}${c.data ? ` — ${JSON.stringify(c.data)}` : ""}]`)
          .join(", ");
        fullMessage = `[Context: ${contextStr}]\n\n${message}`;
      }

      addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      });

      setStreaming(true);
      try {
        await window.deck.sendManagerMessage(fullMessage);
      } catch {
        setStreaming(false);
      }
    },
    [contextItems, addMessage, setStreaming]
  );

  if (!isPinned) return null;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <ConversationSidebar />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--mantine-color-default-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>&#10024;</span>
          <Text size="sm" fw={600} style={{ flex: 1 }}>
            Manager
          </Text>
          <Tooltip label="Undock">
            <ActionIcon variant="subtle" size="sm" onClick={togglePinned} aria-label="Undock">
              <Text size="xs">&#9646;</Text>
            </ActionIcon>
          </Tooltip>
        </div>

        <ContextChips />
        <ManagerMessages onSuggestedPrompt={handleSend} />
        <ManagerInput onSend={handleSend} />
      </div>
    </div>
  );
}
