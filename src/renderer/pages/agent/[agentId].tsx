import { useNavigate, useParams } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Menu,
  Progress,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChevronDown,
  IconPlayerStop,
  IconGitBranch,
  IconFolder,
  IconRefresh,
  IconRobot,
  IconExternalLink,
  IconClock,
} from "@tabler/icons-react";
import { useState } from "react";
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

const MODEL_OPTIONS = [
  { value: "claude-opus-4-6", label: "Opus 4" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku" },
] as const;

function ErrorRecoveryBanner({
  agentId,
  sessionId,
  cwd,
  task,
  currentModel,
}: {
  agentId: string;
  sessionId: string | null;
  cwd: string;
  task: string;
  currentModel: string;
}) {
  const [retrying, setRetrying] = useState(false);

  // Get the most recent error event for this agent
  const errorEvent = useAgentStore((s) => {
    const agentEvents = s.events.filter(
      (e) => e.agentId === agentId && e.type === "error"
    );
    return agentEvents.length > 0 ? agentEvents[agentEvents.length - 1] : null;
  });

  const errorMessage = errorEvent?.summary ?? "Agent encountered an error";

  const handleRetry = async (model?: string) => {
    setRetrying(true);
    try {
      if (sessionId) {
        // Resume the existing session
        await window.deck.resumeSession(agentId, sessionId, cwd);
      } else {
        // No session to resume — spawn a fresh agent with the same task
        await window.deck.spawnAgent({
          task,
          model: model ?? currentModel,
          cwd,
          permissionMode: "default",
        });
      }
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      style={{
        padding: "var(--mantine-spacing-sm) var(--mantine-spacing-md)",
        borderBottom: "1px solid var(--mantine-color-red-9)",
        backgroundColor: "color-mix(in srgb, var(--mantine-color-red-9) 15%, transparent)",
      }}
    >
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <ThemeIcon variant="light" color="red" size="md" radius="xl" mt={2}>
          <IconAlertTriangle size={14} />
        </ThemeIcon>
        <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} c="red.4">
            Agent Error
          </Text>
          <Text
            size="xs"
            c="red.3"
            style={{
              fontFamily: "var(--mantine-font-family-monospace)",
              wordBreak: "break-word",
            }}
          >
            {errorMessage}
          </Text>
        </Stack>
        <Group gap="xs" style={{ flexShrink: 0 }}>
          <Button
            variant="light"
            color="red"
            size="xs"
            leftSection={<IconRefresh size={12} />}
            loading={retrying}
            onClick={() => handleRetry()}
          >
            Retry
          </Button>
          <Menu shadow="md" width={180} position="bottom-end">
            <Menu.Target>
              <Button
                variant="subtle"
                color="red"
                size="xs"
                rightSection={<IconChevronDown size={12} />}
                disabled={retrying}
              >
                Retry with...
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Choose model</Menu.Label>
              {MODEL_OPTIONS.map((opt) => (
                <Menu.Item
                  key={opt.value}
                  onClick={() => handleRetry(opt.value)}
                  rightSection={
                    opt.value === currentModel ? (
                      <Badge size="xs" variant="light" color="gray">
                        current
                      </Badge>
                    ) : null
                  }
                >
                  {opt.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </div>
  );
}

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
          minHeight: 0,
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

      {/* Center: Chat (shown for ALL agents, external get a banner + read-only) */}
      <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
        {agent.status === "errored" && (
          <ErrorRecoveryBanner
            agentId={agent.id}
            sessionId={agent.sessionId}
            cwd={agent.cwd}
            task={agent.task}
            currentModel={agent.model}
          />
        )}
        {isExternal && (
          <Group
            gap="xs"
            p="xs"
            style={{
              borderBottom: "1px solid var(--mantine-color-default-border)",
              backgroundColor: "var(--mantine-color-dark-7)",
            }}
          >
            <IconExternalLink size={14} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed" style={{ flex: 1 }}>
              {agent.status === "active" ? "Live session — watching for new messages" : "External session — read-only view"}
            </Text>
            {agent.sessionId && (
              <Button
                variant="light"
                size="xs"
                onClick={async () => {
                  if (agent.sessionId) {
                    await window.deck.resumeSession(agent.id, agent.sessionId, agent.cwd);
                  }
                }}
              >
                Resume &amp; Chat
              </Button>
            )}
          </Group>
        )}
        <ChatPanel agentId={agent.id} agentStatus={agent.status} isReadOnly={isExternal} />
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
