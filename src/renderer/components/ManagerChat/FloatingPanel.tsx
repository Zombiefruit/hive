import { ActionIcon, CloseButton, Group, Text, Tooltip, Transition } from "@mantine/core";
import { IconMessageChatbot, IconRefresh, IconMinus, IconLayoutSidebarRightExpand, IconLayoutSidebarRightCollapse } from "@tabler/icons-react";
import { useCallback, useEffect } from "react";
import { useManagerStore } from "../../stores/manager-store";
import { ConversationSidebar } from "./ConversationSidebar";
import { ContextChips } from "./ContextChips";
import { ManagerMessages } from "./ManagerMessages";
import { ManagerInput } from "./ManagerInput";
import type { ManagerMessage } from "../../stores/manager-store";

export function FloatingPanel() {
  const isOpen = useManagerStore((s) => s.isOpen);
  const isPinned = useManagerStore((s) => s.isPinned);
  const setOpen = useManagerStore((s) => s.setOpen);
  const setPinned = useManagerStore((s) => s.setPinned);
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
        case "message_start": setStreaming(true); clearStreamingText(); break;
        case "text_delta": appendStreamingText(evt.text ?? ""); break;
        case "message_complete":
          setStreaming(false);
          clearStreamingText();
          if (evt.message) addMessage(evt.message);
          window.deck.getManagerConversations().then((convos) => { if (convos) setConversations(convos); });
          break;
        case "error": setStreaming(false); clearStreamingText(); break;
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
      addMessage({ id: crypto.randomUUID(), role: "user", content: message, timestamp: new Date().toISOString() });
      setStreaming(true);
      try { await window.deck.sendManagerMessage(fullMessage); } catch { setStreaming(false); }
    },
    [contextItems, addMessage, setStreaming]
  );

  const handleNewConversation = async () => {
    const conv = await window.deck.newManagerConversation();
    if (conv) {
      useManagerStore.getState().setActiveConversation(conv.id);
      useManagerStore.getState().setMessages([]);
      const convos = await window.deck.getManagerConversations();
      if (convos) setConversations(convos);
    }
  };

  const handleClose = () => { setOpen(false); setPinned(false); };
  const handleTogglePin = () => {
    if (isPinned) {
      setPinned(false);
    } else {
      setPinned(true);
      setOpen(true);
    }
  };

  const visible = isOpen || isPinned;

  // Shared chat content
  const chatContent = (
    <>
      <ConversationSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--mantine-color-default-border)", display: "flex", alignItems: "center", gap: 8 }}>
          <IconMessageChatbot size={18} stroke={1.5} color="var(--mantine-color-blue-5)" />
          <Text size="sm" fw={600} style={{ flex: 1 }}>Manager</Text>
          <Group gap={4}>
            <Tooltip label="New conversation">
              <ActionIcon variant="subtle" size="sm" onClick={handleNewConversation}><IconRefresh size={14} stroke={1.5} /></ActionIcon>
            </Tooltip>
            <Tooltip label={isPinned ? "Undock" : "Dock to side"}>
              <ActionIcon variant="subtle" size="sm" onClick={handleTogglePin} color={isPinned ? "blue" : undefined}>
                {isPinned ? <IconLayoutSidebarRightCollapse size={14} stroke={1.5} /> : <IconLayoutSidebarRightExpand size={14} stroke={1.5} />}
              </ActionIcon>
            </Tooltip>
            {!isPinned && (
              <Tooltip label="Minimize">
                <ActionIcon variant="subtle" size="sm" onClick={() => setOpen(false)}><IconMinus size={14} stroke={1.5} /></ActionIcon>
              </Tooltip>
            )}
            <CloseButton size="sm" onClick={handleClose} />
          </Group>
        </div>
        <ContextChips />
        <ManagerMessages onSuggestedPrompt={handleSend} />
        <ManagerInput onSend={handleSend} />
      </div>
    </>
  );

  // Pinned mode — full height right panel
  if (isPinned) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 440,
          zIndex: 200,
          backgroundColor: "var(--mantine-color-dark-8)",
          borderLeft: "1px solid var(--mantine-color-default-border)",
          display: "flex",
          flexDirection: "row",
          boxShadow: "-4px 0 20px rgba(0, 0, 0, 0.3)",
        }}
      >
        {chatContent}
      </div>
    );
  }

  // Floating mode
  return (
    <Transition mounted={isOpen && !isPinned} transition="slide-up" duration={250}>
      {(styles) => (
        <div
          style={{
            ...styles,
            position: "fixed",
            bottom: 24,
            right: 24,
            width: 520,
            height: 700,
            maxHeight: "calc(100vh - 80px)",
            zIndex: 299,
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px var(--mantine-color-default-border)",
            backgroundColor: "var(--mantine-color-dark-8)",
            display: "flex",
            flexDirection: "row",
          }}
        >
          {chatContent}
        </div>
      )}
    </Transition>
  );
}
