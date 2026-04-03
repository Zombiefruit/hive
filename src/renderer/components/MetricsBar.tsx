import { Group, SimpleGrid, Text } from "@mantine/core";
import { IconPlayerPlay, IconCheck, IconCoins, IconRobot } from "@tabler/icons-react";
import { useAgentStore } from "../stores/agent-store";

export function MetricsBar() {
  const metrics = useAgentStore((s) => s.metrics);
  const totalAgents = metrics.active + metrics.idle + metrics.errored + metrics.completed;

  const items = [
    { label: "Total Agents", value: totalAgents, color: "var(--mantine-color-text)", icon: IconRobot },
    { label: "Running", value: metrics.active, color: "var(--mantine-color-green-filled)", icon: IconPlayerPlay },
    { label: "Completed", value: metrics.completed, color: "var(--mantine-color-dimmed)", icon: IconCheck },
    {
      label: "Cost",
      value: metrics.totalCostUsd > 0 ? `$${metrics.totalCostUsd.toFixed(2)}` : "$0",
      color: "var(--mantine-color-blue-5)",
      icon: IconCoins,
    },
  ];

  return (
    <SimpleGrid cols={4}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 8,
            border: "1px solid rgba(68, 73, 85, 0.3)",
            background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)",
          }}
        >
          <item.icon size={16} color={item.color} stroke={1.5} />
          <div>
            <Text size="lg" fw={600} ff="monospace" style={{ lineHeight: 1.2 }}>
              {item.value}
            </Text>
            <Text size="xs" c="dimmed" mt={2}>{item.label}</Text>
          </div>
        </div>
      ))}
    </SimpleGrid>
  );
}
