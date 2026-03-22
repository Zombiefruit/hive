import { Badge, CloseButton, Group, ScrollArea, Text } from "@mantine/core";
import { useManagerStore } from "../../stores/manager-store";

const typeColors: Record<string, string> = {
  agent: "blue",
  metric: "violet",
  ticket: "green",
  custom: "gray",
};

export function ContextChips() {
  const contextItems = useManagerStore((s) => s.contextItems);
  const removeContext = useManagerStore((s) => s.removeContext);

  if (contextItems.length === 0) return null;

  return (
    <div
      style={{
        padding: "6px 12px",
        borderBottom: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <Group gap={4} mb={4}>
        <Text size="xs" c="dimmed">
          Context ({contextItems.length})
        </Text>
      </Group>
      <ScrollArea type="never" offsetScrollbars>
        <Group gap={4} wrap="nowrap">
          {contextItems.map((item) => (
            <Badge
              key={item.id}
              variant="light"
              color={typeColors[item.type] ?? "gray"}
              size="sm"
              rightSection={
                <CloseButton
                  size="xs"
                  variant="transparent"
                  onClick={() => removeContext(item.id)}
                />
              }
              style={{ flexShrink: 0 }}
            >
              {item.label}
            </Badge>
          ))}
        </Group>
      </ScrollArea>
    </div>
  );
}
