import { Badge, Card, Group, SimpleGrid, Text } from "@mantine/core";
import { useAgentStore } from "../stores/agent-store";

export function MetricsBar() {
  const metrics = useAgentStore((s) => s.metrics);

  const items = [
    { label: "Active", value: metrics.active, color: "blue" },
    { label: "Idle", value: metrics.idle, color: "gray" },
    { label: "Errored", value: metrics.errored, color: "red" },
    { label: "Completed", value: metrics.completed, color: "ok" },
    {
      label: "Tokens",
      value: metrics.totalTokens > 1000
        ? `${(metrics.totalTokens / 1000).toFixed(1)}k`
        : String(metrics.totalTokens),
      color: "violet",
      suffix: metrics.totalCostUsd > 0 ? `$${metrics.totalCostUsd.toFixed(2)}` : undefined,
    },
  ];

  return (
    <SimpleGrid cols={5}>
      {items.map((item) => (
        <Card key={item.label} padding="sm" radius="sm" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {item.label}
          </Text>
          <Group gap="xs" mt={4}>
            <Text size="xl" fw={700}>
              {item.value}
            </Text>
            {"suffix" in item && item.suffix && (
              <Badge variant="light" color={item.color} size="xs">
                {item.suffix}
              </Badge>
            )}
          </Group>
        </Card>
      ))}
    </SimpleGrid>
  );
}
