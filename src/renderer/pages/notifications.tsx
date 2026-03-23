import { Badge, Code, Group, Loader, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import {
  IconInbox, IconSparkles, IconClock, IconPlayerPlay, IconGitPullRequest, IconCircleCheck,
  IconBrandGithub, IconHash, IconMail, IconFileText, IconChevronRight,
} from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { useState, useEffect, useRef } from "react";
import { Markdown } from "../components/Markdown";
import { useNavigate } from "react-router-dom";

interface NotificationItem {
  id: string;
  source: string;
  priority: string;
  status: string;
  title: string;
  summary: string;
  url?: string;
  links?: Array<{ type: string; label: string; url: string }>;
  taskType?: string;
  author?: string;
  confidence?: number;
  actionNeeded?: string;
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
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await window.deck.getNotifications();
        if (result) {
          const items = (result as NotificationItem[]).map(n => ({ ...n, stage: n.stage ?? "new" }));
          // Replace entirely — the backend handles dedup
          if (items.length > 0) {
            setNotifications(items);
            setFetching(false);
          }
        }
      } catch {}
    };

    load();
    // Re-fetch every 5s until we get data, then every 15s
    const interval = setInterval(load, fetching ? 5000 : 15000);

    const unsub = window.deck.onNotificationsUpdate?.((data: unknown) => {
      const items = (data as NotificationItem[]).map(n => ({ ...n, stage: n.stage ?? "new" }));
      if (items.length > 0) {
        setNotifications(items);
        setFetching(false);
      }
    });

    // Stop showing fetching after 45s max
    const fetchTimeout = setTimeout(() => setFetching(false), 45000);

    return () => {
      clearInterval(interval);
      clearTimeout(fetchTimeout);
      unsub?.();
    };
  }, [fetching]);

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

  const [showDebug, setShowDebug] = useState(false);
  const [lookbackHours, setLookbackHours] = useState(168);
  const [debugEntries, setDebugEntries] = useState<Array<{ timestamp: string; direction: string; content: string }>>([]);

  useEffect(() => {
    if (!showDebug) return;
    const fetchDebug = async () => {
      try {
        const res = await fetch("http://localhost:9876/api/debug");
        const data = await res.json();
        setDebugEntries(data);
      } catch {}
    };
    fetchDebug();
    const interval = setInterval(fetchDebug, 2000);
    return () => clearInterval(interval);
  }, [showDebug]);

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
        <Group gap={8} style={{ WebkitAppRegion: "no-drag" }}>
          {fetching ? (
            <>
              <div style={{ width: 14, height: 14, border: "2px solid var(--mantine-color-blue-5)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <Text size="xs" c="blue">Fetching from Slack, Linear, GitHub...</Text>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </>
          ) : (
            <>
              <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#22c55e" }} />
              <Text size="xs" c="dimmed">{notifications.length} items</Text>
            </>
          )}
          <select
            value={lookbackHours}
            onChange={(e) => setLookbackHours(Number(e.target.value))}
            style={{
              padding: "2px 6px", borderRadius: 4, fontSize: "0.65rem",
              backgroundColor: "var(--mantine-color-dark-6)", color: "var(--mantine-color-dimmed)",
              border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)",
              outline: "none", cursor: "pointer",
            }}
          >
            <option value={2}>Last 2h</option>
            <option value={6}>Last 6h</option>
            <option value={12}>Last 12h</option>
            <option value={24}>Last 24h</option>
            <option value={48}>Last 2 days</option>
            <option value={168}>Last week</option>
          </select>
          <UnstyledButton
            onClick={() => { setFetching(true); window.deck.refreshNotifications(lookbackHours); }}
            style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 500, backgroundColor: "var(--mantine-color-dark-6)", color: "var(--mantine-color-dimmed)" }}
          >
            Refresh
          </UnstyledButton>
          <UnstyledButton
            onClick={() => setShowDebug(!showDebug)}
            style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 500, color: showDebug ? "var(--mantine-color-blue-4)" : "var(--mantine-color-dimmed)" }}
          >
            {showDebug ? "Hide logs" : "Logs"}
          </UnstyledButton>
          {notifications.length > 0 && (
            <UnstyledButton
              onClick={() => { window.deck.clearNotifications(); setNotifications([]); }}
              style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 500, color: "var(--mantine-color-red-4)" }}
            >
              Clear
            </UnstyledButton>
          )}
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
            const items = notifications
              .filter(n => (n.stage ?? "new") === stage.key)
              .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
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
                            <Group gap={6} mb={4} justify="space-between">
                              <Group gap={4}>
                                <SrcIcon size={12} color={srcColor} />
                                {n.author && <Text size="xs" c="dimmed" truncate style={{ maxWidth: 80 }}>{n.author}</Text>}
                              </Group>
                              <Group gap={4}>
                                {n.confidence && (
                                  <div style={{
                                    width: 16, height: 16, borderRadius: "50%", fontSize: "0.55rem", fontWeight: 700,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    backgroundColor: n.confidence >= 8 ? "#ef4444" : n.confidence >= 6 ? "#eab308" : "#6b7280",
                                    color: "white",
                                  }}>
                                    {n.confidence}
                                  </div>
                                )}
                                <Text size="xs" c="dimmed">{formatAge(n.createdAt)}</Text>
                              </Group>
                            </Group>
                            <Text size="xs" fw={500} lineClamp={2} mb={4}>
                              {n.title}
                            </Text>
                            {n.taskType && (
                              <Badge size="xs" variant="outline" color="gray" radius="sm" mb={4} style={{ fontSize: "0.55rem" }}>
                                {n.taskType}
                              </Badge>
                            )}
                            {n.actionNeeded && (
                              <Text size="xs" c="blue.4" lineClamp={1} mb={4} style={{ fontSize: "0.65rem" }}>
                                → {n.actionNeeded}
                              </Text>
                            )}
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

      {/* Debug sidebar */}
      {showDebug && (
        <div style={{
          position: "fixed", top: 52, right: 0, bottom: 0, width: 400,
          backgroundColor: "var(--mantine-color-dark-9)",
          borderLeft: "1px solid var(--mantine-color-default-border)",
          zIndex: 50, display: "flex", flexDirection: "column",
          fontSize: "0.7rem", fontFamily: "var(--mantine-font-family-monospace)",
        }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}>
            <Group justify="space-between">
              <Text size="xs" fw={600}>Bridge Activity</Text>
              <Text size="xs" c="dimmed">{debugEntries.length} entries</Text>
            </Group>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {debugEntries.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="md">Waiting for bridge activity...</Text>
            ) : (
              debugEntries.slice(-50).map((entry, i) => (
                <div key={i} style={{
                  padding: "4px 8px", marginBottom: 4, borderRadius: 4,
                  backgroundColor: entry.direction === "in"
                    ? "color-mix(in srgb, var(--mantine-color-blue-5) 10%, transparent)"
                    : "var(--mantine-color-dark-7)",
                  borderLeft: `2px solid ${entry.direction === "in" ? "var(--mantine-color-blue-5)" : "var(--mantine-color-green-5)"}`,
                }}>
                  <Group gap={4} mb={2}>
                    <Text size="xs" c={entry.direction === "in" ? "blue" : "green"} fw={600}>
                      {entry.direction === "in" ? "→" : "←"}
                    </Text>
                    <Text size="xs" c="dimmed">{new Date(entry.timestamp).toLocaleTimeString()}</Text>
                  </Group>
                  <Text size="xs" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 150, overflow: "auto" }}>
                    {entry.content.slice(0, 1000)}
                  </Text>
                </div>
              ))
            )}
          </div>
        </div>
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
  const [conversation, setConversation] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [hasApproved, setHasApproved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load existing plan on mount
  useEffect(() => {
    (async () => {
      try {
        const existing = await window.deck.getPlan(n.id);
        if (existing && (existing as { conversationHistory: typeof conversation }).conversationHistory?.length > 0) {
          setConversation((existing as { conversationHistory: typeof conversation }).conversationHistory);
        }
      } catch {}
    })();
  }, [n.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation.length]);

  const handlePrepare = async () => {
    setLoading(true);
    setConversation([{ role: "user", content: `Analyze and create a plan for: ${n.title}` }]);
    try {
      const result = await window.deck.prepareWorkPlan({
        id: n.id, source: n.source, title: n.title, summary: n.summary, url: n.url,
        taskType: n.taskType, links: n.links,
      });
      const plan = result as { conversationHistory: typeof conversation };
      if (plan?.conversationHistory) setConversation(plan.conversationHistory);
    } catch {}
    setLoading(false);
  };

  const handleFeedback = async () => {
    if (!feedback.trim() || loading) return;
    const msg = feedback.trim();
    setFeedback("");
    setConversation(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const result = await window.deck.iteratePlan(n.id, msg);
      const plan = result as { conversationHistory: typeof conversation };
      if (plan?.conversationHistory) setConversation(plan.conversationHistory);
    } catch {}
    setLoading(false);
  };

  const handleApprove = async () => {
    setHasApproved(true);
    setLoading(true);
    try {
      const agentId = await window.deck.startWorkAgent(n.id);
      onAdvance();
    } catch {}
    setLoading(false);
  };

  const stage = STAGES.find(s => s.key === (n.stage ?? "new"));
  const Icon = sourceIcons[n.source] ?? IconFileText;
  const color = sourceColors[n.source] ?? "#6b7280";

  return (
    <div style={{
      position: "fixed", top: 52, right: 0, bottom: 0, width: "45%",
      backgroundColor: "var(--mantine-color-dark-8)",
      borderLeft: "1px solid var(--mantine-color-default-border)",
      zIndex: 100, display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}>
        <Group justify="space-between" mb={4}>
          <Group gap="xs">
            <Icon size={14} color={color} />
            <Badge color={stage?.color ?? "gray"} size="xs">{stage?.label ?? n.stage}</Badge>
            {n.confidence && <Badge size="xs" color={n.confidence >= 8 ? "red" : n.confidence >= 6 ? "yellow" : "gray"}>{n.confidence}/10</Badge>}
          </Group>
          <UnstyledButton onClick={onClose}><Text size="xs" c="dimmed">Close</Text></UnstyledButton>
        </Group>
        <Text size="sm" fw={600}>{n.title}</Text>
        {n.author && <Text size="xs" c="dimmed">{n.author}</Text>}
      </div>

      {/* Notification context */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}>
        <Text size="xs" c="dimmed">{n.summary}</Text>
        {n.actionNeeded && <Text size="xs" c="blue.4" mt={4}>→ {n.actionNeeded}</Text>}
        {/* Show all linked resources */}
        {n.links && n.links.length > 0 && (
          <Stack gap={2} mt={6}>
            {n.links.map((link, i) => (
              <UnstyledButton
                key={i}
                onClick={() => window.deck.openExternal(link.url)}
                style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--mantine-color-blue-4)", fontSize: "0.7rem" }}
              >
                <Badge size="xs" variant="light" color="gray" radius="sm">{link.type}</Badge>
                {link.label} →
              </UnstyledButton>
            ))}
          </Stack>
        )}
        {!n.links?.length && n.url && (
          <UnstyledButton onClick={() => window.deck.openExternal(n.url!)} style={{ color: "var(--mantine-color-blue-4)", fontSize: "0.7rem", marginTop: 4 }}>
            Open in browser →
          </UnstyledButton>
        )}
      </div>

      {/* Related links */}
      {n.links && n.links.length > 0 && (
        <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}>
          <Text size="xs" fw={600} c="dimmed" mb={4}>Related resources</Text>
          <Group gap={6} wrap="wrap">
            {n.links.map((link, i) => (
              <UnstyledButton
                key={i}
                onClick={() => window.deck.openExternal(link.url)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", borderRadius: 4, fontSize: "0.65rem",
                  backgroundColor: "var(--mantine-color-dark-6)",
                  color: "var(--mantine-color-blue-4)",
                  border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
                }}
              >
                <Badge size="xs" variant="light" color="gray" radius="sm" style={{ fontSize: "0.55rem" }}>{link.type}</Badge>
                {link.label}
              </UnstyledButton>
            ))}
          </Group>
        </div>
      )}

      {/* Conversation area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {conversation.length === 0 && !loading && (
          <Stack align="center" py="xl" gap="sm">
            <Text size="sm" c="dimmed">Click "Analyze" to have the Manager fetch context and propose a plan.</Text>
          </Stack>
        )}

        {conversation.map((msg, i) => (
          <div key={i} style={{
            padding: "10px 14px", borderRadius: 8, marginBottom: 8,
            backgroundColor: msg.role === "user"
              ? "color-mix(in srgb, var(--mantine-color-blue-5) 15%, transparent)"
              : "var(--mantine-color-dark-7)",
            border: msg.role === "assistant" ? "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)" : undefined,
            maxWidth: msg.role === "user" ? "80%" : "100%",
            marginLeft: msg.role === "user" ? "auto" : 0,
          }}>
            <Markdown content={msg.content} />
          </div>
        ))}

        {loading && (
          <Group gap={8} py="sm">
            <Loader size={14} />
            <Text size="xs" c="dimmed">{conversation.length === 0 ? "Fetching context and analyzing..." : "Thinking..."}</Text>
          </Group>
        )}
      </div>

      {/* Input + actions */}
      <div style={{ padding: "12px 20px", borderTop: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}>
        {conversation.length === 0 ? (
          <Group gap="xs">
            <UnstyledButton onClick={handlePrepare} style={{
              padding: "8px 16px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600,
              backgroundColor: "var(--mantine-color-blue-5)", color: "white",
            }}>
              Analyze & plan
            </UnstyledButton>
            <UnstyledButton onClick={onDismiss} style={{
              padding: "8px 16px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 500,
              backgroundColor: "var(--mantine-color-dark-6)", color: "var(--mantine-color-dimmed)",
            }}>
              Dismiss
            </UnstyledButton>
          </Group>
        ) : (
          <Stack gap="xs">
            <Group gap="xs">
              <input
                type="text"
                placeholder="Push back, ask questions, or refine the plan..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleFeedback(); }}
                disabled={loading || hasApproved}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 6, fontSize: "0.8rem",
                  backgroundColor: "var(--mantine-color-dark-6)",
                  border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)",
                  color: "var(--mantine-color-text)", outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <UnstyledButton onClick={handleFeedback} disabled={!feedback.trim() || loading} style={{
                padding: "8px 12px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 500,
                backgroundColor: "var(--mantine-color-dark-5)", color: "var(--mantine-color-dimmed)",
              }}>
                Send
              </UnstyledButton>
            </Group>
            <Group gap="xs">
              {!hasApproved && (
                <UnstyledButton onClick={handleApprove} style={{
                  padding: "8px 16px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600,
                  backgroundColor: "#22c55e", color: "white",
                }}>
                  Approve plan & start agent
                </UnstyledButton>
              )}
              <UnstyledButton onClick={onDismiss} style={{
                padding: "8px 16px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 500,
                color: "var(--mantine-color-dimmed)",
              }}>
                Dismiss
              </UnstyledButton>
            </Group>
          </Stack>
        )}
      </div>
    </div>
  );
}
