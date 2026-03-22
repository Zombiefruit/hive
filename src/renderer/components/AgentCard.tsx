import { Badge, Card, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconRobot, IconExternalLink, IconGitBranch } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import type { Agent } from "../../shared/types";

const statusColors: Record<string, string> = {
  active: "blue",
  idle: "gray",
  errored: "red",
  completed: "green",
};

const modelLabels: Record<string, string> = {
  "claude-opus-4-6": "Opus",
  "claude-sonnet-4-6": "Sonnet",
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
      style={{ cursor: "pointer", transition: "border-color 0.15s ease" }}
      onClick={() => navigate(`/agent/${agent.id}`)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--mantine-color-blue-5)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "";
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <ThemeIcon
              variant="light"
              color={statusColors[agent.status] ?? "gray"}
              size="sm"
              radius="xl"
            >
              <IconRobot size={12} stroke={1.5} />
            </ThemeIcon>
            <Badge
              variant="light"
              color={statusColors[agent.status] ?? "gray"}
              size="xs"
            >
              {agent.status}
            </Badge>
          </Group>
          <Badge variant="outline" color="gray" size="xs">
            {modelLabels[agent.model] ?? agent.model}
          </Badge>
        </Group>

        <Text size="sm" fw={500} lineClamp={2}>
          {agent.task}
        </Text>

        <Group gap="xs">
          {agent.branch && (
            <Badge
              variant="light"
              color="violet"
              size="xs"
              leftSection={<IconGitBranch size={10} stroke={1.5} />}
            >
              {agent.branch}
            </Badge>
          )}
          {agent.source === "external" && (
            <Badge
              variant="outline"
              color="gray"
              size="xs"
              leftSection={<IconExternalLink size={10} stroke={1.5} />}
            >
              External
            </Badge>
          )}
        </Group>

        <Group justify="space-between">
          <Text size="xs" c="dimmed" lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
            {agent.cwd.replace(/^\/Users\/\w+\//, "~/")}
          </Text>
          {agent.costUsd > 0 && (
            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
              ${agent.costUsd.toFixed(3)}
            </Text>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
