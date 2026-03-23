import { Badge, Group, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import {
  IconInbox, IconSparkles, IconClock, IconPlayerPlay, IconGitPullRequest, IconCircleCheck,
  IconBrandGithub, IconHash, IconMail, IconFileText, IconChevronRight,
} from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface NotificationItem {
  id: string;
  source: string;
  priority: string;
  status: string;
  title: string;
  summary: string;
  url?: string;
  createdAt: string;
  stage?: string;
}

const STAGES = [
  { key: "new", label: "Inbox", Icon: IconInbox, color: "#3b82f6" },
  { key: "planning", label: "Planning", Icon: IconSparkles, color: "#a855f7" },
  { key: "awaiting_approval", label: "Approval", Icon: IconClock, color: "#eab308" },
  { key: "in_progress", label: "In Progress", Icon: IconPlayerPlay, color: "#22c55e" },
  { key: "pr_ready", label: "PR Ready", Icon: IconGitPullRequest, color: "#06b6d4" },
  { key: "done", label: "Done", Icon: IconCircleCheck, color: "#6b7280" },
];

const sourceIcons: Record<string, React.FC<{ size?: number; color?: string }>> = {
  linear: SiLinear as React.FC<{ size?: number; color?: string }>,
  slack: IconHash,
  github: IconBrandGithub,
  notion: SiNotion as React.FC<{ size?: number; color?: string }>,
  email: IconMail,
};

const sourceColors: Record<string, string> = {
  linear: "#5E6AD2", slack: "#E01E5A", github: "#FFFFFF", notion: "#FFFFFF", email: "#EA4335",
};

function formatAge(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.deck.getNotifications();
        if (result) setNotifications((result as NotificationItem[]).map(n => ({ ...n, stage: n.stage ?? (n.priority === "actionable" ? "new" : "new") })));
      } catch {}
    })();
    const unsub = window.deck.onNotificationsUpdate?.((data: unknown) => {
      setNotifications((data as NotificationItem[]).map(n => ({ ...n, stage: n.stage ?? "new" })));
    });
    return unsub;
  }, []);

  const advanceStage = (id: string) => {
    setNotifications(prev => prev.map(n => {
      if (n.id !== id) return n;
      const idx = STAGES.findIndex(s => s.key === (n.stage ?? "new"));
      const nextStage = STAGES[Math.min(idx + 1, STAGES.length - 1)].key;
      return { ...n, stage: nextStage };
    }));
  };

  const dismiss = (id: string) => {
    window.deck.dismissNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const selected = notifications.find(n => n.id === selectedId);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", backgroundColor: "var(--mantine-color-body)" }}>
      {/* Header with tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 24px",
          paddingLeft: 80,
          gap: 12,
          borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
          backgroundColor: "color-mix(in srgb, var(--mantine-color-dark-8) 80%, transparent)",
          backdropFilter: "blur(8px)",
          WebkitAppRegion: "drag",
          flexShrink: 0,
        }}
      >
        <Text size="md" fw={700} style={{ WebkitAppRegion: "no-drag" }}>Claude Deck</Text>
        <Group gap={4} style={{ WebkitAppRegion: "no-drag" }}>
          <UnstyledButton
            onClick={() => navigate("/")}
            style={{ padding: "4px 12px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 500, color: "var(--mantine-color-dimmed)" }}
          >
            Agents
          </UnstyledButton>
          <UnstyledButton
            style={{ padding: "4px 12px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 500, backgroundColor: "var(--mantine-color-dark-6)", color: "var(--mantine-color-text)" }}
          >
            Inbox
            <Badge variant="filled" color="blue" size="xs" ml={6}>
              {notifications.filter(n => (n.stage ?? "new") === "new").length || "0"}
            </Badge>
          </UnstyledButton>
        </Group>
      </div>

      {/* Kanban board */}
      <ScrollArea type="auto" style={{ flex: 1 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 16,
            minWidth: "fit-content",
            height: "100%",
          }}
        >
          {STAGES.map((stage, si) => {
            const items = notifications.filter(n => (n.stage ?? "new") === stage.key);
            return (
              <div key={stage.key} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div
                  style={{
                    width: selectedId ? 200 : 240,
                    flexShrink: 0,
                    transition: "width 0.2s ease",
                  }}
                >
                  {/* Column header */}
                  <Group gap={6} mb={8} px={4}>
                    <stage.Icon size={14} color={items.length > 0 ? stage.color : "var(--mantine-color-dimmed)"} />
                    <Text size="xs" fw={600} c={items.length > 0 ? undefined : "dimmed"}>
                      {stage.label}
                    </Text>
                    {items.length > 0 && (
                      <Badge size="xs" variant="light" color="gray" circle>
                        {items.length}
                      </Badge>
                    )}
                  </Group>

                  {/* Cards */}
                  <Stack gap={6}>
                    {items.length === 0 ? (
                      <div
                        style={{
                          padding: 16,
                          borderRadius: 6,
                          border: "1px dashed color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
                          textAlign: "center",
                        }}
                      >
                        <Text size="xs" c="dimmed">Empty</Text>
                      </div>
                    ) : (
                      items.map(n => {
                        const SrcIcon = sourceIcons[n.source] ?? IconFileText;
                        const srcColor = sourceColors[n.source] ?? "#6b7280";
                        return (
                          <UnstyledButton
                            key={n.id}
                            onClick={() => setSelectedId(n.id === selectedId ? null : n.id)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 6,
                              border: `1px solid ${n.id === selectedId ? "var(--mantine-color-blue-5)" : "color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)"}`,
                              backgroundColor: "var(--mantine-color-dark-7)",
                              width: "100%",
                              textAlign: "left",
                            }}
                          >
                            <Group gap={6} mb={4}>
                              <SrcIcon size={12} color={srcColor} />
                              <Text size="xs" c="dimmed">{formatAge(n.createdAt)}</Text>
                            </Group>
                            <Text size="xs" fw={500} lineClamp={2} mb={6}>
                              {n.title}
                            </Text>
                            <Group gap={4}>
                              {stage.key === "new" && (
                                <UnstyledButton
                                  onClick={(e) => { e.stopPropagation(); advanceStage(n.id); }}
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    fontSize: "0.65rem",
                                    fontWeight: 600,
                                    backgroundColor: "var(--mantine-color-blue-5)",
                                    color: "white",
                                  }}
                                >
                                  Analyze
                                </UnstyledButton>
                              )}
                              {stage.key === "awaiting_approval" && (
                                <UnstyledButton
                                  onClick={(e) => { e.stopPropagation(); advanceStage(n.id); }}
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    fontSize: "0.65rem",
                                    fontWeight: 600,
                                    backgroundColor: "#22c55e",
                                    color: "white",
                                  }}
                                >
                                  Approve
                                </UnstyledButton>
                              )}
                              {stage.key === "pr_ready" && (
                                <UnstyledButton
                                  onClick={(e) => { e.stopPropagation(); advanceStage(n.id); }}
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    fontSize: "0.65rem",
                                    fontWeight: 600,
                                    backgroundColor: "#06b6d4",
                                    color: "white",
                                  }}
                                >
                                  Merge
                                </UnstyledButton>
                              )}
                              {(stage.key === "planning" || stage.key === "in_progress") && (
                                <UnstyledButton
                                  onClick={(e) => { e.stopPropagation(); advanceStage(n.id); }}
                                  style={{ padding: "2px 4px", borderRadius: 4, color: "var(--mantine-color-dimmed)" }}
                                >
                                  <IconChevronRight size={12} />
                                </UnstyledButton>
                              )}
                            </Group>
                          </UnstyledButton>
                        );
                      })
                    )}
                  </Stack>
                </div>

                {/* Arrow separator */}
                {si < STAGES.length - 1 && (
                  <div style={{ display: "flex", alignItems: "center", paddingTop: 40, color: "var(--mantine-color-dimmed)", opacity: 0.3 }}>
                    <IconChevronRight size={14} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Detail pane */}
      {selected && (
        <div
          style={{
            position: "fixed",
            top: 52,
            right: 0,
            bottom: 0,
            width: "40%",
            backgroundColor: "var(--mantine-color-dark-8)",
            borderLeft: "1px solid var(--mantine-color-default-border)",
            padding: 24,
            overflowY: "auto",
            zIndex: 100,
          }}
        >
          <Group justify="space-between" mb="md">
            <Badge color={STAGES.find(s => s.key === selected.stage)?.color ?? "gray"} size="sm">
              {STAGES.find(s => s.key === selected.stage)?.label}
            </Badge>
            <UnstyledButton onClick={() => setSelectedId(null)}>
              <Text size="xs" c="dimmed">Close</Text>
            </UnstyledButton>
          </Group>
          <Text size="lg" fw={600} mb="sm">{selected.title}</Text>
          <Text size="sm" c="dimmed" mb="md">{selected.summary}</Text>

          {selected.url && (
            <UnstyledButton
              onClick={() => window.deck.openExternal(selected.url!)}
              style={{ color: "var(--mantine-color-blue-4)", fontSize: "0.8rem", marginBottom: 16 }}
            >
              Open in browser →
            </UnstyledButton>
          )}

          <Group gap="xs" mt="md">
            {selected.stage !== "done" && (
              <UnstyledButton
                onClick={() => advanceStage(selected.id)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  backgroundColor: "var(--mantine-color-blue-5)",
                  color: "white",
                }}
              >
                Advance stage
              </UnstyledButton>
            )}
            <UnstyledButton
              onClick={() => dismiss(selected.id)}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                fontSize: "0.75rem",
                fontWeight: 500,
                backgroundColor: "var(--mantine-color-dark-6)",
                color: "var(--mantine-color-dimmed)",
              }}
            >
              Dismiss
            </UnstyledButton>
          </Group>
        </div>
      )}
    </div>
  );
}
