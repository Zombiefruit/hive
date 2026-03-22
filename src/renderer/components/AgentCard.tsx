import { Badge, Group, Progress, Stack, Text } from "@mantine/core";
import { IconTerminal2, IconGitBranch, IconClock, IconExternalLink } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { StatusDot } from "./StatusDot";
import type { Agent } from "../../shared/types";

const statusLabels: Record<string, string> = {
  active: "Running",
  idle: "Idle",
  errored: "Errored",
  completed: "Done",
};

const statusBadgeColors: Record<string, string> = {
  active: "green",
  idle: "yellow",
  errored: "red",
  completed: "gray",
};

const modelLabels: Record<string, string> = {
  "claude-opus-4-6": "Opus",
  "claude-sonnet-4-6": "Sonnet",
  "claude-haiku-4-5-20251001": "Haiku",
  unknown: "",
};

export function AgentCard({ agent }: { agent: Agent }) {
  const navigate = useNavigate();
  const elapsed = Math.round((Date.now() - new Date(agent.createdAt).getTime()) / 60000);
  const elapsedStr = elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed / 60)}h ${String(elapsed % 60).padStart(2, "0")}m`;
  const cwdShort = agent.cwd.split("/").pop() ?? agent.cwd;
  const tokenPct = agent.maxBudgetUsd ? Math.min(100, (agent.costUsd / agent.maxBudgetUsd) * 100) : 0;

  return (
    <div
      onClick={() => navigate(`/agent/${agent.id}`)}
      style={{
        padding: 20,
        borderRadius: 8,
        border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)",
        backgroundColor: "var(--mantine-color-dark-7)",
        cursor: "pointer",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--mantine-color-default-border)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <Stack gap="sm">
        {/* Header: name + status */}
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <StatusDot status={agent.status} />
            <Text size="sm" fw={500} ff="monospace">
              {cwdShort}
            </Text>
          </Group>
          <Group gap={6}>
            <Badge
              variant="light"
              color={statusBadgeColors[agent.status] ?? "gray"}
              size="sm"
              radius="sm"
            >
              {statusLabels[agent.status] ?? agent.status}
            </Badge>
            {modelLabels[agent.model] && (
              <Badge variant="outline" color="gray" size="xs" radius="sm">
                {modelLabels[agent.model]}
              </Badge>
            )}
          </Group>
        </Group>

        {/* Task description */}
        <Text size="sm" c="dimmed" lineClamp={2} style={{ lineHeight: 1.5 }}>
          {agent.task}
        </Text>

        {/* Metadata row */}
        <Group gap="md">
          {agent.source === "external" && (
            <Group gap={4}>
              <IconExternalLink size={12} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed">External</Text>
            </Group>
          )}
          {agent.pid && (
            <Group gap={4}>
              <IconTerminal2 size={12} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed" ff="monospace">pid/{agent.pid}</Text>
            </Group>
          )}
          {agent.branch && (
            <Group gap={4}>
              <IconGitBranch size={12} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed" ff="monospace" truncate style={{ maxWidth: 140 }}>
                {agent.branch}
              </Text>
            </Group>
          )}
          <Group gap={4}>
            <IconClock size={12} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed" ff="monospace">{elapsedStr}</Text>
          </Group>
        </Group>

        {/* Token usage */}
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">Tokens</Text>
          <Text size="xs" fw={500} ff="monospace">
            {(agent.inputTokens + agent.outputTokens).toLocaleString()}
          </Text>
        </Group>
        {tokenPct > 0 && (
          <Progress value={tokenPct} color="blue" size={4} radius="xl" />
        )}
      </Stack>
    </div>
  );
}
