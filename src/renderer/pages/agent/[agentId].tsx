import { useNavigate, useParams } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Progress,
  Stack,
  Text,
} from "@mantine/core";
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
};

export function AgentDetail() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const agent = useAgentStore((s) => s.agents.find((a) => a.id === agentId));

  if (!agent) {
    return (
      <Stack align="center" py="xl">
        <Text c="dimmed">Agent not found</Text>
        <Button variant="light" onClick={() => navigate("/")}>
          Back to Dashboard
        </Button>
      </Stack>
    );
  }

  const budgetPct =
    agent.maxBudgetUsd && agent.maxBudgetUsd > 0
      ? Math.min(100, (agent.costUsd / agent.maxBudgetUsd) * 100)
      : 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr 300px",
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
          borderBottom: "1px solid var(--mantine-color-default-border)",
          WebkitAppRegion: "drag",
        }}
      >
        <Group justify="space-between" align="center">
          <Group gap="sm" style={{ WebkitAppRegion: "no-drag" }}>
            <ActionIcon
              variant="subtle"
              onClick={() => navigate("/")}
              aria-label="Back"
            >
              <Text size="sm">&larr;</Text>
            </ActionIcon>
            <Badge
              variant="light"
              color={statusColors[agent.status] ?? "gray"}
              size="sm"
            >
              {agent.status}
            </Badge>
            <Text size="sm" fw={500} truncate style={{ maxWidth: 400 }}>
              {agent.task}
            </Text>
          </Group>
          <Group gap="sm" style={{ WebkitAppRegion: "no-drag" }}>
            <Badge variant="outline" color="gray" size="xs">
              {modelLabels[agent.model] ?? agent.model}
            </Badge>
            {agent.branch && (
              <Badge variant="light" color="violet" size="xs">
                {agent.branch}
              </Badge>
            )}
            <Text size="xs" c="dimmed">
              ${agent.costUsd.toFixed(3)}
            </Text>
            {agent.maxBudgetUsd && agent.maxBudgetUsd > 0 && (
              <Progress
                value={budgetPct}
                color={budgetPct > 80 ? "red" : "blue"}
                size="sm"
                w={80}
                aria-label="Budget usage"
              />
            )}
            {agent.status === "active" && (
              <ActionIcon
                variant="light"
                color="red"
                size="sm"
                onClick={() => window.deck.killAgent(agent.id)}
                aria-label="Kill agent"
              >
                <Text size="xs" fw={700}>&times;</Text>
              </ActionIcon>
            )}
          </Group>
        </Group>
      </div>

      {/* Left sidebar: Timeline */}
      <div
        style={{
          borderRight: "1px solid var(--mantine-color-default-border)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Text size="xs" fw={600} p="xs" pb={0}>
          Timeline
        </Text>
        <Divider my="xs" />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Timeline agentId={agent.id} />
        </div>
      </div>

      {/* Center: Chat */}
      <div style={{ overflow: "hidden" }}>
        <ChatPanel agentId={agent.id} agentStatus={agent.status} />
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
