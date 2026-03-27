import { Badge, Group, Loader, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import {
  IconInbox, IconSparkles, IconPlayerPlay, IconGitPullRequest, IconCircleCheck,
  IconBrandGithub, IconHash, IconMail, IconFileText, IconChevronRight, IconChevronDown,
  IconGripVertical, IconEyeOff, IconPlus, IconPencil, IconArchive, IconEye,
} from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { usePollStatus } from "../hooks/usePollStatus";
import { PollStatusIndicator } from "../components/PollStatusIndicator";
import { Markdown } from "../components/Markdown";
import { AddToManagerButton } from "../components/AddToManagerButton";
import { AddTaskModal } from "../components/AddTaskModal";
import { AppHeader } from "../components/AppHeader";
import { buildSlackArchiveUrl } from "../../shared/task-utils";
import { STAGE_META, SOURCE_COLORS } from "../../shared/ui-constants";
import { formatTimeSince } from "../components/shared";
import { getDetailViewType } from "../../shared/detail-view-routing";
import { ImplementationDetailView } from "../components/ImplementationDetailView";
import { ResponseDetailView } from "../components/ResponseDetailView";
import { MeetingPrepDetailView } from "../components/MeetingPrepDetailView";
import { StartWorkModal } from "../components/StartWorkModal";
import { detectRepo } from "../../shared/repo-detection";

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
  timeline?: Array<{ timestamp: string; event: string }>;
  pollCycle?: number;
  repoPath?: string;
  sessionId?: string;
  workSlug?: string;
  branch?: string;
}

// Agent-actionable: an agent can do the actual work
const AGENT_ACTIONABLE_TYPES = new Set(["implementation", "investigation", "review"]);
// Human-only: agent can prepare context but you handle it
const HUMAN_ONLY_TYPES = new Set(["meeting_prep", "response"]);

type StageConfig = { key: string; label: string; Icon: React.FC<{ size?: number; color?: string; stroke?: number }>; color: string; tip: string };

const SHARED_STAGES: StageConfig[] = [
  { key: "new", label: STAGE_META.new.label, Icon: IconInbox, color: STAGE_META.new.color, tip: STAGE_META.new.tip },
];

const AGENT_STAGES: StageConfig[] = [
  { key: "start_work", label: STAGE_META.start_work.label, Icon: IconSparkles, color: STAGE_META.start_work.color, tip: STAGE_META.start_work.tip },
  { key: "plan_review", label: STAGE_META.plan_review.label, Icon: IconEye, color: STAGE_META.plan_review.color, tip: STAGE_META.plan_review.tip },
  { key: "hack", label: STAGE_META.hack.label, Icon: IconPlayerPlay, color: STAGE_META.hack.color, tip: STAGE_META.hack.tip },
  { key: "ship", label: STAGE_META.ship.label, Icon: IconGitPullRequest, color: STAGE_META.ship.color, tip: STAGE_META.ship.tip },
  { key: "code_review", label: STAGE_META.code_review.label, Icon: IconFileText, color: STAGE_META.code_review.color, tip: STAGE_META.code_review.tip },
  { key: "pr_feedback", label: STAGE_META.pr_feedback.label, Icon: IconPencil, color: STAGE_META.pr_feedback.color, tip: STAGE_META.pr_feedback.tip },
];

const HUMAN_STAGES: StageConfig[] = [
  { key: "preparing", label: STAGE_META.preparing.label, Icon: IconSparkles, color: STAGE_META.preparing.color, tip: STAGE_META.preparing.tip },
  { key: "ready", label: STAGE_META.ready.label, Icon: IconCircleCheck, color: STAGE_META.ready.color, tip: STAGE_META.ready.tip },
];

const BACKLOG_STAGE: StageConfig = { key: "backlog", label: STAGE_META.backlog.label, Icon: IconArchive, color: STAGE_META.backlog.color, tip: STAGE_META.backlog.tip };

const END_STAGES: StageConfig[] = [
  BACKLOG_STAGE,
  { key: "done", label: STAGE_META.done.label, Icon: IconCircleCheck, color: STAGE_META.done.color, tip: STAGE_META.done.tip },
];

// All stages flat (for lookups) — includes skipped for DnD targets
const SKIPPED_STAGE: StageConfig = { key: "skipped", label: STAGE_META.skipped.label, Icon: IconEyeOff, color: STAGE_META.skipped.color, tip: STAGE_META.skipped.tip };
const STAGES = [...SHARED_STAGES, ...AGENT_STAGES, ...HUMAN_STAGES, ...END_STAGES, SKIPPED_STAGE];

// Sections — "Reviewed" items hidden in collapsible section
const ACTIONABLE_ROW: StageConfig[] = [...SHARED_STAGES, ...AGENT_STAGES, ...END_STAGES];
const HUMAN_ROW: StageConfig[] = [...SHARED_STAGES, ...HUMAN_STAGES, ...END_STAGES];

const sourceIcons: Record<string, React.FC<{ size?: number; color?: string }>> = {
  linear: SiLinear as React.FC<{ size?: number; color?: string }>,
  slack: IconHash,
  github: IconBrandGithub,
  notion: SiNotion as React.FC<{ size?: number; color?: string }>,
  email: IconMail,
  manual: IconPencil,
};

const sourceColors = SOURCE_COLORS;

// Modal for adding context before stage transitions
// No modal needed — drag-and-drop triggers actions immediately.
// Context can be added from the detail pane after the card moves.

