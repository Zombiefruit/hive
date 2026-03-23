import { Badge, Group, Loader, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import {
  IconInbox, IconSparkles, IconClock, IconPlayerPlay, IconGitPullRequest, IconCircleCheck,
  IconBrandGithub, IconHash, IconMail, IconFileText, IconChevronRight, IconChevronDown,
  IconGripVertical, IconEyeOff,
} from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { useState, useEffect, useRef, useCallback } from "react";
import { Markdown } from "../components/Markdown";
import { AddToManagerButton } from "../components/AddToManagerButton";
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

// Agent-actionable: an agent can do the actual work
const AGENT_ACTIONABLE_TYPES = new Set(["implementation", "investigation", "review", "planning"]);
// Human-only: agent can prepare context but you handle it
const HUMAN_ONLY_TYPES = new Set(["meeting_prep", "response", "follow_up"]);

type StageConfig = { key: string; label: string; Icon: React.FC<{ size?: number; color?: string; stroke?: number }>; color: string; tip: string };

const SHARED_STAGES: StageConfig[] = [
  { key: "new", label: "Inbox", Icon: IconInbox, color: "#3b82f6", tip: "New items from all sources." },
  { key: "follow_up", label: "Follow Up", Icon: IconClock, color: "#f59e0b", tip: "Recheck later — waiting for reply." },
];

const AGENT_STAGES: StageConfig[] = [
  { key: "planning", label: "Planning", Icon: IconSparkles, color: "#a855f7", tip: "AI creates a work plan." },
  { key: "working", label: "Working", Icon: IconPlayerPlay, color: "#22c55e", tip: "Agent executing the plan." },
];

const HUMAN_STAGES: StageConfig[] = [
  { key: "prepared", label: "Prepared", Icon: IconFileText, color: "#06b6d4", tip: "AI gathered context. You handle it." },
];

const END_STAGES: StageConfig[] = [
  { key: "done", label: "Done", Icon: IconCircleCheck, color: "#6b7280", tip: "Completed." },
  { key: "skipped", label: "Reviewed", Icon: IconEyeOff, color: "#525252", tip: "AI skipped. Drag to Inbox if wrong." },
];

// All stages flat (for lookups)
const STAGES = [...SHARED_STAGES, ...AGENT_STAGES, ...HUMAN_STAGES, ...END_STAGES];

// Two-row layout
const ACTIONABLE_ROW: StageConfig[] = [...SHARED_STAGES, ...AGENT_STAGES, ...END_STAGES];
const HUMAN_ROW: StageConfig[] = [
  { key: "new", label: "Needs Response", Icon: IconInbox, color: "#f97316", tip: "Meetings and messages only you can handle." },
  ...HUMAN_STAGES,
  { key: "done", label: "Done", Icon: IconCircleCheck, color: "#6b7280", tip: "Handled." },
  { key: "skipped", label: "Reviewed", Icon: IconEyeOff, color: "#525252", tip: "AI skipped. Drag to Inbox if wrong." },
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

function formatTimeSince(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Modal for adding context before stage transitions
// No modal needed — drag-and-drop triggers actions immediately.
// Context can be added from the detail pane after the card moves.

export function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plansReady, setPlansReady] = useState<Set<string>>(new Set());
  const [fetching, setFetching] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [pollProgress, setPollProgress] = useState<{ source: string; current: number; total: number } | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [authStatus, setAuthStatus] = useState<{ installed: boolean; version: string | null; authenticated: boolean } | null>(null);

  useEffect(() => {
    window.deck.checkAuth?.().then(setAuthStatus).catch(() => {});
  }, []);

  useEffect(() => {
    // Load cached notifications + current state on mount
    const load = async () => {
      if (!window.deck) return;
      try {
        const result = await window.deck.getNotifications();
        if (result) {
          const data = result as { items?: NotificationItem[]; skipped?: Array<{ source?: string; title?: string; reason?: string }>; hasPolled?: boolean } | NotificationItem[];
          const items = Array.isArray(data) ? data : (data.items ?? []);
          const skipped = Array.isArray(data) ? [] : (data.skipped ?? []);
          const hasPolled = Array.isArray(data) ? items.length > 0 : (data.hasPolled ?? false);

          // Server is the single source of truth — skipped items are now real server notifications
          const serverItems = items.map(n => ({ ...n, stage: n.stage ?? "new" }));
          setNotifications(serverItems);
          // Only clear fetching if polling has completed AND we're not currently polling
          if (hasPolled) setFetching(false);
        }
      } catch {}
    };

    load();
    const interval = setInterval(load, 15000);

    // Update notification list when new data arrives (but DON'T clear fetching here)
    const unsub = window.deck.onNotificationsUpdate?.((data: unknown) => {
      const items = (data as NotificationItem[]).map(n => ({ ...n, stage: n.stage ?? "new" }));
      console.log(`[live] onNotificationsUpdate: ${items.length} items, stages: ${[...new Set(items.map(n => n.stage))].join(",")}`);
      if (items.length > 0) {
        setNotifications(items);
      }
    });

    // Polling lifecycle events — these are the ONLY way to control the loading indicator
    const unsubStarted = window.deck.onPollingStarted?.(() => {
      setFetching(true);
      setPollProgress(null);
    });
    const unsubFinished = window.deck.onPollingFinished?.(() => {
      setFetching(false);
      setPollProgress(null);
      setLastRefreshed(new Date().toISOString());
    });
    const unsubProgress = window.deck.onPollingProgress?.((data: { source: string; current: number; total: number }) => {
      setPollProgress(data);
    });

    // Safety: stop showing fetching after 10 min max (5 sources + triage can take a while)
    const fetchTimeout = setTimeout(() => setFetching(false), 600000);

    return () => {
      clearInterval(interval);
      clearTimeout(fetchTimeout);
      unsub?.();
      unsubStarted?.();
      unsubFinished?.();
      unsubProgress?.();
    };
  }, []);

  // Poll for plan readiness on items in planning/prepared stages
  useEffect(() => {
    const planningIds = notifications.filter(n => (n.stage === "planning" || n.stage === "prepared") && !plansReady.has(n.id)).map(n => n.id);
    if (planningIds.length === 0) return;

    const checkPlans = async () => {
      for (const id of planningIds) {
        try {
          const plan = await window.deck?.getPlan?.(id);
          if (plan && (plan as { conversationHistory?: unknown[] }).conversationHistory?.length) {
            setPlansReady(prev => new Set([...prev, id]));
          }
        } catch {}
      }
    };
    checkPlans();
    const interval = setInterval(checkPlans, 5000);
    return () => clearInterval(interval);
  }, [notifications, plansReady]);

  // Move card visually + persist. Always call this first so the card doesn't freeze.
  const moveCardToStage = useCallback((id: string, newStage: string) => {
    let movedItem: NotificationItem | undefined;
    setNotifications(prev => {
      const updated = prev.map(n => {
        if (n.id === id) {
          movedItem = { ...n, stage: newStage };
          return movedItem;
        }
        return n;
      });
      return updated;
    });

    // All items are now server-side, just update by ID
    window.deck.updateNotificationById?.(id, { stage: newStage })
      .catch(() => {});
  }, []);

  // Trigger agent actions for a card (call AFTER moveCardToStage)
  // Use a ref to always have current notifications (avoids stale closure)
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  const triggerStageAction = useCallback((id: string, newStage: string) => {
    // Use ref to get current state, not stale closure
    const n = notificationsRef.current.find(n => n.id === id);
    if (!n) {
      console.warn(`[triggerStageAction] notification ${id} not found`);
      return;
    }

    if (newStage === "planning" || newStage === "prepared") {
      // Only start if no plan exists yet
      window.deck.getPlan?.(id).then((existing: unknown) => {
        if (existing && (existing as { conversationHistory?: unknown[] }).conversationHistory?.length) {
          // Plan already exists — just mark as ready
          setPlansReady(prev => new Set([...prev, id]));
          return;
        }
        window.deck.prepareWorkPlan?.({
          id: n.id, source: n.source, title: n.title, summary: n.summary, url: n.url,
          taskType: n.taskType, links: n.links,
        }).catch((err: unknown) => console.error("[planning] prepareWorkPlan failed:", err));
      }).catch(() => {});
    } else if (newStage === "working") {
      window.deck.startWorkAgent?.(id).catch((err: unknown) => console.error("[working] startWorkAgent failed:", err));
    }
  }, []);

  const handleStageButton = useCallback((id: string, newStage: string) => {
    moveCardToStage(id, newStage);
    triggerStageAction(id, newStage);
  }, [moveCardToStage, triggerStageAction]);

  // Native HTML5 drag-and-drop state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const wasDragging = useRef(false);

  const dismiss = (id: string) => {
    // Don't delete — move to done
    moveCardToStage(id, "done");
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
      <style>{`
        .notif-card:hover { background-color: var(--mantine-color-dark-6) !important; }
        .notif-card:hover .drag-handle { opacity: 1 !important; }
        .notif-action-btn { transition: filter 0.15s ease; }
        .notif-action-btn:hover { filter: brightness(1.2); }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
      {/* Header with tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 24px",
          paddingLeft: 90,
          gap: 12,
          borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
          backgroundColor: "color-mix(in srgb, var(--mantine-color-dark-8) 80%, transparent)",
          backdropFilter: "blur(8px)",
          WebkitAppRegion: "drag",
          flexShrink: 0,
        }}
      >
        <Group gap={6} style={{ WebkitAppRegion: "no-drag", minWidth: 120 }} wrap="nowrap">
          <Text size="md" fw={700}>Claude Deck</Text>
          {authStatus && (
            <div
              title={authStatus.authenticated ? `Authenticated (${authStatus.version ?? "unknown version"})` : authStatus.installed ? "Not authenticated" : "CLI not found"}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: authStatus.authenticated ? "#22c55e" : "#ef4444",
                flexShrink: 0,
              }}
            />
          )}
        </Group>
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
        <Group gap={8} style={{ WebkitAppRegion: "no-drag", marginLeft: "auto" }}>
          {fetching ? (
            <>
              <div style={{ width: 14, height: 14, border: "2px solid var(--mantine-color-blue-5)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <Text size="xs" c="blue">
                {pollProgress
                  ? `Fetching ${pollProgress.source} (${pollProgress.current}/${pollProgress.total})...`
                  : "Fetching notifications..."}
              </Text>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </>
          ) : (
            <>
              <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#22c55e" }} />
              <Text size="xs" c="dimmed">
                {notifications.length} items{lastRefreshed ? ` · Updated ${formatTimeSince(lastRefreshed)}` : ""}
              </Text>
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
            onClick={() => { setFetching(true); setPollProgress(null); window.deck.refreshNotifications?.(lookbackHours); }}
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

      {/* Two-section kanban board */}
        <div style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
          {notifications.length === 0 && !fetching ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 300 }}>
              <Stack align="center" gap={8}>
                <IconInbox size={32} color="var(--mantine-color-dimmed)" style={{ opacity: 0.4 }} />
                <Text size="sm" c="dimmed">No notifications yet. Click Refresh to fetch.</Text>
              </Stack>
            </div>
          ) : (
          <div style={{ padding: 16 }}>
            {/* Section 1: Actionable tasks (agent can do the work) */}
            <Text size="xs" fw={700} c="dimmed" mb={8} tt="uppercase" style={{ letterSpacing: 1 }}>Actionable — Agent Can Work</Text>
            <div style={{ display: "flex", gap: 8, minWidth: "fit-content", marginBottom: 24 }}>
            {ACTIONABLE_ROW.map((stage) => {
              const filterFn = stage.key === "new"
                ? (n: NotificationItem) => (n.stage ?? "new") === "new" && !HUMAN_ONLY_TYPES.has(n.taskType ?? "")
                : stage.key === "done"
                ? (n: NotificationItem) => n.stage === "done" && !HUMAN_ONLY_TYPES.has(n.taskType ?? "")
                : stage.key === "skipped"
                ? (n: NotificationItem) => n.stage === "skipped" && !HUMAN_ONLY_TYPES.has(n.taskType ?? "")
                : (n: NotificationItem) => (n.stage ?? "new") === stage.key;
              const items = notifications.filter(filterFn).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
              const isOver = dragOverStage === stage.key;
              return (
                <div key={stage.key} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div
                    style={{ width: 240, minWidth: 200, flexShrink: 0 }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.key); }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverStage(null);
                      setDraggingId(null);
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) {
                        moveCardToStage(id, stage.key);
                        triggerStageAction(id, stage.key);
                      }
                    }}
                  >
                    <Tooltip label={stage.tip} position="bottom" withArrow multiline w={220} fz="xs">
                      <Group gap={6} mb={8} px={4} style={{ cursor: "help" }}>
                        <stage.Icon size={14} color={items.length > 0 || isOver ? stage.color : "var(--mantine-color-dimmed)"} />
                        <Text size="xs" fw={600} c={items.length > 0 || isOver ? undefined : "dimmed"}>{stage.label}</Text>
                        {items.length > 0 && <Badge size="xs" variant="light" color="gray" circle>{items.length}</Badge>}
                      </Group>
                    </Tooltip>

                    <div style={{
                      minHeight: 60, padding: 4, borderRadius: 8,
                      transition: "all 0.15s ease",
                      backgroundColor: isOver ? `color-mix(in srgb, ${stage.color} 10%, transparent)` : "transparent",
                      border: isOver ? `1px dashed ${stage.color}` : "1px dashed transparent",
                    }}>
                      <Stack gap={6}>
                        {items.length === 0 && (
                          <div style={{
                            padding: 16, borderRadius: 6, textAlign: "center",
                            border: "1px dashed color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
                          }}>
                            <Text size="xs" c="dimmed">{isOver ? "Drop here" : "Empty"}</Text>
                          </div>
                        )}
                        {items.map(n => {
                          const SrcIcon = sourceIcons[n.source] ?? IconFileText;
                          const srcColor = sourceColors[n.source] ?? "#6b7280";
                          const isDragging = draggingId === n.id;
                          return (
                            <div
                              key={n.id}
                              draggable
                              onMouseDown={() => { wasDragging.current = false; }}
                              onDragStart={(e) => { e.dataTransfer.setData("text/plain", n.id); setDraggingId(n.id); wasDragging.current = true; }}
                              onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                              onClick={() => { if (wasDragging.current) { wasDragging.current = false; return; } setSelectedId(n.id === selectedId ? null : n.id); }}
                              className="notif-card"
                              style={{
                                padding: "10px 12px", borderRadius: 6, cursor: "grab", userSelect: "none",
                                border: `1px solid ${
                                  n.id === selectedId ? "var(--mantine-color-blue-5)"
                                  : "color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)"
                                }`,
                                backgroundColor: "var(--mantine-color-dark-7)",
                                opacity: isDragging ? 0.4 : 1,
                                transition: "opacity 0.15s ease, background-color 0.15s ease",
                              }}
                            >
                              <Group gap={6} mb={4} justify="space-between">
                                <Group gap={4}>
                                  <IconGripVertical size={10} color="var(--mantine-color-dimmed)" style={{ opacity: 0.3 }} />
                                  <SrcIcon size={12} color={srcColor} />
                                  {n.author && <Text size="xs" c="dimmed" truncate style={{ maxWidth: 70 }}>{n.author}</Text>}
                                </Group>
                                <Group gap={4}>
                                  <AddToManagerButton id={n.id} label={n.title} type="notification" data={{ source: n.source, summary: n.summary }} />
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
                                  <Badge size="xs" variant="light" color="gray" radius="sm" style={{ fontSize: "0.55rem" }}>{n.source}</Badge>
                                </Group>
                              </Group>
                              <Text size="xs" fw={500} lineClamp={2} mb={4}>{n.title}</Text>
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
                              {/* Status indicator for in-progress stages */}
                              {(stage.key === "planning" || stage.key === "working") && !plansReady.has(n.id) && (
                                <Group gap={4} mt={2}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: stage.color, animation: "pulse 1.5s infinite" }} />
                                  <Text size="xs" c={stage.color} fw={500} style={{ fontSize: "0.6rem" }}>
                                    {stage.key === "planning" ? "Planning..." : "Working..."}
                                  </Text>
                                </Group>
                              )}
                              {stage.key === "planning" && plansReady.has(n.id) && (
                                <Group gap={4} mt={2}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#22c55e" }} />
                                  <Text size="xs" c="#22c55e" fw={500} style={{ fontSize: "0.6rem" }}>Plan ready</Text>
                                </Group>
                              )}
                              {stage.key !== "done" && stage.key !== "skipped" && stage.key !== "planning" && stage.key !== "working" && (
                                <Group gap={4} mt={2}>
                                  <UnstyledButton
                                    onClick={(e) => { e.stopPropagation(); moveCardToStage(n.id, "done"); }}
                                    style={{ padding: "2px 4px", borderRadius: 4, color: "var(--mantine-color-dimmed)", opacity: 0.5 }}
                                  >
                                    <IconCircleCheck size={12} />
                                  </UnstyledButton>
                                </Group>
                              )}
                            </div>
                          );
                        })}
                      </Stack>
                    </div>
                  </div>

                </div>
              );
            })}
            </div>

            {/* Section 2: Human-only tasks (meetings, responses) */}
            <Text size="xs" fw={700} c="dimmed" mb={8} tt="uppercase" style={{ letterSpacing: 1 }}>Needs Your Attention — Meetings & Responses</Text>
            <div style={{ display: "flex", gap: 8, minWidth: "fit-content" }}>
            {HUMAN_ROW.map((stage) => {
              const filterFn = stage.key === "new"
                ? (n: NotificationItem) => (n.stage ?? "new") === "new" && HUMAN_ONLY_TYPES.has(n.taskType ?? "")
                : stage.key === "done"
                ? (n: NotificationItem) => n.stage === "done" && HUMAN_ONLY_TYPES.has(n.taskType ?? "")
                : stage.key === "skipped"
                ? (n: NotificationItem) => n.stage === "skipped" && HUMAN_ONLY_TYPES.has(n.taskType ?? "")
                : (n: NotificationItem) => (n.stage ?? "new") === stage.key;
              const items = notifications.filter(filterFn).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
              const isOver = dragOverStage === `human-${stage.key}`;
              return (
                <div key={`human-${stage.key}`} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div
                    style={{ width: 240, minWidth: 200, flexShrink: 0 }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverStage(`human-${stage.key}`); }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverStage(null);
                      setDraggingId(null);
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) {
                        const targetStage = stage.key === "new" ? "new" : stage.key;
                        moveCardToStage(id, targetStage);
                        triggerStageAction(id, targetStage);
                      }
                    }}
                  >
                    <Tooltip label={stage.tip} position="bottom" withArrow multiline w={220} fz="xs">
                      <Group gap={6} mb={8} px={4} style={{ cursor: "help" }}>
                        <stage.Icon size={14} color={items.length > 0 || isOver ? stage.color : "var(--mantine-color-dimmed)"} />
                        <Text size="xs" fw={600} c={items.length > 0 || isOver ? undefined : "dimmed"}>{stage.label}</Text>
                        {items.length > 0 && <Badge size="xs" variant="light" color="gray" circle>{items.length}</Badge>}
                      </Group>
                    </Tooltip>
                    <div style={{
                      minHeight: 50, padding: 4, borderRadius: 8,
                      transition: "all 0.15s ease",
                      backgroundColor: isOver ? `color-mix(in srgb, ${stage.color} 10%, transparent)` : "transparent",
                      border: isOver ? `1px dashed ${stage.color}` : "1px dashed transparent",
                    }}>
                      <Stack gap={6}>
                        {items.length === 0 && (
                          <div style={{ padding: 12, borderRadius: 6, textAlign: "center", border: "1px dashed color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)" }}>
                            <Text size="xs" c="dimmed">{isOver ? "Drop here" : "Empty"}</Text>
                          </div>
                        )}
                        {items.map(n => {
                          const SrcIcon = sourceIcons[n.source] ?? IconFileText;
                          const srcColor = sourceColors[n.source] ?? "#6b7280";
                          return (
                            <div
                              key={n.id}
                              draggable
                              onMouseDown={() => { wasDragging.current = false; }}
                              onDragStart={(e) => { e.dataTransfer.setData("text/plain", n.id); setDraggingId(n.id); wasDragging.current = true; }}
                              onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                              onClick={() => { if (wasDragging.current) { wasDragging.current = false; return; } setSelectedId(n.id === selectedId ? null : n.id); }}
                              className="notif-card"
                              style={{
                                padding: "10px 12px", borderRadius: 6, cursor: "grab", userSelect: "none",
                                border: `1px solid ${n.id === selectedId ? "var(--mantine-color-blue-5)" : "color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)"}`,
                                backgroundColor: "var(--mantine-color-dark-7)",
                                opacity: draggingId === n.id ? 0.4 : 1,
                              }}
                            >
                              <Group gap={6} mb={4} justify="space-between">
                                <Group gap={4}>
                                  <SrcIcon size={12} color={srcColor} />
                                  {n.author && <Text size="xs" c="dimmed" truncate style={{ maxWidth: 70 }}>{n.author}</Text>}
                                </Group>
                                <Badge size="xs" variant="light" color="gray" radius="sm" style={{ fontSize: "0.55rem" }}>{n.taskType ?? n.source}</Badge>
                              </Group>
                              <Text size="xs" fw={500} lineClamp={2} mb={4}>{n.title}</Text>
                              {n.actionNeeded && <Text size="xs" c="blue.4" lineClamp={1} mb={4} style={{ fontSize: "0.65rem" }}>→ {n.actionNeeded}</Text>}
                              {stage.key === "prepared" && !plansReady.has(n.id) && (
                                <Group gap={4} mt={2}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#06b6d4", animation: "pulse 1.5s infinite" }} />
                                  <Text size="xs" c="#06b6d4" fw={500} style={{ fontSize: "0.6rem" }}>Preparing...</Text>
                                </Group>
                              )}
                              {stage.key === "prepared" && plansReady.has(n.id) && (
                                <Group gap={4} mt={2}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#22c55e" }} />
                                  <Text size="xs" c="#22c55e" fw={500} style={{ fontSize: "0.6rem" }}>Ready</Text>
                                </Group>
                              )}
                              {stage.key !== "done" && stage.key !== "prepared" && stage.key !== "skipped" && (
                                <Group gap={4} mt={2}>
                                  <UnstyledButton onClick={(e) => { e.stopPropagation(); moveCardToStage(n.id, "done"); }}
                                    style={{ padding: "2px 4px", borderRadius: 4, color: "var(--mantine-color-dimmed)", opacity: 0.5 }}>
                                    <IconCircleCheck size={12} />
                                  </UnstyledButton>
                                </Group>
                              )}
                            </div>
                          );
                        })}
                      </Stack>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
          )}
        </div>

      {/* Detail pane */}
      {selected && (
        <>
          {/* Backdrop — click to close */}
          <div
            onClick={() => setSelectedId(null)}
            style={{ position: "fixed", inset: 0, top: 42, zIndex: 99, backgroundColor: "rgba(0,0,0,0.2)" }}
          />
          <DetailPane
            notification={selected}
            onClose={() => setSelectedId(null)}
            onAdvance={() => {
              const currentStage = selected.stage ?? "new";
              if (currentStage === "new" || currentStage === "skipped") handleStageButton(selected.id, "planning");
              else if (currentStage === "planning") handleStageButton(selected.id, "working");
              else moveCardToStage(selected.id, "done");
            }}
            onDismiss={() => dismiss(selected.id)}
            onPlanReady={() => setPlansReady(prev => new Set([...prev, selected.id]))}
          />
        </>
      )}


      {/* Debug sidebar */}
      {showDebug && (
        <div style={{
          position: "fixed", top: 42, right: 0, bottom: 0, width: 400,
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

function PlanDetails({ details }: { details: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <UnstyledButton
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          fontSize: "0.7rem", color: "var(--mantine-color-blue-4)",
          padding: "4px 0",
        }}
      >
        {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        {expanded ? "Hide details" : "Show details"}
      </UnstyledButton>
      {expanded && (
        <div style={{
          marginTop: 4, padding: "8px 12px", borderRadius: 6,
          backgroundColor: "color-mix(in srgb, var(--mantine-color-dark-6) 50%, transparent)",
          borderLeft: "2px solid var(--mantine-color-blue-5)",
        }}>
          <Markdown content={details} />
        </div>
      )}
    </div>
  );
}

function DetailPane({ notification: n, onClose, onAdvance, onDismiss, onPlanReady }: {
  notification: NotificationItem;
  onClose: () => void;
  onAdvance: () => void;
  onDismiss: () => void;
  onPlanReady?: () => void;
}) {
  const [conversation, setConversation] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [hasApproved, setHasApproved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Live activity feed — shows bridge tool calls while plan is being prepared
  const [activity, setActivity] = useState<string[]>([]);

  // Load existing plan on mount, and poll while in planning stage
  useEffect(() => {
    let cancelled = false;
    const isPreparingStage = n.stage === "planning" || n.stage === "prepared";

    const loadPlan = async () => {
      try {
        const existing = await window.deck?.getPlan?.(n.id);
        if (cancelled) return;
        if (existing && (existing as { conversationHistory: typeof conversation }).conversationHistory?.length > 0) {
          setConversation((existing as { conversationHistory: typeof conversation }).conversationHistory);
          setLoading(false);
          setActivity([]);
          onPlanReady?.();
        } else if (isPreparingStage) {
          setLoading(true);
        }
      } catch {}
    };

    // Poll bridge debug log for live activity while loading
    const loadActivity = async () => {
      try {
        const res = await fetch("http://localhost:9876/api/debug");
        if (cancelled) return;
        const entries = await res.json() as Array<{ timestamp: string; direction: string; content: string }>;
        // Show last 10 outgoing entries (tool calls, text)
        const recent = entries
          .filter((e: { direction: string }) => e.direction === "out")
          .slice(-10)
          .map((e: { content: string }) => e.content);
        setActivity(recent);
      } catch {}
    };

    loadPlan();
    const planInterval = isPreparingStage ? setInterval(loadPlan, 3000) : undefined;
    const activityInterval = isPreparingStage ? setInterval(loadActivity, 2000) : undefined;
    if (isPreparingStage) loadActivity();

    return () => {
      cancelled = true;
      if (planInterval) clearInterval(planInterval);
      if (activityInterval) clearInterval(activityInterval);
    };
  }, [n.id, n.stage]);

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
      position: "fixed", top: 42, right: 0, bottom: 0, width: "45%",
      animation: "slideIn 0.2s ease",
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

      {/* Conversation area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {conversation.length === 0 && !loading && (
          <Stack align="center" py="xl" gap="sm">
            <Text size="sm" c="dimmed">Click "Analyze" to have the Manager fetch context and propose a plan.</Text>
          </Stack>
        )}

        {conversation.map((msg, i) => {
          // Split assistant messages at "---" into TL;DR + Details
          if (msg.role === "assistant" && msg.content.includes("\n---\n")) {
            const parts = msg.content.split("\n---\n");
            const tldr = parts[0].trim();
            const details = parts.slice(1).join("\n---\n").trim();
            return (
              <div key={i} style={{
                padding: "10px 14px", borderRadius: 8, marginBottom: 8,
                backgroundColor: "var(--mantine-color-dark-7)",
                border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
              }}>
                <Markdown content={tldr} />
                {details && (
                  <PlanDetails details={details} />
                )}
              </div>
            );
          }
          return (
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
          );
        })}

        {loading && (
          <div>
            <Group gap={8} py="sm">
              <Loader size={14} />
              <Text size="xs" c="dimmed">{conversation.length === 0 ? "Fetching context and analyzing..." : "Thinking..."}</Text>
            </Group>
            {activity.length > 0 && (
              <div style={{
                padding: "8px 12px", borderRadius: 6, marginTop: 4,
                backgroundColor: "var(--mantine-color-dark-8)",
                border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
                maxHeight: 200, overflowY: "auto",
                fontSize: "0.7rem", fontFamily: "var(--mantine-font-family-monospace)",
                color: "var(--mantine-color-dimmed)",
              }}>
                {activity.map((line, i) => (
                  <div key={i} style={{ padding: "2px 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
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
              <UnstyledButton
                onClick={() => {
                  window.deck.clearPlan?.(n.id);
                  setConversation([]);
                  setLoading(true);
                  setActivity([]);
                  handlePrepare();
                }}
                disabled={loading}
                style={{
                  padding: "8px 16px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 500,
                  backgroundColor: "var(--mantine-color-dark-5)", color: "var(--mantine-color-dimmed)",
                }}>
                Regenerate
              </UnstyledButton>
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
