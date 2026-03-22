import { Card, SimpleGrid, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconRobotOff } from "@tabler/icons-react";
import { useAgentStore } from "../stores/agent-store";
import { AgentCard } from "./AgentCard";

export function AgentGrid() {
  const agents = useAgentStore((s) => s.agents);

  if (agents.length === 0) {
    return (
      <Card padding="xl" radius="sm" withBorder>
        <Stack align="center" gap="sm" py="xl">
          <ThemeIcon variant="light" color="gray" size="xl" radius="xl">
            <IconRobotOff size={24} stroke={1.5} />
          </ThemeIcon>
          <Text size="lg" fw={500} c="dimmed">
            No agents running
          </Text>
          <Text size="sm" c="dimmed">
            Click + New Agent to spawn your first Claude Code agent
          </Text>
        </Stack>
      </Card>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </SimpleGrid>
  );
}
