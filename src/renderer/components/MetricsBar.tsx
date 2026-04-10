import { Group, SimpleGrid, Text } from "@mantine/core";
import { IconPlayerPlay, IconCheck, IconCoins, IconRobot } from "@tabler/icons-react";
import { useAgentStore } from "../stores/agent-store";

export function MetricsBar() {
  const metrics = useAgentStore((s) => s.metrics);
  const totalAgents = metrics.active + metrics.idle + metrics.errored + metrics.completed;

  const items: Array<{ label: string; value: string | number; color: string; icon: typeof IconRobot }> = [
    { label: "Total Agents", value: totalAgents, color: "var(--mantine-color-text)", icon: IconRobot },
    { label: "Running", value: metrics.active, color: "var(--mantine-color-green-filled)", icon: IconPlayerPlay },
  ];
  // Only show completed and cost if they have meaningful values
  if (metrics.completed > 0) {
    items.push({ label: "Completed", value: metrics.completed, color: "var(--mantine-color-dimmed)", icon: IconCheck });
  }
  if (metrics.totalCostUsd > 0) {
    items.push({ label: "Cost", value: `$${metrics.totalCostUsd.toFixed(2)}`, color: "var(--mantine-color-blue-5)", icon: IconCoins });
  }

  return (
    <SimpleGrid cols={items.length}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 8,
            border: "1px solid var(--aegen-glass-border)",
            background: "var(--aegen-glass-bg)", backdropFilter: "var(--aegen-glass-blur)",
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
