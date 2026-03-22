import { Group, Paper, ScrollArea, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconPlayerPlay, IconCheck, IconAlertTriangle, IconTool, IconPlayerPause, IconX, IconLink, IconShield } from "@tabler/icons-react";
import { useAgentStore } from "../stores/agent-store";

const eventConfig: Record<string, { color: string; icon: typeof IconPlayerPlay }> = {
  task_start: { color: "blue", icon: IconPlayerPlay },
  completed: { color: "green", icon: IconCheck },
  error: { color: "red", icon: IconAlertTriangle },
  tool_use: { color: "violet", icon: IconTool },
  interrupted: { color: "orange", icon: IconPlayerPause },
  killed: { color: "red", icon: IconX },
  context_detected: { color: "cyan", icon: IconLink },
  approval: { color: "yellow", icon: IconShield },
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
        {events.slice(0, 50).map((event) => {
          const config = eventConfig[event.type] ?? { color: "gray", icon: IconTool };
          return (
            <Paper key={event.id} p="xs" radius="sm" withBorder>
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  <ThemeIcon
                    variant="light"
                    color={config.color}
                    size="xs"
                    radius="xl"
                    style={{ flexShrink: 0 }}
                  >
                    <config.icon size={10} stroke={1.5} />
                  </ThemeIcon>
                  <Text size="xs" truncate style={{ minWidth: 0 }}>
                    <Text span fw={600}>{agentNameMap.get(event.agentId) ?? "Unknown"}</Text>
                    {": "}{event.summary}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </Text>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    </ScrollArea>
  );
}
