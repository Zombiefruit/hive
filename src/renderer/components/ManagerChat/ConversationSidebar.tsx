import {
  ActionIcon,
  Group,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useManagerStore } from "../../stores/manager-store";

export function ConversationSidebar() {
  const conversations = useManagerStore((s) => s.conversations);
  const activeId = useManagerStore((s) => s.activeConversationId);
  const isHistoryOpen = useManagerStore((s) => s.isHistoryOpen);
  const toggleHistory = useManagerStore((s) => s.toggleHistory);

  const handleSelect = async (id: string) => {
    await window.deck.switchManagerConversation(id);
    useManagerStore.getState().setActiveConversation(id);
    const msgs = await window.deck.getManagerMessages();
    useManagerStore.getState().setMessages(msgs ?? []);
  };

  const handleNew = async () => {
    const conv = await window.deck.newManagerConversation();
    if (conv) {
      useManagerStore.getState().setActiveConversation(conv.id);
      useManagerStore.getState().setMessages([]);
      const convos = await window.deck.getManagerConversations();
      useManagerStore.getState().setConversations(convos ?? []);
    }
  };

  return (
    <div
      style={{
        width: isHistoryOpen ? 220 : 40,
        transition: "width 0.2s ease",
        borderRight: "1px solid var(--mantine-color-default-border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Toggle button — always visible */}
      <div style={{ padding: 4 }}>
        <Tooltip label={isHistoryOpen ? "Collapse" : "History"} position="right">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={toggleHistory}
            aria-label="Toggle history"
            w={isHistoryOpen ? "100%" : 32}
          >
            <Text size="xs">{isHistoryOpen ? "\u00AB" : "\u00BB"}</Text>
          </ActionIcon>
        </Tooltip>
      </div>

      {isHistoryOpen && (
        <>
          <Group justify="space-between" px="xs" pb="xs">
            <Text size="xs" fw={600}>
              History
            </Text>
            <ActionIcon variant="subtle" size="xs" onClick={handleNew} aria-label="New conversation">
              <Text size="xs">+</Text>
            </ActionIcon>
          </Group>

          <ScrollArea style={{ flex: 1 }}>
            <Stack gap={2} px={4}>
              {conversations.map((conv) => (
                <UnstyledButton
                  key={conv.id}
                  onClick={() => handleSelect(conv.id)}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 6,
                    backgroundColor:
                      conv.id === activeId
                        ? "var(--mantine-color-default-hover)"
                        : "transparent",
                  }}
                >
                  <Text size="xs" lineClamp={1} fw={conv.id === activeId ? 600 : 400}>
                    {conv.title}
                  </Text>
                  <Text size="xs" c="dimmed" style={{ fontSize: "0.65rem" }}>
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </Text>
                </UnstyledButton>
              ))}
              {conversations.length === 0 && (
                <Text size="xs" c="dimmed" ta="center" py="md">
                  No conversations yet
                </Text>
              )}
            </Stack>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
