import { Card, SimpleGrid, Stack, Text } from "@mantine/core";
import { useAgentStore } from "../stores/agent-store";
import { AgentCard } from "./AgentCard";

export function AgentGrid() {
  const agents = useAgentStore((s) => s.agents);

  if (agents.length === 0) {
    return (
      <Card padding="xl" radius="sm" withBorder>
        <Stack align="center" gap="sm" py="xl">
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
