import { Badge, Group, Loader, ScrollArea, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { IconArrowLeft, IconRobot, IconClock, IconCheck, IconAlertTriangle } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Markdown } from "../../components/Markdown";

interface TaskEvent {
  timestamp: string;
  type: "started" | "progress" | "tool_use" | "error" | "completed" | "escalation";
  content: string;
}

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [events, setEvents] = useState<TaskEvent[]>([
    { timestamp: new Date().toISOString(), type: "started", content: "Agent started working on this task" },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events.length]);

  // TODO: Subscribe to agent stream events for this task
  // For now, show a placeholder

  const eventIcons: Record<string, { icon: typeof IconRobot; color: string }> = {
    started: { icon: IconRobot, color: "#3b82f6" },
    progress: { icon: IconClock, color: "#22c55e" },
    tool_use: { icon: IconRobot, color: "#a855f7" },
    error: { icon: IconAlertTriangle, color: "#ef4444" },
    completed: { icon: IconCheck, color: "#22c55e" },
    escalation: { icon: IconAlertTriangle, color: "#eab308" },
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--mantine-color-body)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        padding: "8px 24px", paddingLeft: 80,
        borderBottom: "1px solid var(--mantine-color-default-border)",
        backgroundColor: "color-mix(in srgb, var(--mantine-color-dark-8) 80%, transparent)",
        backdropFilter: "blur(8px)",
        WebkitAppRegion: "drag",
        flexShrink: 0,
      }}>
        <Group gap="sm" style={{ WebkitAppRegion: "no-drag" }}>
          <UnstyledButton onClick={() => navigate("/notifications")} style={{ padding: 4 }}>
            <IconArrowLeft size={16} />
          </UnstyledButton>
          <Title order={4}>Task: {taskId?.slice(0, 8)}</Title>
          <Badge variant="light" color="blue" size="sm">In Progress</Badge>
        </Group>
      </div>

      {/* Content: timeline + agent output */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "300px 1fr", overflow: "hidden" }}>
        {/* Timeline */}
        <div style={{ borderRight: "1px solid var(--mantine-color-default-border)", overflow: "auto", padding: 16 }}>
          <Text size="xs" fw={600} mb="md">Timeline</Text>
          <Stack gap={8}>
            {events.map((event, i) => {
              const cfg = eventIcons[event.type] ?? eventIcons.progress;
              const Icon = cfg.icon;
              return (
                <Group key={i} gap={8} align="flex-start" wrap="nowrap">
                  <Icon size={14} color={cfg.color} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <Text size="xs">{event.content}</Text>
                    <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: "0.6rem" }}>
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </Text>
                  </div>
                </Group>
              );
            })}
          </Stack>
        </div>

        {/* Agent output stream */}
        <div ref={scrollRef} style={{ overflow: "auto", padding: 24 }}>
          <Stack align="center" py="xl" gap="sm">
            <Loader size="md" />
            <Text size="sm" c="dimmed">Agent is working...</Text>
            <Text size="xs" c="dimmed">Live output will appear here as the agent works.</Text>
          </Stack>
        </div>
      </div>
    </div>
  );
}
