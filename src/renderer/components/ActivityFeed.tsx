import { Group, Stack, Text } from "@mantine/core";
import {
  IconGitBranch,
  IconAlertTriangle,
  IconMessageSquare,
  IconCheck,
  IconPlayerPlay,
  IconTool,
  IconLink,
} from "@tabler/icons-react";
import { useAgentStore } from "../stores/agent-store";

const eventConfig: Record<string, { color: string; icon: typeof IconPlayerPlay }> = {
  task_start: { color: "#22c55e", icon: IconPlayerPlay },
  completed: { color: "#22c55e", icon: IconCheck },
  error: { color: "#ef4444", icon: IconAlertTriangle },
  tool_use: { color: "#a855f7", icon: IconTool },
  interrupted: { color: "#eab308", icon: IconAlertTriangle },
  killed: { color: "#ef4444", icon: IconAlertTriangle },
  context_detected: { color: "#06b6d4", icon: IconLink },
  context_added: { color: "#06b6d4", icon: IconLink },
};

export function ActivityFeed() {
  const events = useAgentStore((s) => s.events);
  const agents = useAgentStore((s) => s.agents);
  const agentNameMap = new Map(agents.map((a) => [a.id, a.cwd.split("/").pop() ?? "agent"]));

  if (events.length === 0) {
    return (
      <Text size="xs" c="dimmed" ta="center" py="lg">
        No activity yet
      </Text>
    );
  }

  return (
    <Stack gap={0}>
      {events.slice(0, 20).map((event, i) => {
        const config = eventConfig[event.type] ?? { color: "#6b7280", icon: IconTool };
        const Icon = config.icon;
        return (
          <Group
            key={event.id}
            gap="sm"
            wrap="nowrap"
            px="sm"
            py="xs"
            style={{
              borderBottom: i < events.length - 1
                ? "1px solid color-mix(in srgb, var(--mantine-color-default-border) 20%, transparent)"
                : undefined,
            }}
          >
            <Icon size={14} color={config.color} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="xs" lineClamp={2}>
                <Text span size="xs" ff="monospace" c="blue.4" fw={500}>
                  {agentNameMap.get(event.agentId) ?? "agent"}
                </Text>
                {" "}{event.summary}
              </Text>
              <Text size="xs" c="dimmed" ff="monospace" mt={2} style={{ fontSize: "0.65rem" }}>
                {new Date(event.timestamp).toLocaleTimeString()}
              </Text>
            </div>
          </Group>
        );
      })}
    </Stack>
  );
}
