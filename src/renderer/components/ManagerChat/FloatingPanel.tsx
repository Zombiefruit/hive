import { ActionIcon, CloseButton, Group, Text, Tooltip, Transition } from "@mantine/core";
import { useCallback, useEffect } from "react";
import { useManagerStore } from "../../stores/manager-store";
import { ConversationSidebar } from "./ConversationSidebar";
import { ContextChips } from "./ContextChips";
import { ManagerMessages } from "./ManagerMessages";
import { ManagerInput } from "./ManagerInput";
import type { ManagerMessage } from "../../stores/manager-store";

const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 800;

export function FloatingPanel() {
  const isOpen = useManagerStore((s) => s.isOpen);
  const isPinned = useManagerStore((s) => s.isPinned);
  const setOpen = useManagerStore((s) => s.setOpen);
  const togglePinned = useManagerStore((s) => s.togglePinned);
  const setStreaming = useManagerStore((s) => s.setStreaming);
  const appendStreamingText = useManagerStore((s) => s.appendStreamingText);
  const clearStreamingText = useManagerStore((s) => s.clearStreamingText);
  const addMessage = useManagerStore((s) => s.addMessage);
  const setConversations = useManagerStore((s) => s.setConversations);
  const setMessages = useManagerStore((s) => s.setMessages);
  const contextItems = useManagerStore((s) => s.contextItems);

  // Load conversations on mount
  useEffect(() => {
    (async () => {
      const convos = await window.deck.getManagerConversations();
      if (convos) setConversations(convos);
      const msgs = await window.deck.getManagerMessages();
      if (msgs) setMessages(msgs);
    })();
  }, [setConversations, setMessages]);

  // Subscribe to Manager stream events
  useEffect(() => {
    const unsub = window.deck.onManagerStream((event: unknown) => {
      const evt = event as { type: string; text?: string; message?: ManagerMessage; error?: string; name?: string };
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
          // Refresh conversations list
          window.deck.getManagerConversations().then((convos) => {
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
      // Build context preamble if context items exist
      let fullMessage = message;
      if (contextItems.length > 0) {
        const contextStr = contextItems
          .map((c) => `[${c.type}: ${c.label}${c.data ? ` — ${JSON.stringify(c.data)}` : ""}]`)
          .join(", ");
        fullMessage = `[Context: ${contextStr}]\n\n${message}`;
      }

      // Add user message to local store immediately
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

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      handleSend(prompt);
    },
    [handleSend]
  );

  const handleClose = () => setOpen(false);

  const handlePin = () => {
    togglePinned();
    setOpen(false);
  };

  const handleNewConversation = async () => {
    const conv = await window.deck.newManagerConversation();
    if (conv) {
      useManagerStore.getState().setActiveConversation(conv.id);
      useManagerStore.getState().setMessages([]);
      const convos = await window.deck.getManagerConversations();
      if (convos) setConversations(convos);
    }
  };

  // Don't render floating panel when pinned (it renders in AppShell.Aside instead)
  if (isPinned) return null;

  return (
    <Transition mounted={isOpen} transition="slide-up" duration={250}>
      {(styles) => (
        <div
          style={{
            ...styles,
            position: "fixed",
            bottom: 24,
            right: 24,
            width: PANEL_WIDTH + 40, // + collapsed sidebar
            height: PANEL_HEIGHT,
            maxHeight: "calc(100vh - 80px)",
            zIndex: 299,
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px var(--mantine-color-default-border)",
            backgroundColor: "var(--mantine-color-dark-8)",
            display: "flex",
            flexDirection: "row",
          }}
        >
          {/* History sidebar */}
          <ConversationSidebar />

          {/* Chat area */}
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
              <Group gap={4}>
                <Tooltip label="New conversation">
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={handleNewConversation}
                    aria-label="New conversation"
                  >
                    <Text size="xs">&#8635;</Text>
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Pin to side">
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={handlePin}
                    aria-label="Pin"
                  >
                    <Text size="xs">&#9646;</Text>
                  </ActionIcon>
                </Tooltip>
                <CloseButton size="sm" onClick={handleClose} />
              </Group>
            </div>

            {/* Context chips */}
            <ContextChips />

            {/* Messages */}
            <ManagerMessages onSuggestedPrompt={handleSuggestedPrompt} />

            {/* Input */}
            <ManagerInput onSend={handleSend} />
          </div>
        </div>
      )}
    </Transition>
  );
}
