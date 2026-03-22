import { Group, SimpleGrid, Text } from "@mantine/core";
import { IconPlayerPlay, IconClock, IconAlertTriangle, IconCheck, IconActivity } from "@tabler/icons-react";
import { useAgentStore } from "../stores/agent-store";

const items = [
  { key: "active", label: "Active", color: "#22c55e", icon: IconPlayerPlay },
  { key: "idle", label: "Idle", color: "#eab308", icon: IconClock },
  { key: "errored", label: "Errored", color: "#ef4444", icon: IconAlertTriangle },
  { key: "completed", label: "Completed", color: "#6b7280", icon: IconCheck },
  { key: "tokens", label: "Total Tokens", color: "var(--mantine-color-blue-5)", icon: IconActivity },
] as const;

export function MetricsBar() {
  const metrics = useAgentStore((s) => s.metrics);

  const values: Record<string, string | number> = {
    active: metrics.active,
    idle: metrics.idle,
    errored: metrics.errored,
    completed: metrics.completed,
    tokens: metrics.totalTokens > 1000
      ? metrics.totalTokens.toLocaleString()
      : String(metrics.totalTokens),
  };

  return (
    <SimpleGrid cols={5}>
      {items.map((item) => (
        <div
          key={item.key}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 8,
            border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)",
            backgroundColor: "var(--mantine-color-dark-7)",
          }}
        >
          <item.icon size={16} color={item.color} stroke={1.5} />
          <div>
            <Text
              size="lg"
              fw={600}
              ff="monospace"
              style={{ lineHeight: 1.2, color: Number(values[item.key]) > 0 ? item.color : undefined }}
            >
              {values[item.key]}
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              {item.label}
            </Text>
          </div>
        </div>
      ))}
    </SimpleGrid>
  );
}
