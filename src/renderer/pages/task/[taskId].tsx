import { Badge, Group, Loader, ScrollArea, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { IconArrowLeft, IconRobot, IconClock, IconCheck, IconAlertTriangle, IconTerminal2, IconMessage } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Markdown } from "../../components/Markdown";

interface TaskEvent {
  timestamp: string;
  type: "started" | "progress" | "tool_use" | "error" | "completed" | "escalation" | "text";
  content: string;
}

const eventConfig: Record<string, { icon: typeof IconRobot; color: string; label: string }> = {
  started: { icon: IconRobot, color: "var(--mantine-color-blue-filled)", label: "Started" },
  progress: { icon: IconClock, color: "var(--mantine-color-green-filled)", label: "Progress" },
  tool_use: { icon: IconTerminal2, color: "var(--mantine-color-violet-filled)", label: "Tool" },
  text: { icon: IconMessage, color: "var(--mantine-color-dimmed)", label: "Response" },
  error: { icon: IconAlertTriangle, color: "var(--mantine-color-red-filled)", label: "Error" },
  completed: { icon: IconCheck, color: "var(--mantine-color-green-filled)", label: "Done" },
  escalation: { icon: IconAlertTriangle, color: "var(--mantine-color-yellow-filled)", label: "Needs input" },
};

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Subscribe to live task events
  useEffect(() => {
    const unsub = window.deck.onTaskEvent?.((data: { agentId: string; event: unknown }) => {
      if (data.agentId !== taskId) return;
      const event = data.event as TaskEvent;
      setEvents(prev => [...prev, event]);
      if (event.type === "completed") setIsComplete(true);
    });
    return unsub;
  }, [taskId]);

  // Auto-scroll
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [events.length]);

  // Separate text events (agent's thinking) from tool events (timeline)
  const timelineEvents = events.filter(e => e.type !== "text");
  const textEvents = events.filter(e => e.type === "text");

  return (
    <div style={{ height: "100%", background: "var(--aegen-void)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        padding: "8px 24px", paddingLeft: 80,
        borderBottom: "1px solid var(--aegen-glass-border)",
        background: "var(--aegen-glass-bg)",
        backdropFilter: "var(--aegen-glass-blur)",
        WebkitAppRegion: "drag",
        flexShrink: 0,
      }}>
        <Group gap="sm" style={{ WebkitAppRegion: "no-drag" }}>
          <UnstyledButton onClick={() => navigate("/notifications")} style={{ padding: 4 }}>
            <IconArrowLeft size={16} />
          </UnstyledButton>
          <Title order={4}>Task</Title>
          <Badge variant="light" color={isComplete ? "green" : "blue"} size="sm">
            {isComplete ? "Completed" : "In Progress"}
          </Badge>
          <Text size="xs" c="dimmed" ff="monospace">{taskId?.slice(0, 12)}</Text>
          {!isComplete && <Loader size={12} />}
        </Group>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "320px 1fr", overflow: "hidden", minHeight: 0 }}>
        {/* Timeline sidebar */}
        <div ref={timelineRef} style={{ borderRight: "1px solid var(--aegen-glass-border)", overflowY: "auto", padding: 16 }}>
          <Text size="xs" fw={600} mb="md">Timeline ({timelineEvents.length} events)</Text>

          {timelineEvents.length === 0 && !isComplete && (
            <Stack align="center" py="xl" gap="sm">
              <Loader size="sm" />
              <Text size="xs" c="dimmed">Waiting for agent activity...</Text>
            </Stack>
          )}

          <Stack gap={6}>
            {timelineEvents.map((event, i) => {
              const cfg = eventConfig[event.type] ?? eventConfig.progress;
              const Icon = cfg.icon;
              return (
                <div key={i} style={{
                  display: "flex", gap: 8, alignItems: "flex-start",
                  padding: "6px 8px", borderRadius: 6,
                  backgroundColor: event.type === "error" ? "rgba(255, 107, 61, 0.08)" :
                    event.type === "escalation" ? "rgba(255, 170, 51, 0.08)" : "transparent",
                }}>
                  <Icon size={13} color={cfg.color} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Text size="xs" lineClamp={3}>{event.content}</Text>
                    <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: "0.55rem" }}>
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </Text>
                  </div>
                </div>
              );
            })}
          </Stack>
        </div>

        {/* Agent output */}
        <div ref={outputRef} style={{ overflowY: "auto", padding: 24 }}>
          {textEvents.length === 0 && !isComplete && (
            <Stack align="center" py="xl" gap="sm">
              <Loader size="md" />
              <Text size="sm" c="dimmed">Agent is working...</Text>
              <Text size="xs" c="dimmed">Responses will appear here as the agent thinks and works.</Text>
            </Stack>
          )}

          <Stack gap={8}>
            {textEvents.map((event, i) => (
              <div key={i} style={{
                padding: "12px 16px", borderRadius: 8,
                background: "var(--aegen-glass-bg)", backdropFilter: "var(--aegen-glass-blur)",
                border: "1px solid var(--aegen-glass-border)",
              }}>
                <Markdown content={event.content} />
                <Text size="xs" c="dimmed" mt={4} ff="monospace" style={{ fontSize: "0.55rem" }}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </Text>
              </div>
            ))}
          </Stack>

          {isComplete && (
            <div style={{
              marginTop: 16, padding: 16, borderRadius: 8,
              backgroundColor: "rgba(38, 191, 126, 0.08)",
              border: "1px solid rgba(38, 191, 126, 0.2)",
            }}>
              <Group gap={8}>
                <IconCheck size={16} color="var(--mantine-color-green-filled)" />
                <Text size="sm" fw={600} c="green">Task completed</Text>
              </Group>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