export function Notifications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("select"));
  const [plansReady, setPlansReady] = useState<Set<string>>(new Set());
  const pollStatus = usePollStatus();
  const [fetching, setFetching] = useState(true);
  const fetchingRef = useRef(true); // tracks polling state without re-renders
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [pollProgress, setPollProgress] = useState<{ source: string; current: number; total: number } | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(() => new Set(["done", "backlog"]));
  // Track which poll cycle each item was last seen at — items with pollCycle > seenCycle show a badge
  const [seenCycle, setSeenCycle] = useState<Map<string, number>>(new Map());
  const markSeen = (id: string, cycle: number) => setSeenCycle(prev => new Map(prev).set(id, cycle));
  const markAllSeen = () => {
    setSeenCycle(prev => {
      const next = new Map(prev);
      for (const n of notifications) {
        if (n.pollCycle) next.set(n.id, n.pollCycle);
      }
      return next;
    });
  };
  const toggleCollapse = (key: string) => setCollapsedCols(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const [authStatus, setAuthStatus] = useState<{ installed: boolean; version: string | null; authenticated: boolean } | null>(null);

  useEffect(() => {
    window.deck.checkAuth?.().then(setAuthStatus).catch(() => {});
  }, []);

  // Clear the ?select= param after reading it (don't persist on refresh)
  useEffect(() => {
    if (searchParams.has("select")) {
      searchParams.delete("select");
      setSearchParams(searchParams, { replace: true });
    }
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

          // Server is the single source of truth
          const serverItems = items.map(n => ({ ...n, stage: n.stage ?? "new" }));
          if (serverItems.length > 0) setNotifications(serverItems);
          // Don't clear fetching from load() — only polling-finished should do that
          // But if we have cached data on first load and no poll is active, show it
          if (hasPolled && serverItems.length > 0 && !fetchingRef.current) setFetching(false);
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
      fetchingRef.current = true;
      setPollProgress(null);
    });
    const unsubFinished = window.deck.onPollingFinished?.(() => {
      setFetching(false);
      fetchingRef.current = false;
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

  // Poll for plan readiness on items in start_work/preparing stages
  useEffect(() => {
    const planningIds = notifications.filter(n => (n.stage === "start_work" || n.stage === "preparing") && !plansReady.has(n.id)).map(n => n.id);
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

    if (newStage === "start_work" || newStage === "preparing") {
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
        }).catch((err: unknown) => console.error("[start_work] prepareWorkPlan failed:", err));
      }).catch(() => {});
    } else if (newStage === "hack") {
      // Use skill runner instead of old startWorkAgent
      const notif = notifications.find(nn => nn.id === id);
      if (notif) {
        window.deck.runSkill?.({
          skill: "/hack",
          args: "",
          repoPath: (notif as any).repoPath ?? "",
          sessionId: (notif as any).sessionId ?? null,
          notificationId: id,
        }).catch((err: unknown) => console.error("[hack] runSkill failed:", err));
      }
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
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [lookbackHours, setLookbackHours] = useState(168);
  const [debugEntries, setDebugEntries] = useState<Array<{ timestamp: string; direction: string; content: string }>>([]);
  useEffect(() => {
    if (!showDebug) return;
    const fetchDebug = async () => {
      try {
        const res = await fetch("http://localhost:9876/api/debug");
        const data = await res.json() as Array<{ timestamp: string; direction: string; content: string }>;
        setDebugEntries(data);
      } catch {}
    };
    fetchDebug();
    const interval = setInterval(fetchDebug, 2000);
    return () => clearInterval(interval);
  }, [showDebug]);

  const selected = notifications.find(n => n.id === selectedId);

  // Sort by priority first, then confidence
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, backlog: 4 };
  const sortByPriority = (a: NotificationItem, b: NotificationItem) => {
    const pa = priorityOrder[a.priority ?? "medium"] ?? 2;
    const pb = priorityOrder[b.priority ?? "medium"] ?? 2;
    if (pa !== pb) return pa - pb;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  };

  // Memoize filtered lists so we don't re-filter on every render
  const actionableByStage = useMemo(() => {
    const map = new Map<string, NotificationItem[]>();
    for (const stage of ACTIONABLE_ROW) {
      const filtered = notifications.filter(n => {
        if (HUMAN_ONLY_TYPES.has(n.taskType ?? "")) return false;
        if (n.stage === "skipped") return false;
        return (n.stage ?? "new") === stage.key;
      }).sort(sortByPriority);
      map.set(stage.key, filtered);
    }
    return map;
  }, [notifications]);

  const humanByStage = useMemo(() => {
    const map = new Map<string, NotificationItem[]>();
    for (const stage of HUMAN_ROW) {
      const filtered = notifications.filter(n => {
        if (!HUMAN_ONLY_TYPES.has(n.taskType ?? "")) return false;
        if (n.stage === "skipped") return false;
        return (n.stage ?? "new") === stage.key;
      }).sort(sortByPriority);
      map.set(stage.key, filtered);
    }
    return map;
  }, [notifications]);

  const skippedItems = useMemo(() =>
    notifications.filter(n => n.stage === "skipped"),
  [notifications]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", backgroundColor: "var(--mantine-color-body)" }}>
      <style>{`
        .notif-card:hover .drag-handle { opacity: 1 !important; }
        .notif-action-btn { transition: filter 0.15s ease; }
        .notif-action-btn:hover { filter: brightness(1.2); }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .section-chevron { transition: transform 0.15s ease; display: inline-flex; }
        .section-chevron--open { transform: rotate(90deg); }
      `}</style>
      {/* Header with tabs */}
      <AppHeader
        rightContent={
          <>
            <PollStatusIndicator
              fetching={pollStatus.fetching}
              pollProgress={pollStatus.pollProgress}
              lastRefreshed={pollStatus.lastRefreshed}
              itemCount={notifications.length}
              itemLabel="items"
            />
            {!pollStatus.fetching && notifications.some(n => n.pollCycle && (!seenCycle.has(n.id) || (seenCycle.get(n.id) ?? 0) < n.pollCycle)) && (
              <UnstyledButton onClick={markAllSeen} aria-label="Mark all as read" style={{ fontSize: "0.6rem", color: "var(--mantine-color-blue-4)", padding: "2px 6px", borderRadius: 4, backgroundColor: "color-mix(in srgb, var(--mantine-color-blue-9) 15%, transparent)" }}>
                Mark all read
              </UnstyledButton>
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
          </>
        }
      />

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
              const items = actionableByStage.get(stage.key) ?? [];
              const isOver = dragOverStage === stage.key;
              const isCollapsed = collapsedCols.has(stage.key);
              return (
                <div key={stage.key} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div
                    style={{ width: 240, minWidth: 200, flexShrink: 0 }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.key); if (isCollapsed) toggleCollapse(stage.key); }}
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
                    <Group gap={6} mb={8} px={4} justify="space-between">
                      <Tooltip label={stage.tip} position="bottom" withArrow multiline w={220} fz="xs">
                        <Group gap={6} mb={8} px={4} justify="space-between">
                          <Group gap={6} style={{ cursor: "default" }}>
                            <stage.Icon size={14} color={items.length > 0 || isOver ? stage.color : "var(--mantine-color-dimmed)"} />
                            <Text size="xs" fw={600} c={items.length > 0 || isOver ? undefined : "dimmed"}>{stage.label}</Text>
                            {items.length > 0 && <Badge size="xs" variant="light" color="gray" circle>{items.length}</Badge>}
                          </Group>
                          <UnstyledButton onClick={(e) => { e.stopPropagation(); toggleCollapse(stage.key); }} aria-label={isCollapsed ? "Expand column" : "Collapse column"} style={{ opacity: 0.4, padding: 2 }}>
                            {isCollapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
                          </UnstyledButton>
                        </Group>
                      </Tooltip>
                      {stage.key === "new" && (
                        <Tooltip label="Add task manually" position="bottom" withArrow fz="xs">
                          <UnstyledButton
                            onClick={() => setAddTaskOpen(true)}
                            style={{
                              width: 20, height: 20, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                              color: "var(--mantine-color-dimmed)",
                              backgroundColor: "transparent",
                              transition: "all 0.15s ease",
                            }}
                            className="notif-action-btn"
                          >
                            <IconPlus size={13} />
                          </UnstyledButton>
                        </Tooltip>
                      )}
                    </Group>

                    <div style={{
                      minHeight: isCollapsed ? 0 : 60, padding: isCollapsed ? 0 : 4, borderRadius: 8,
                      transition: "all 0.15s ease",
                      display: isCollapsed ? "none" : undefined,
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
                              onClick={() => {
                                if (wasDragging.current) { wasDragging.current = false; return; }
                                if (n.pollCycle) markSeen(n.id, n.pollCycle);
                                setSelectedId(n.id === selectedId ? null : n.id);
                              }}
                              className="notif-card"
                              style={{
                                padding: "10px 12px", borderRadius: 6, cursor: "grab", userSelect: "none",
                                border: `1px solid ${
                                  n.id === selectedId ? "var(--mantine-color-blue-5)"
                                  : "color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)"
                                }`,
                                backgroundColor: (n.stage === "done" || n.stage === "backlog") ? "var(--mantine-color-dark-8)" : "var(--mantine-color-dark-7)",
                                opacity: isDragging ? 0.4 : (n.stage === "done" || n.stage === "backlog") ? 0.5 : 1,
                                transition: "opacity 0.15s ease, background-color 0.15s ease",
                              }}
                            >
                              <Group gap={6} mb={2} justify="space-between">
                                <Group gap={4}>
                                  <IconGripVertical size={10} color="var(--mantine-color-dimmed)" style={{ opacity: 0.3 }} />
                                  <SrcIcon size={12} color={srcColor} />
                                  {n.author && <Text size="xs" c="dimmed" truncate style={{ maxWidth: 90 }}>{n.author}</Text>}
                                </Group>
                                <Group gap={4}>
                                  <Tooltip label={n.id} position="left" withArrow>
                                    <Text size="xs" c="dimmed" style={{ fontSize: "0.5rem", fontFamily: "var(--mantine-font-family-monospace)", opacity: 0.5 }}>
                                      {n.id.slice(-6)}
                                    </Text>
                                  </Tooltip>
                                  <AddToManagerButton id={n.id} label={n.title} type="notification" data={{ source: n.source, summary: n.summary }} />
                                </Group>
                              </Group>
                              <Group gap={4} mb={4}>
                                {n.priority && (
                                  <Badge
                                    size="xs"
                                    variant="dot"
                                    color={
                                      n.priority === "critical" ? "red" : n.priority === "high" ? "yellow" : n.priority === "medium" ? "blue" : "gray"
                                    }
                                    style={{ fontSize: "0.5rem" }}
                                  >
                                    {n.priority}
                                  </Badge>
                                )}
                                <Badge
                                  size="xs"
                                  variant="light"
                                  color={n.source === "manual" ? "violet" : "gray"}
                                  radius="sm"
                                  style={{ fontSize: "0.55rem" }}
                                  leftSection={n.source === "manual" ? <IconPencil size={9} /> : undefined}
                                >
                                  {n.source}
                                </Badge>
                                {n.taskType && (
                                  <Badge size="xs" variant="outline" color="gray" radius="sm" style={{ fontSize: "0.55rem" }}>
                                    {n.taskType}
                                  </Badge>
                                )}
                              </Group>
                              <Group gap={6} mb={4} wrap="nowrap">
                                {n.pollCycle && (!seenCycle.has(n.id) || (seenCycle.get(n.id) ?? 0) < n.pollCycle) && (
                                  <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, backgroundColor: seenCycle.has(n.id) ? "#f59e0b" : "#3b82f6" }} />
                                )}
                                <Text size="xs" fw={500} lineClamp={2}>{n.title}</Text>
                              </Group>
                              {n.actionNeeded && (
                                <Text size="xs" c="blue.4" lineClamp={1} mb={4} style={{ fontSize: "0.65rem" }}>
                                  → {n.actionNeeded}
                                </Text>
                              )}
                              {/* Status indicator for in-progress stages */}
                              {(stage.key === "start_work" || stage.key === "hack") && !plansReady.has(n.id) && (
                                <Group gap={4} mt={2}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: stage.color, animation: "pulse 1.5s infinite" }} />
                                  <Text size="xs" c={stage.color} fw={500} style={{ fontSize: "0.6rem" }}>
                                    {stage.key === "start_work" ? "Planning..." : "Building..."}
                                  </Text>
                                </Group>
                              )}
                              {stage.key === "start_work" && plansReady.has(n.id) && (
                                <Group gap={4} mt={2}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#22c55e" }} />
                                  <Text size="xs" c="#22c55e" fw={500} style={{ fontSize: "0.6rem" }}>Plan ready</Text>
                                </Group>
                              )}
                              {stage.key !== "done" && stage.key !== "skipped" && stage.key !== "start_work" && stage.key !== "hack" && (
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
              const items = humanByStage.get(stage.key) ?? [];
              const isOver = dragOverStage === `human-${stage.key}`;
              const isCollapsed = collapsedCols.has(`human-${stage.key}`);
              return (
                <div key={`human-${stage.key}`} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div
                    style={{ width: 240, minWidth: 200, flexShrink: 0 }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverStage(`human-${stage.key}`); if (isCollapsed) toggleCollapse(`human-${stage.key}`); }}
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
                      <Group gap={6} mb={8} px={4} justify="space-between">
                        <Group gap={6} style={{ cursor: "default" }}>
                          <stage.Icon size={14} color={items.length > 0 || isOver ? stage.color : "var(--mantine-color-dimmed)"} />
                          <Text size="xs" fw={600} c={items.length > 0 || isOver ? undefined : "dimmed"}>{stage.label}</Text>
                          {items.length > 0 && <Badge size="xs" variant="light" color="gray" circle>{items.length}</Badge>}
                        </Group>
                        <UnstyledButton onClick={(e) => { e.stopPropagation(); toggleCollapse(`human-${stage.key}`); }} aria-label={isCollapsed ? "Expand column" : "Collapse column"} style={{ opacity: 0.4, padding: 2 }}>
                          {isCollapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
                        </UnstyledButton>
                      </Group>
                    </Tooltip>
                    <div style={{
                      minHeight: isCollapsed ? 0 : 50, padding: isCollapsed ? 0 : 4, borderRadius: 8,
                      transition: "all 0.15s ease",
                      display: isCollapsed ? "none" : undefined,
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
                              onClick={() => {
                                if (wasDragging.current) { wasDragging.current = false; return; }
                                if (n.pollCycle) markSeen(n.id, n.pollCycle);
                                setSelectedId(n.id === selectedId ? null : n.id);
                              }}
                              className="notif-card"
                              style={{
                                padding: "10px 12px", borderRadius: 6, cursor: "grab", userSelect: "none",
                                border: `1px solid ${n.id === selectedId ? "var(--mantine-color-blue-5)" : "color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)"}`,
                                backgroundColor: (n.stage === "done" || n.stage === "backlog") ? "var(--mantine-color-dark-8)" : "var(--mantine-color-dark-7)",
                                opacity: draggingId === n.id ? 0.4 : (n.stage === "done" || n.stage === "backlog") ? 0.5 : 1,
                              }}
                            >
                              <Group gap={6} mb={2} justify="space-between">
                                <Group gap={4}>
                                  <SrcIcon size={12} color={srcColor} />
                                  {n.author && <Text size="xs" c="dimmed" truncate style={{ maxWidth: 90 }}>{n.author}</Text>}
                                </Group>
                                <Group gap={4}>
                                  <Tooltip label={n.id} position="left" withArrow>
                                    <Text size="xs" c="dimmed" style={{ fontSize: "0.5rem", fontFamily: "var(--mantine-font-family-monospace)", opacity: 0.5 }}>
                                      {n.id.slice(-6)}
                                    </Text>
                                  </Tooltip>
                                  <AddToManagerButton id={n.id} label={n.title} type="notification" data={{ source: n.source, summary: n.summary }} />
                                </Group>
                              </Group>
                              <Group gap={4} mb={4}>
                                {n.priority && (
                                  <Badge
                                    size="xs"
                                    variant="dot"
                                    color={n.priority === "critical" ? "red" : n.priority === "high" ? "yellow" : n.priority === "medium" ? "blue" : "gray"}
                                    style={{ fontSize: "0.5rem" }}
                                  >
                                    {n.priority}
                                  </Badge>
                                )}
                                <Badge
                                  size="xs"
                                  variant="light"
                                  color={n.source === "manual" ? "violet" : "gray"}
                                  radius="sm"
                                  style={{ fontSize: "0.55rem" }}
                                  leftSection={n.source === "manual" ? <IconPencil size={9} /> : undefined}
                                >
                                  {n.source === "manual" ? "manual" : (n.taskType ?? n.source)}
                                </Badge>
                              </Group>
                              <Group gap={6} mb={4} wrap="nowrap">
                                {n.pollCycle && (!seenCycle.has(n.id) || (seenCycle.get(n.id) ?? 0) < n.pollCycle) && (
                                  <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, backgroundColor: seenCycle.has(n.id) ? "#f59e0b" : "#3b82f6" }} />
                                )}
                                <Text size="xs" fw={500} lineClamp={2}>{n.title}</Text>
                              </Group>
                              {n.actionNeeded && <Text size="xs" c="blue.4" lineClamp={1} mb={4} style={{ fontSize: "0.65rem" }}>→ {n.actionNeeded}</Text>}
                              {stage.key === "preparing" && !plansReady.has(n.id) && (
                                <Group gap={4} mt={2}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#06b6d4", animation: "pulse 1.5s infinite" }} />
                                  <Text size="xs" c="#06b6d4" fw={500} style={{ fontSize: "0.6rem" }}>Preparing...</Text>
                                </Group>
                              )}
                              {stage.key === "preparing" && plansReady.has(n.id) && (
                                <Group gap={4} mt={2}>
                                  <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#22c55e" }} />
                                  <Text size="xs" c="#22c55e" fw={500} style={{ fontSize: "0.6rem" }}>Ready</Text>
                                </Group>
                              )}
                              {stage.key !== "done" && stage.key !== "ready" && stage.key !== "skipped" && (
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

            {/* Nice to Do section removed — backlog is now a proper column */}

            {/* Collapsible Reviewed section — hidden by default */}
            {(() => {
              if (skippedItems.length === 0) return null;
              return (
                <div style={{ marginTop: 16 }}>
                  <UnstyledButton
                    onClick={() => setShowSkipped(s => !s)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}
                  >
                    {showSkipped ? <IconChevronDown size={12} color="var(--mantine-color-dimmed)" /> : <IconChevronRight size={12} color="var(--mantine-color-dimmed)" />}
                    <Text size="xs" c="dimmed" fw={600}>Reviewed ({skippedItems.length})</Text>
                  </UnstyledButton>
                  {showSkipped && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, maxWidth: 800 }}>
                      {skippedItems.map(n => (
                        <div
                          key={n.id}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", n.id); setDraggingId(n.id); }}
                          onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                          onClick={() => setSelectedId(n.id === selectedId ? null : n.id)}
                          style={{
                            padding: "6px 10px", borderRadius: 6, cursor: "grab",
                            border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
                            backgroundColor: "var(--mantine-color-dark-8)",
                            opacity: 0.6, maxWidth: 250,
                          }}
                        >
                          <Text size="xs" c="dimmed" lineClamp={1}>{n.title}</Text>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
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
              const isHuman = HUMAN_ONLY_TYPES.has(selected.taskType ?? "");
              if (currentStage === "new" || currentStage === "skipped") {
                handleStageButton(selected.id, isHuman ? "preparing" : "start_work");
              } else if (currentStage === "start_work") {
                handleStageButton(selected.id, "hack");
              } else if (currentStage === "preparing") {
                moveCardToStage(selected.id, "ready");
              } else {
                moveCardToStage(selected.id, "done");
              }
            }}
            onDismiss={() => dismiss(selected.id)}
            onPlanReady={() => setPlansReady(prev => new Set([...prev, selected.id]))}
            onPlanCleared={() => setPlansReady(prev => { const next = new Set(prev); next.delete(selected.id); return next; })}
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
              <UnstyledButton onClick={async () => {
                try { await fetch("http://localhost:9876/api/debug/clear"); } catch {}
                setDebugEntries([]);
              }} style={{ fontSize: "0.6rem", color: "var(--mantine-color-dimmed)" }}>Clear</UnstyledButton>
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

      <AddTaskModal opened={addTaskOpen} onClose={() => setAddTaskOpen(false)} />
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
        <IconChevronRight size={12} className={`section-chevron${expanded ? " section-chevron--open" : ""}`} />
        {expanded ? "Hide details" : "Show details"}
      </UnstyledButton>
      <div style={{
        display: expanded ? "block" : "none",
        marginTop: 4, padding: "8px 12px", borderRadius: 6,
        backgroundColor: "color-mix(in srgb, var(--mantine-color-dark-6) 50%, transparent)",
        borderLeft: "2px solid var(--mantine-color-blue-5)",
      }}>
        <Markdown content={details} />
      </div>
    </div>
  );
}

function DetailPane({ notification: n, onClose, onAdvance, onDismiss, onPlanReady, onPlanCleared }: {
  notification: NotificationItem;
  onClose: () => void;
  onAdvance: () => void;
  onDismiss: () => void;
  onPlanReady?: () => void;
  onPlanCleared?: () => void;
}) {
  const [conversation, setConversation] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [hasApproved, setHasApproved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const [startWorkOpen, setStartWorkOpen] = useState(false);

  // Config for repo mappings
  const [config, setConfig] = useState<{ repoMappings?: Array<{ pattern: string; repoPath: string }> } | null>(null);
  useEffect(() => {
    window.deck?.getConfig?.().then((c: unknown) => setConfig(c as typeof config)).catch(() => {});
  }, []);

  // Fetched context from the planning agent (Slack messages, Linear details, etc.)
  const [fetchedContext, setFetchedContext] = useState<Array<{ type: string; content: string; timestamp: string }>>([]);
  const [showContext, setShowContext] = useState(false);

  // Collapsible section state
  const [showTimeline, setShowTimeline] = useState(false); // collapsed by default (historical data)
  const [showActivity, setShowActivity] = useState(true);  // expanded while loading

  // Live activity feed — real-time events from the MCP planning agent
  const [activity, setActivity] = useState<Array<{ type: string; content: string; timestamp: string }>>([]);

  // Load existing plan on mount, and poll while in start_work/preparing stage
  useEffect(() => {
    let cancelled = false;
    const isPreparingStage = n.stage === "start_work" || n.stage === "preparing";

    const loadPlan = async () => {
      // Don't overwrite conversation while user is sending feedback
      if (sendingFeedbackRef.current) return;
      try {
        const existing = await window.deck?.getPlan?.(n.id);
        if (cancelled || sendingFeedbackRef.current) return;
        if (existing && (existing as { conversationHistory: typeof conversation }).conversationHistory?.length > 0) {
          setConversation((existing as { conversationHistory: typeof conversation }).conversationHistory);
          const ctx = (existing as { fetchedContext?: Array<{ type: string; content: string; timestamp: string }> }).fetchedContext;
          if (ctx?.length) setFetchedContext(ctx);
          setLoading(false);
          onPlanReady?.();
        } else if (isPreparingStage) {
          setLoading(true);
        }
      } catch {}
    };

    loadPlan();
    const planInterval = isPreparingStage ? setInterval(loadPlan, 3000) : undefined;

    return () => {
      cancelled = true;
      if (planInterval) clearInterval(planInterval);
    };
  }, [n.id, n.stage]);

  // Load persisted planning events on mount + subscribe to real-time events
  useEffect(() => {
    // Load persisted events first (survives page navigation)
    window.deck?.getPlanningEvents?.(n.id).then((events: Array<{ type: string; content: string; timestamp: string }>) => {
      if (events?.length) {
        setActivity(events);
        // If the last event is a "result", the plan completed — stop showing spinner
        const lastEvent = events[events.length - 1];
        if (lastEvent?.type === "result" || lastEvent?.type === "error") {
          setLoading(false);
        }
      }
    }).catch(() => {});

    // Subscribe to real-time events
    const cleanup = window.deck?.onPlanningEvent?.((data: { notificationId: string; event: { type: string; content: string; timestamp: string } }) => {
      if (data.notificationId !== n.id) return;
      setActivity(prev => [...prev.slice(-100), data.event]);
    });
    return () => { cleanup?.(); };
  }, [n.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation.length]);

  // Auto-scroll activity log when new events arrive
  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activity.length]);

  // Auto-collapse activity log when loading finishes; expand when loading starts
  const prevLoadingRef = useRef(loading);
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      // loading just went true -> false: collapse
      setShowActivity(false);
    } else if (!prevLoadingRef.current && loading) {
      // loading just went false -> true: expand
      setShowActivity(true);
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  const handlePrepare = async () => {
    const isHuman = n.taskType === "response" || n.taskType === "meeting_prep";
    if (!isHuman) {
      // For implementation tasks, open StartWorkModal for repo confirmation
      setStartWorkOpen(true);
      return;
    }
    // For response/meeting_prep, run directly (no repo needed)
    setLoading(true);
    const prepStage = "preparing";
    window.deck?.updateNotificationById?.(n.id, { stage: prepStage });
    try {
      const result = await window.deck.prepareWorkPlan({
        id: n.id, source: n.source, title: n.title, summary: n.summary, url: n.url,
        taskType: n.taskType, links: n.links,
      });
      const plan = result as { conversationHistory: Array<{ role: string; content: string }>; fetchedContext?: Array<{ type: string; content: string; timestamp: string }> };
      if (plan?.conversationHistory) setConversation(plan.conversationHistory as typeof conversation);
      if (plan?.fetchedContext) setFetchedContext(plan.fetchedContext);
      // Auto-transition response/meeting_prep to "ready" when preparation completes
      window.deck?.updateNotificationById?.(n.id, { stage: "ready" });
    } catch {}
    setLoading(false);
  };

  const handleStartWork = async (repoPath: string, branch: string) => {
    setStartWorkOpen(false);
    setLoading(true);
    window.deck?.updateNotificationById?.(n.id, { stage: "start_work", repoPath, branch });

    // Extract ticket ID from title (e.g., "VEC-24: ..." -> "VEC-24")
    const ticketMatch = n.title.match(/^([A-Z]+-\d+)/);
    const ticketId = ticketMatch ? ticketMatch[1] : n.title;

    try {
      const result = await window.deck.runSkill({
        skill: "/start-work",
        args: ticketId,
        repoPath,
        sessionId: null,
        notificationId: n.id,
      });

      if (result && typeof result === "object") {
        const skillResult = result as { success: boolean; sessionId: string | null; resultText: string };
        // Save session ID for future --resume
        if (skillResult.sessionId) {
          window.deck?.updateNotificationById?.(n.id, { sessionId: skillResult.sessionId });
        }
        // Try to read the plan from .work/ directory
        // The workSlug is derived from the branch name
        const slug = branch.replace(/^[^/]+\//, ""); // strip user prefix
        const planText = await window.deck.readPlan?.(repoPath, slug);
        if (planText) {
          setConversation([
            { role: "user", content: `**${n.title}**\n\n${n.summary}` },
            { role: "assistant", content: planText as string },
          ]);
          window.deck?.updateNotificationById?.(n.id, { workSlug: slug });
        } else if (skillResult.resultText) {
          setConversation([
            { role: "user", content: `**${n.title}**\n\n${n.summary}` },
            { role: "assistant", content: skillResult.resultText },
          ]);
        }
      }
    } catch (err) {
      console.error("Start work failed:", err);
    }
    setLoading(false);
  };

  // Track if we're currently sending feedback to prevent poll overwriting conversation
  const sendingFeedbackRef = useRef(false);

  const handleFeedback = async () => {
    if (!feedback.trim() || loading) return;
    const msg = feedback.trim();
    setFeedback("");
    setConversation(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    sendingFeedbackRef.current = true;
    try {
      const result = await window.deck.iteratePlan(n.id, msg);
      const plan = result as { conversationHistory: typeof conversation };
      if (plan?.conversationHistory) {
        setConversation(plan.conversationHistory);
      }
    } catch {}
    sendingFeedbackRef.current = false;
    setLoading(false);
  };

  const handleApprove = async () => {
    setHasApproved(true);
    setLoading(true);
    window.deck?.updateNotificationById?.(n.id, { stage: "hack" });
    try {
      const result = await window.deck.runSkill({
        skill: "/hack",
        args: "",
        repoPath: n.repoPath ?? "",
        sessionId: n.sessionId ?? null,
        notificationId: n.id,
      });
      if (result && typeof result === "object") {
        const skillResult = result as { success: boolean; sessionId: string | null; resultText: string };
        if (skillResult.sessionId) {
          window.deck?.updateNotificationById?.(n.id, { sessionId: skillResult.sessionId });
        }
      }
    } catch (err) {
      console.error("Hack failed:", err);
    }
    setLoading(false);
  };

  const handleShip = async () => {
    setLoading(true);
    window.deck?.updateNotificationById?.(n.id, { stage: "ship" });
    try {
      const result = await window.deck.runSkill({
        skill: "/ship",
        args: "",
        repoPath: n.repoPath ?? "",
        sessionId: n.sessionId ?? null,
        notificationId: n.id,
      });
      if (result && typeof result === "object") {
        const sr = result as { success: boolean; sessionId: string | null; resultText: string };
        if (sr.sessionId) window.deck?.updateNotificationById?.(n.id, { sessionId: sr.sessionId });
        // After ship, auto-start code review
        window.deck?.updateNotificationById?.(n.id, { stage: "code_review" });
      }
    } catch (err) { console.error("Ship failed:", err); }
    setLoading(false);
  };

  const handleCodeReview = async () => {
    setLoading(true);
    window.deck?.updateNotificationById?.(n.id, { stage: "code_review" });
    try {
      const result = await window.deck.runSkill({
        skill: "/code-review",
        args: "",
        repoPath: n.repoPath ?? "",
        sessionId: n.sessionId ?? null,
        notificationId: n.id,
      });
      if (result && typeof result === "object") {
        const sr = result as { success: boolean; sessionId: string | null; resultText: string };
        if (sr.sessionId) window.deck?.updateNotificationById?.(n.id, { sessionId: sr.sessionId });
      }
    } catch (err) { console.error("Code review failed:", err); }
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
            {n.priority && <Badge size="xs" variant="dot" color={n.priority === "critical" ? "red" : n.priority === "high" ? "yellow" : n.priority === "medium" ? "blue" : "gray"}>{n.priority}</Badge>}
          </Group>
          <UnstyledButton onClick={onClose} aria-label="Close detail pane"><Text size="xs" c="dimmed">Close</Text></UnstyledButton>
        </Group>
        <Text size="sm" fw={600}>{n.title}</Text>
        <Group gap={6}>
          {n.author && <Text size="xs" c="dimmed">{n.author}</Text>}
          <Text size="xs" c="dimmed" style={{ fontSize: "0.55rem", fontFamily: "var(--mantine-font-family-monospace)", opacity: 0.5 }}>{n.id}</Text>
        </Group>
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

      {/* Fetched Context — data gathered by the planning agent */}
      {fetchedContext.length > 0 && (
        <div style={{
          borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
        }}>
          <UnstyledButton
            onClick={() => setShowContext(!showContext)}
            style={{
              width: "100%", padding: "8px 20px",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <IconChevronRight size={12} className={`section-chevron${showContext ? " section-chevron--open" : ""}`} />
            <Text size="xs" fw={600} c="dimmed" style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Fetched Context ({fetchedContext.filter(e => e.type === "text").length} items)
            </Text>
          </UnstyledButton>
          <div style={{
            display: showContext ? "block" : "none",
            padding: "0 20px 8px",
            maxHeight: 300, overflowY: "auto",
          }}>
              <Stack gap={4}>
                {/* Extracted resource links from tool calls */}
                {(() => {
                  const links: Array<{ label: string; url: string; icon: string }> = [];
                  for (const evt of fetchedContext.filter(e => e.type === "tool_use")) {
                    const c = evt.content;
                    // Slack thread/channel: extract channel_id and thread_ts
                    const slackChannelMatch = c.match(/channel_id["\s:]+([CDG][A-Z0-9]{8,})/i);
                    const slackTsMatch = c.match(/thread_ts["\s:]+(\d+\.\d+)/);
                    if (slackChannelMatch) {
                      const chId = slackChannelMatch[1];
                      // Try to find a human-readable channel name from the notification's links
                      const knownLink = (n.links ?? []).find(l => l.url?.includes(chId));
                      const chName = knownLink?.label || chId;
                      if (slackTsMatch) {
                        links.push({ label: `Thread in ${chName}`, url: buildSlackArchiveUrl(chId, slackTsMatch[1]), icon: "#" });
                      }
                      // Don't show bare channel links — only thread links are useful as context
                    }
                    // Linear issue
                    const linearMatch = c.match(/get_issue.*?([A-Z]+-\d+)/i) || c.match(/issue["\s:]+([A-Z]+-\d+)/i);
                    if (linearMatch) {
                      links.push({ label: linearMatch[1], url: `https://linear.app/montecarlodata/issue/${linearMatch[1]}`, icon: "L" });
                    }
                    // Notion
                    const notionMatch = c.match(/(https:\/\/(?:www\.)?notion\.so\/[^\s"]+)/);
                    if (notionMatch) {
                      links.push({ label: "Notion page", url: notionMatch[1], icon: "N" });
                    }
                  }
                  // Deduplicate by URL AND by channel ID (same channel as thread + channel = keep thread only)
                  const seen = new Set<string>();
                  // Also exclude URLs already in the notification's links
                  const existingUrls = new Set((n.links ?? []).map(l => l.url));
                  const unique = links.filter(l => {
                    if (seen.has(l.url) || existingUrls.has(l.url)) return false;
                    seen.add(l.url);
                    return true;
                  });
                  if (unique.length === 0) return null;
                  return (
                    <div style={{ marginBottom: 6 }}>
                      <Text size="xs" c="dimmed" mb={4} style={{ fontSize: "0.6rem", textTransform: "uppercase" as const, letterSpacing: "0.03em" }}>
                        Sources fetched
                      </Text>
                      <Stack gap={2}>
                        {unique.map((link, i) => (
                          <UnstyledButton
                            key={i}
                            onClick={() => window.deck.openExternal(link.url)}
                            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.7rem" }}
                          >
                            <Badge size="xs" variant="light" color={link.icon === "#" ? "blue" : link.icon === "L" ? "violet" : "gray"} radius="sm" style={{ minWidth: 20, textAlign: "center" }}>
                              {link.icon}
                            </Badge>
                            <Text size="xs" c="blue.4" style={{ fontSize: "0.7rem" }}>{link.label} →</Text>
                          </UnstyledButton>
                        ))}
                      </Stack>
                    </div>
                  );
                })()}
                {/* Raw text context from the agent */}
                {fetchedContext
                  .filter(e => e.type === "text")
                  .map((evt, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "6px 10px", borderRadius: 6,
                        backgroundColor: "var(--mantine-color-dark-7)",
                        border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 20%, transparent)",
                        fontSize: "0.7rem", lineHeight: 1.5,
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}
                    >
                      {evt.content}
                    </div>
                  ))}
              </Stack>
            </div>
        </div>
      )}

      {/* Timeline — activity history for this task */}
      {n.timeline && n.timeline.length > 0 && (
        <div style={{
          borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
        }}>
          <UnstyledButton
            onClick={() => setShowTimeline(!showTimeline)}
            style={{
              width: "100%", padding: "8px 20px",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <IconChevronRight size={12} className={`section-chevron${showTimeline ? " section-chevron--open" : ""}`} />
            <Text size="xs" fw={600} c="dimmed" style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Timeline ({n.timeline.length})
            </Text>
          </UnstyledButton>
          <div style={{
            display: showTimeline ? "block" : "none",
            padding: "0 20px 10px",
            maxHeight: 200,
            overflowY: "auto",
          }}>
            <div style={{ borderLeft: "2px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)", paddingLeft: 12 }}>
              {[...n.timeline].reverse().map((entry, i) => {
                const d = new Date(entry.timestamp);
                const isStageChange = entry.event.includes("→") || entry.event.includes("Stage:") || entry.event.includes("Reset from");
                const isCreation = entry.event.startsWith("Created from");
                return (
                  <div key={i} style={{ position: "relative", paddingBottom: 8, paddingTop: i === 0 ? 0 : 4 }}>
                    {/* Dot on the timeline line */}
                    <div style={{
                      position: "absolute", left: -17, top: 4,
                      width: 8, height: 8, borderRadius: "50%",
                      backgroundColor: isCreation ? "#3b82f6" : isStageChange ? "#a855f7" : "var(--mantine-color-dark-4)",
                      border: "2px solid var(--mantine-color-dark-8)",
                    }} />
                    <Group gap={6} wrap="nowrap" align="flex-start">
                      <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem", flexShrink: 0, fontVariantNumeric: "tabular-nums", minWidth: 70 }}>
                        {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} {d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </Text>
                      <Text size="xs" style={{
                        fontSize: "0.7rem", lineHeight: 1.4,
                        color: isStageChange ? "var(--mantine-color-violet-4)" : isCreation ? "var(--mantine-color-blue-4)" : "inherit",
                      }}>
                        {entry.event}
                      </Text>
                    </Group>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Activity log — shows for ALL task types during/after active planning */}
      {activity.length > 0 && (
        <div style={{
          borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
        }}>
          <UnstyledButton
            onClick={() => setShowActivity(!showActivity)}
            style={{
              width: "100%", padding: "8px 20px",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <IconChevronRight size={12} className={`section-chevron${showActivity ? " section-chevron--open" : ""}`} />
            <Text size="xs" fw={600} c="dimmed" style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Activity log ({activity.length})
            </Text>
            {loading && <Loader size={12} style={{ marginLeft: 4 }} />}
          </UnstyledButton>
          <div style={{
            display: showActivity ? "block" : "none",
            padding: "0 20px 8px",
          }}>
            {loading && (
              <Text size="xs" c="dimmed" mb={4} style={{ fontSize: "0.65rem" }}>
                {activity[activity.length - 1]?.type === "status"
                  ? activity[activity.length - 1].content
                  : "Agent working..."}
              </Text>
            )}
            <div style={{
              padding: "2px 0", borderRadius: 8,
              backgroundColor: "var(--mantine-color-dark-8)",
              border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 20%, transparent)",
              maxHeight: 200, overflowY: "auto",
              fontSize: "0.7rem", fontFamily: "var(--mantine-font-family-monospace)",
              lineHeight: 1.5,
            }}>
              <div style={{ padding: "4px 0" }}>
                {activity.slice(-20).map((evt, i) => {
                  const ts = (() => { try { return new Date(evt.timestamp).toTimeString().slice(0, 8); } catch { return ""; } })();
                  const color = evt.type === "init" ? "#22c55e"
                    : evt.type === "tool_use" ? "#60a5fa"
                    : evt.type === "text" ? "#94a3b8"
                    : evt.type === "error" ? "#f87171"
                    : evt.type === "result" ? "#34d399"
                    : "#6b7280";
                  return (
                    <div key={i} style={{ padding: "3px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ color: "color-mix(in srgb, var(--mantine-color-dimmed) 50%, transparent)", fontVariantNumeric: "tabular-nums", flexShrink: 0, fontSize: "0.65rem" }}>{ts}</span>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color, flexShrink: 0, marginTop: 5 }} />
                      <span style={{ color, whiteSpace: "pre-wrap", wordBreak: "break-word", flex: 1 }}>
                        {evt.type === "tool_use" ? <><b>{evt.content.split(":")[0]}</b>{evt.content.includes(":") ? `: ${evt.content.split(":").slice(1).join(":")}` : ""}</> : evt.content}
                      </span>
                    </div>
                  );
                })}
                <div ref={activityEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shared action bar — Analyze / Rerun / Dismiss — visible for all task types */}
      {!loading && (
        <div style={{
          padding: "8px 20px",
          borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
          display: "flex", gap: 8, alignItems: "center",
        }}>
          {(conversation.length > 0 || fetchedContext.length > 0) ? (
            <UnstyledButton
              onClick={() => {
                window.deck.clearPlan?.(n.id);
                setConversation([]);
                setFetchedContext([]);
                setActivity([]);
                onPlanCleared?.();
                handlePrepare();
              }}
              style={{
                padding: "6px 12px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600,
                backgroundColor: "var(--mantine-color-dark-6)", color: "var(--mantine-color-text)",
                border: "1px solid var(--mantine-color-default-border)",
              }}
            >
              Rerun
            </UnstyledButton>
          ) : (
            <UnstyledButton
              onClick={handlePrepare}
              style={{
                padding: "6px 12px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600,
                backgroundColor: "var(--mantine-color-blue-5)", color: "white",
              }}
            >
              Analyze
            </UnstyledButton>
          )}
          <UnstyledButton
            onClick={onDismiss}
            style={{
              padding: "6px 12px", borderRadius: 6, fontSize: "0.75rem",
              color: "var(--mantine-color-dimmed)",
            }}
          >
            Dismiss
          </UnstyledButton>
        </div>
      )}

      {/* Task-type-specific view */}
      {(() => {
        const viewType = getDetailViewType(n.taskType);

        switch (viewType) {
          case "response":
            return (
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
                <ResponseDetailView
                  notification={n}
                  fetchedContext={fetchedContext}
                  conversation={conversation}
                  onMarkDone={onDismiss}
                  onSendSlack={async (msg, ch, ts) => {
                    const result = await window.deck.sendSlackMessage?.(ch, ts, msg);
                    if (result?.ok) {
                      window.deck?.updateNotificationById?.(n.id, { stage: "done" });
                      onDismiss();
                    }
                  }}
                />
              </div>
            );

          case "meeting_prep":
            return (
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
                <MeetingPrepDetailView
                  notification={n}
                  fetchedContext={fetchedContext}
                  onMarkDone={() => onDismiss()}
                />
              </div>
            );

          case "review":
          case "implementation":
          default:
            return (
              <>
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
                      // Filter out agent narration lines from the TL;DR
                      const tldrRaw = parts[0].trim();
                      const tldr = tldrRaw.split("\n").filter(line => {
                        const l = line.trim().toLowerCase();
                        // Skip agent narration / internal monologue
                        if (l.startsWith("i need to") || l.startsWith("i'll ") || l.startsWith("let me ") || l.startsWith("i found") || l.startsWith("i can see") || l.startsWith("i've ")) return false;
                        if (l.startsWith("now let me") || l.startsWith("searching for") || l.startsWith("fetching") || l.startsWith("reading")) return false;
                        if (l.includes("mcp__claude_ai") || l.includes("slack_read") || l.includes("get_issue")) return false;
                        return true;
                      }).join("\n").trim() || tldrRaw; // Fallback to original if all lines filtered
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

                  {/* Error detection — show retry if last message was a timeout/error */}
                  {!loading && conversation.length > 0 && (() => {
                    const last = conversation[conversation.length - 1];
                    const isError = last.role === "assistant" && (
                      last.content.includes("timed out") || last.content.includes("not ready") || last.content.includes("Bridge not")
                    );
                    if (!isError) return null;
                    return (
                      <div style={{ padding: "12px", borderRadius: 8, backgroundColor: "color-mix(in srgb, var(--mantine-color-red-9) 15%, transparent)", marginTop: 8 }}>
                        <Text size="xs" c="red.4" mb={8}>Plan failed — the bridge timed out or wasn't ready.</Text>
                        <UnstyledButton
                          onClick={() => {
                            window.deck.clearPlan?.(n.id);
                            setConversation([]);
                            onPlanCleared?.(); // Reset "Plan ready" dot back to "Planning..."
                            handlePrepare();
                          }}
                          style={{ padding: "6px 12px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600, backgroundColor: "var(--mantine-color-red-7)", color: "white" }}
                        >
                          Retry
                        </UnstyledButton>
                      </div>
                    );
                  })()}

                  {/* Activity log removed — now in shared section above router */}
                  {loading && activity.length === 0 && (
                    <Group gap={8} py="sm">
                      <Loader size={14} />
                      <Text size="xs" c="dimmed">Working...</Text>
                    </Group>
                  )}
                </div>

                {/* Feedback + approve — only shown when conversation exists */}
                {conversation.length > 0 && (
                <div style={{ padding: "12px 20px", borderTop: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}>
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
                          <div>
                            <UnstyledButton onClick={handleApprove} style={{
                              padding: "8px 16px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600,
                              backgroundColor: "#22c55e", color: "white",
                            }}>
                              Approve & start agent
                            </UnstyledButton>
                            <Text size="xs" c="dimmed" mt={4} style={{ fontSize: "0.6rem", maxWidth: 280 }}>
                              Runs /hack in {n.repoPath?.split("/").pop() || "target repo"} — implements plan phases, runs tests, commits per task. Does NOT push or create PRs.
                            </Text>
                          </div>
                        )}
                        {n.stage === "hack" && !loading && (
                          <div>
                            <UnstyledButton onClick={handleShip} style={{
                              padding: "8px 16px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600,
                              backgroundColor: "#06b6d4", color: "white",
                            }}>
                              Ship
                            </UnstyledButton>
                            <Text size="xs" c="dimmed" mt={4} style={{ fontSize: "0.6rem", maxWidth: 280 }}>
                              Runs /ship in {n.repoPath?.split("/").pop() || "repo"} — verifies code, pushes branch, opens PR. Moves Linear to In Review.
                            </Text>
                          </div>
                        )}
                        {n.stage === "ship" && !loading && (
                          <div>
                            <UnstyledButton onClick={handleCodeReview} style={{
                              padding: "8px 16px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600,
                              backgroundColor: "#f97316", color: "white",
                            }}>
                              Run Code Review
                            </UnstyledButton>
                            <Text size="xs" c="dimmed" mt={4} style={{ fontSize: "0.6rem", maxWidth: 280 }}>
                              Runs /code-review — parallel agents check security, architecture, testing, correctness.
                            </Text>
                          </div>
                        )}
                        <UnstyledButton
                          onClick={() => {
                            window.deck.clearPlan?.(n.id);
                            setConversation([]);
                            setLoading(true);
                            setActivity([]);
                            onPlanCleared?.(); // Clear "Plan ready" green dot
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
                </div>
                )}
              </>
            );
        }
      })()}
      <StartWorkModal
        opened={startWorkOpen}
        onClose={() => setStartWorkOpen(false)}
        onConfirm={handleStartWork}
        notification={{ id: n.id, title: n.title, source: n.source, taskType: n.taskType, links: n.links }}
        detectedRepo={detectRepo({ title: n.title, links: n.links ?? [] }, config?.repoMappings ?? [])}
        suggestedBranch={`kwilliams/${n.title.match(/^([A-Z]+-\d+)/)?.[1]?.toLowerCase() ?? "task"}-${n.title.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        repoOptions={(config?.repoMappings ?? []).map(m => ({ value: m.repoPath, label: m.repoPath.split("/").pop() ?? m.repoPath }))}
      />
    </div>
  );
}
