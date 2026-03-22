import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import type { Agent } from "../../shared/types";

const statusColors: Record<string, string> = {
  active: "blue",
  idle: "gray",
  errored: "red",
  completed: "green",
};

const modelLabels: Record<string, string> = {
  "claude-opus-4-6": "Opus 4",
  "claude-sonnet-4-6": "Sonnet 4",
  "claude-haiku-4-5-20251001": "Haiku",
};

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      padding="md"
      radius="sm"
      withBorder
      style={{ cursor: "pointer" }}
      onClick={() => navigate(`/agent/${agent.id}`)}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Badge
            variant="light"
            color={statusColors[agent.status] ?? "gray"}
            size="sm"
          >
            {agent.status}
          </Badge>
          <Badge variant="outline" color="gray" size="xs">
            {modelLabels[agent.model] ?? agent.model}
          </Badge>
        </Group>

        <Text size="sm" fw={500} lineClamp={2}>
          {agent.task}
        </Text>

        <Group gap="xs">
          {agent.branch && (
            <Badge variant="light" color="violet" size="xs">
              {agent.branch}
            </Badge>
          )}
          {agent.source === "external" && (
            <Badge variant="outline" color="gray" size="xs">
              External
            </Badge>
          )}
          {agent.costUsd > 0 && (
            <Text size="xs" c="dimmed">
              ${agent.costUsd.toFixed(3)}
            </Text>
          )}
        </Group>

        <Text size="xs" c="dimmed" lineClamp={1}>
          {agent.cwd}
        </Text>
      </Stack>
    </Card>
  );
}
