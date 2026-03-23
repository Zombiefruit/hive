import { Badge, Code, Group, Loader, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
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
    const load = async () => {
      try {
        const result = await window.deck.getNotifications();
        if (result && (result as NotificationItem[]).length > 0) {
          setNotifications(prev => {
            const existing = new Set(prev.map(n => n.id));
            const newItems = (result as NotificationItem[])
              .filter(n => !existing.has(n.id))
              .map(n => ({ ...n, stage: n.stage ?? "new" }));
            return [...newItems, ...prev];
          });
        }
      } catch {}
    };
    load();
    // Re-fetch every 10s to catch new polls
    const refetchInterval = setInterval(load, 10000);

    const unsub = window.deck.onNotificationsUpdate?.((data: unknown) => {
      const items = data as NotificationItem[];
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id));
        const newItems = items
          .filter(n => !existingIds.has(n.id))
          .map(n => ({ ...n, stage: n.stage ?? "new" }));
        if (newItems.length === 0) return prev;
        return [...newItems, ...prev];
      });
    });

    return () => {
      clearInterval(refetchInterval);
      unsub?.();
    };
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
        <Text size="md" fw={700} style={{ WebkitAppRegion: "no-drag", minWidth: 120 }}>Claude Deck</Text>
        {/* Centered tabs */}
        <Group gap={4} style={{ WebkitAppRegion: "no-drag", position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          <UnstyledButton
            onClick={() => navigate("/")}
            style={{ padding: "4px 14px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 500, color: "var(--mantine-color-dimmed)" }}
          >
            Agents
          </UnstyledButton>
          <UnstyledButton
            style={{ padding: "4px 14px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 500, backgroundColor: "var(--mantine-color-dark-6)", color: "var(--mantine-color-text)" }}
          >
            Inbox
          </UnstyledButton>
        </Group>
        <div style={{ WebkitAppRegion: "no-drag", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            backgroundColor: notifications.length > 0 ? "#22c55e" : "#eab308",
            animation: "pulse-dot 2s ease-in-out infinite",
          }} />
          <Text size="xs" c="dimmed">
            {notifications.length} items · Polling every 2m
          </Text>
          <style>{`@keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
        </div>
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
                          <div
                            key={n.id}
                            onClick={() => setSelectedId(n.id === selectedId ? null : n.id)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 6,
                              border: `1px solid ${n.id === selectedId ? "var(--mantine-color-blue-5)" : "color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)"}`,
                              backgroundColor: "var(--mantine-color-dark-7)",
                              width: "100%",
                              textAlign: "left",
                              cursor: "pointer",
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
                          </div>
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
        <DetailPane
          notification={selected}
          onClose={() => setSelectedId(null)}
          onAdvance={() => advanceStage(selected.id)}
          onDismiss={() => dismiss(selected.id)}
        />
      )}
    </div>
  );
}

function DetailPane({ notification: n, onClose, onAdvance, onDismiss }: {
  notification: NotificationItem;
  onClose: () => void;
  onAdvance: () => void;
  onDismiss: () => void;
}) {
  const [plan, setPlan] = useState<{ title: string; context: string; plan: string; estimatedModel: string; estimatedCost: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [starting, setStarting] = useState(false);

  const handlePrepare = async () => {
    setPreparing(true);
    try {
      const result = await window.deck.prepareWorkPlan({
        id: n.id, source: n.source, title: n.title, summary: n.summary, url: n.url,
      });
      setPlan(result as typeof plan);
    } catch {}
    setPreparing(false);
  };

  const handleStart = async () => {
    if (!plan) return;
    setStarting(true);
    try {
      await window.deck.startWorkAgent(plan);
      onAdvance(); // Move to "in_progress" stage
    } catch {}
    setStarting(false);
  };

  const stage = STAGES.find(s => s.key === (n.stage ?? "new"));
  const Icon = sourceIcons[n.source] ?? IconFileText;
  const color = sourceColors[n.source] ?? "#6b7280";

  return (
    <div
      style={{
        position: "fixed",
        top: 52,
        right: 0,
        bottom: 0,
        width: "40%",
        backgroundColor: "var(--mantine-color-dark-8)",
        borderLeft: "1px solid var(--mantine-color-default-border)",
        overflowY: "auto",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--mantine-color-default-border)" }}>
        <Group justify="space-between" mb={8}>
          <Group gap="xs">
            <Icon size={16} color={color} />
            <Badge color={stage?.color ?? "gray"} size="sm">{stage?.label ?? n.stage}</Badge>
          </Group>
          <UnstyledButton onClick={onClose}>
            <Text size="xs" c="dimmed">Close</Text>
          </UnstyledButton>
        </Group>
        <Text size="lg" fw={600}>{n.title}</Text>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        <Text size="sm" c="dimmed" mb="md">{n.summary}</Text>

        {n.url && (
          <UnstyledButton
            onClick={() => window.deck.openExternal(n.url!)}
            style={{ color: "var(--mantine-color-blue-4)", fontSize: "0.8rem", marginBottom: 16, display: "block" }}
          >
            Open in browser →
          </UnstyledButton>
        )}

        {/* Work plan section */}
        {plan && (
          <div style={{
            padding: 16,
            borderRadius: 8,
            backgroundColor: "var(--mantine-color-dark-7)",
            border: "1px solid color-mix(in srgb, var(--mantine-color-blue-5) 30%, transparent)",
            marginBottom: 16,
          }}>
            <Text size="xs" fw={600} c="blue" mb={8} tt="uppercase" style={{ letterSpacing: "0.05em" }}>
              Work Plan
            </Text>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }} mb={8}>{plan.plan}</Text>
            <Group gap="md">
              <Text size="xs" c="dimmed">Model: {plan.estimatedModel.replace("claude-", "").replace("-4-6", " 4")}</Text>
              <Text size="xs" c="dimmed">Est. cost: {plan.estimatedCost}</Text>
            </Group>

            {plan.context && (
              <>
                <Text size="xs" fw={600} c="dimmed" mt="md" mb={4}>Context fetched:</Text>
                <Code block style={{ fontSize: "0.7rem", maxHeight: 200, overflow: "auto" }}>
                  {plan.context.slice(0, 2000)}
                </Code>
              </>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: "12px 24px", borderTop: "1px solid var(--mantine-color-default-border)" }}>
        <Group gap="xs">
          {!plan && n.stage === "new" && (
            <UnstyledButton
              onClick={handlePrepare}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                fontSize: "0.8rem",
                fontWeight: 600,
                backgroundColor: "var(--mantine-color-blue-5)",
                color: "white",
                opacity: preparing ? 0.7 : 1,
              }}
            >
              {preparing ? <Group gap={6}><Loader size={12} color="white" /> Fetching context...</Group> : "Prepare work plan"}
            </UnstyledButton>
          )}

          {plan && !starting && (
            <UnstyledButton
              onClick={handleStart}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                fontSize: "0.8rem",
                fontWeight: 600,
                backgroundColor: "#22c55e",
                color: "white",
              }}
            >
              Approve & start agent
            </UnstyledButton>
          )}

          {starting && (
            <Group gap={6}>
              <Loader size={14} />
              <Text size="sm">Starting agent...</Text>
            </Group>
          )}

          <UnstyledButton
            onClick={onDismiss}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              fontSize: "0.8rem",
              fontWeight: 500,
              backgroundColor: "var(--mantine-color-dark-6)",
              color: "var(--mantine-color-dimmed)",
            }}
          >
            Dismiss
          </UnstyledButton>
        </Group>
      </div>
    </div>
  );
}
