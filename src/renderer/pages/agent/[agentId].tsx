import { useNavigate, useParams } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Progress,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconPlayerStop,
  IconGitBranch,
  IconFolder,
  IconRobot,
  IconExternalLink,
  IconClock,
} from "@tabler/icons-react";
import { useAgentStore } from "../../stores/agent-store";
import { ChatPanel } from "../../components/ChatPanel";
import { Timeline } from "../../components/Timeline";
import { ContextPanel } from "../../components/ContextPanel";

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
  unknown: "Unknown",
};

export function AgentDetail() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const agent = useAgentStore((s) => s.agents.find((a) => a.id === agentId));

  if (!agent) {
    return (
      <Stack align="center" justify="center" h="100vh" gap="md">
        <Text c="dimmed">Agent not found</Text>
        <Button variant="light" onClick={() => navigate("/")}>
          Back to Dashboard
        </Button>
      </Stack>
    );
  }

  const isExternal = agent.source === "external";
  const budgetPct =
    agent.maxBudgetUsd && agent.maxBudgetUsd > 0
      ? Math.min(100, (agent.costUsd / agent.maxBudgetUsd) * 100)
      : 0;
  const cwdShort = agent.cwd.replace(/^\/Users\/\w+\//, "~/");
  const elapsed = Math.round((Date.now() - new Date(agent.createdAt).getTime()) / 60000);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr 280px",
        gridTemplateRows: "auto 1fr",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Header spanning all columns */}
      <div
        style={{
          gridColumn: "1 / -1",
          padding: "var(--mantine-spacing-sm) var(--mantine-spacing-md)",
          paddingLeft: 80, // Clear macOS traffic lights
          borderBottom: "1px solid var(--mantine-color-default-border)",
          WebkitAppRegion: "drag",
        }}
      >
        <Group justify="space-between" align="center">
          <Group gap="sm" style={{ WebkitAppRegion: "no-drag" }}>
            <ActionIcon variant="subtle" onClick={() => navigate("/")} aria-label="Back">
              <IconArrowLeft size={16} stroke={1.5} />
            </ActionIcon>
            <Badge variant="light" color={statusColors[agent.status] ?? "gray"} size="sm">
              {agent.status}
            </Badge>
            {isExternal && (
              <Badge variant="outline" color="gray" size="xs" leftSection={<IconExternalLink size={10} />}>
                External
              </Badge>
            )}
            <Text size="sm" fw={500} truncate style={{ maxWidth: 400 }}>
              {agent.task}
            </Text>
          </Group>
          <Group gap="sm" style={{ WebkitAppRegion: "no-drag" }}>
            <Badge variant="outline" color="gray" size="xs">
              {modelLabels[agent.model] ?? agent.model}
            </Badge>
            {agent.branch && (
              <Badge variant="light" color="violet" size="xs" leftSection={<IconGitBranch size={10} />}>
                {agent.branch}
              </Badge>
            )}
            {agent.costUsd > 0 && (
              <Text size="xs" c="dimmed">${agent.costUsd.toFixed(3)}</Text>
            )}
            {budgetPct > 0 && (
              <Progress value={budgetPct} color={budgetPct > 80 ? "red" : "blue"} size="sm" w={80} />
            )}
            {agent.status === "active" && (
              <ActionIcon variant="light" color="red" size="sm" onClick={() => window.deck.killAgent(agent.id)} aria-label="Kill agent">
                <IconPlayerStop size={14} stroke={1.5} />
              </ActionIcon>
            )}
          </Group>
        </Group>
      </div>

      {/* Left sidebar: Info + Timeline */}
      <div
        style={{
          borderRight: "1px solid var(--mantine-color-default-border)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Agent info card */}
        <Stack gap="xs" p="xs">
          <Group gap="xs">
            <ThemeIcon variant="light" color={statusColors[agent.status] ?? "gray"} size="sm" radius="xl">
              <IconRobot size={12} />
            </ThemeIcon>
            <Text size="xs" fw={600}>Agent Info</Text>
          </Group>
          <Stack gap={4} pl={4}>
            <Group gap={4}>
              <IconFolder size={12} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed" truncate>{cwdShort}</Text>
            </Group>
            <Group gap={4}>
              <IconClock size={12} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed">
                {elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`} elapsed
              </Text>
            </Group>
            {agent.sessionId && (
              <Text size="xs" c="dimmed" truncate>
                Session: {agent.sessionId.slice(0, 8)}...
              </Text>
            )}
            {agent.pid && (
              <Text size="xs" c="dimmed">PID: {agent.pid}</Text>
            )}
          </Stack>
        </Stack>

        <Divider />

        <Text size="xs" fw={600} p="xs" pb={0}>
          Timeline
        </Text>
        <Divider my="xs" />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Timeline agentId={agent.id} />
        </div>
      </div>

      {/* Center: Chat or External info */}
      <div style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {isExternal ? (
          <Stack align="center" justify="center" gap="md" style={{ flex: 1 }} p="xl">
            <ThemeIcon variant="light" color="gray" size="xl" radius="xl">
              <IconExternalLink size={24} />
            </ThemeIcon>
            <Text size="lg" fw={500} c="dimmed">External Session</Text>
            <Text size="sm" c="dimmed" ta="center" maw={400}>
              This Claude Code session was started outside of Claude Deck
              (from a terminal or IDE). You can monitor it here but cannot
              send messages or approve commands.
            </Text>
            <Card withBorder p="md" radius="sm" w="100%" maw={400}>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">Working directory</Text>
                  <Text size="xs" fw={500}>{cwdShort}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">PID</Text>
                  <Text size="xs" fw={500}>{agent.pid ?? "—"}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">Started</Text>
                  <Text size="xs" fw={500}>{new Date(agent.createdAt).toLocaleTimeString()}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">Session</Text>
                  <Text size="xs" fw={500} truncate style={{ maxWidth: 180 }}>{agent.sessionId ?? "—"}</Text>
                </Group>
              </Stack>
            </Card>
            <Button variant="light" size="sm" onClick={() => navigate("/")}>
              Back to Dashboard
            </Button>
          </Stack>
        ) : (
          <ChatPanel agentId={agent.id} agentStatus={agent.status} />
        )}
      </div>

      {/* Right panel: Context */}
      <div
        style={{
          borderLeft: "1px solid var(--mantine-color-default-border)",
          overflow: "auto",
        }}
      >
        <ContextPanel agentId={agent.id} />
      </div>
    </div>
  );
}
