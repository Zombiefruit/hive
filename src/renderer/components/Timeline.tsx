import { Badge, Group, ScrollArea, Stack, Text } from "@mantine/core";
import { useAgentStore } from "../stores/agent-store";
import { useShallow } from "zustand/react/shallow";

const eventIcons: Record<string, string> = {
  task_start: "play",
  completed: "check",
  error: "!",
  tool_use: "wrench",
  interrupted: "pause",
  killed: "x",
  context_detected: "link",
  approval: "shield",
};

const eventColors: Record<string, string> = {
  task_start: "blue",
  completed: "green",
  error: "red",
  tool_use: "violet",
  interrupted: "orange",
  killed: "red",
  context_detected: "cyan",
  approval: "yellow",
};

interface TimelineProps {
  agentId: string;
}

export function Timeline({ agentId }: TimelineProps) {
  const events = useAgentStore(
    useShallow((s) => s.events.filter((e) => e.agentId === agentId))
  );

  if (events.length === 0) {
    return (
      <Text size="xs" c="dimmed" ta="center" py="md">
        No events yet
      </Text>
    );
  }

  return (
    <ScrollArea h="100%" offsetScrollbars>
      <Stack gap={4} p="xs">
        {events.map((event) => (
          <Group key={event.id} gap="xs" wrap="nowrap" align="flex-start">
            <Badge
              variant="light"
              color={eventColors[event.type] ?? "gray"}
              size="xs"
              style={{ flexShrink: 0, marginTop: 2 }}
            >
              {eventIcons[event.type] ?? "?"}
            </Badge>
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text size="xs" truncate>
                {event.summary}
              </Text>
              <Text size="xs" c="dimmed">
                {new Date(event.timestamp).toLocaleTimeString()}
              </Text>
            </Stack>
          </Group>
        ))}
      </Stack>
    </ScrollArea>
  );
}
