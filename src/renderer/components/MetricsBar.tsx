import { Card, Group, SimpleGrid, Text, ThemeIcon } from "@mantine/core";
import { IconPlayerPlay, IconClock, IconAlertTriangle, IconCheck, IconCoins } from "@tabler/icons-react";
import { useAgentStore } from "../stores/agent-store";

const items = [
  { key: "active", label: "Active", color: "blue", icon: IconPlayerPlay },
  { key: "idle", label: "Idle", color: "gray", icon: IconClock },
  { key: "errored", label: "Errored", color: "red", icon: IconAlertTriangle },
  { key: "completed", label: "Completed", color: "green", icon: IconCheck },
  { key: "tokens", label: "Tokens", color: "violet", icon: IconCoins },
] as const;

export function MetricsBar() {
  const metrics = useAgentStore((s) => s.metrics);

  const values: Record<string, string | number> = {
    active: metrics.active,
    idle: metrics.idle,
    errored: metrics.errored,
    completed: metrics.completed,
    tokens: metrics.totalTokens > 1000
      ? `${(metrics.totalTokens / 1000).toFixed(1)}k`
      : String(metrics.totalTokens),
  };

  return (
    <SimpleGrid cols={5}>
      {items.map((item) => (
        <Card key={item.key} padding="sm" radius="sm" withBorder>
          <Group gap="xs" mb={4}>
            <ThemeIcon variant="light" color={item.color} size="sm" radius="sm">
              <item.icon size={14} stroke={1.5} />
            </ThemeIcon>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              {item.label}
            </Text>
          </Group>
          <Group gap="xs">
            <Text size="xl" fw={700}>
              {values[item.key]}
            </Text>
            {item.key === "tokens" && metrics.totalCostUsd > 0 && (
              <Text size="xs" c="dimmed">
                ${metrics.totalCostUsd.toFixed(2)}
              </Text>
            )}
          </Group>
        </Card>
      ))}
    </SimpleGrid>
  );
}
