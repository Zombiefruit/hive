import { Badge, Group, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { useAgentStore } from "../stores/agent-store";

const eventColors: Record<string, string> = {
  task_start: "blue",
  completed: "green",
  error: "red",
  tool_use: "violet",
  interrupted: "orange",
  killed: "red",
  context_detected: "cyan",
};

export function ActivityFeed() {
  const events = useAgentStore((s) => s.events);
  const agents = useAgentStore((s) => s.agents);

  const agentNameMap = new Map(agents.map((a) => [a.id, a.task.slice(0, 30)]));

  if (events.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        No activity yet
      </Text>
    );
  }

  return (
    <ScrollArea h={300}>
      <Stack gap="xs">
        {events.slice(0, 50).map((event) => (
          <Paper key={event.id} p="xs" radius="sm" withBorder>
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                <Badge
                  variant="light"
                  color={eventColors[event.type] ?? "gray"}
                  size="xs"
                  style={{ flexShrink: 0 }}
                >
                  {event.type}
                </Badge>
                <Text size="xs" truncate style={{ minWidth: 0 }}>
                  {agentNameMap.get(event.agentId) ?? "Unknown"}: {event.summary}
                </Text>
              </Group>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {new Date(event.timestamp).toLocaleTimeString()}
              </Text>
            </Group>
          </Paper>
        ))}
      </Stack>
    </ScrollArea>
  );
}
