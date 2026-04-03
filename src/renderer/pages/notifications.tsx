import { Badge, Group, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import {
  IconInbox, IconSparkles, IconPlayerPlay, IconGitPullRequest, IconCircleCheck,
  IconBrandGithub, IconHash, IconMail, IconFileText, IconChevronRight, IconChevronDown,
  IconGripVertical, IconEyeOff, IconPlus, IconPencil, IconArchive, IconEye,
  IconShieldCheck, IconAlertTriangle, IconShieldX,
} from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { usePollStatus } from "../hooks/usePollStatus";
import { AddToManagerButton } from "../components/AddToManagerButton";
import { AddTaskModal } from "../components/AddTaskModal";
import { AppHeader } from "../components/AppHeader";
import { GlobalLoadingBanner } from "../components/GlobalLoadingBanner";
import { DetailDrawer } from "../components/DetailDrawer";
import { buildSlackArchiveUrl, computeParentStage } from "../../shared/task-utils";
import { STAGE_META, SOURCE_COLORS } from "../../shared/ui-constants";
import { formatTimeSince } from "../components/shared";
import { SubtaskList } from "../components/SubtaskList";

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
  parentTaskId?: string;
  subtaskIds?: string[];
  verdict?: { status: "approved" | "concerns" | "rejected"; summary: string };
}

// Agent-actionable: an agent can do the actual work end-to-end
const AGENT_ACTIONABLE_TYPES = new Set(["implementation", "investigation"]);
// Human-only: agent prepares context but you handle it
const HUMAN_ONLY_TYPES = new Set(["meeting_prep", "response", "review"]);

type StageConfig = { key: string; label: string; Icon: React.FC<{ size?: number; color?: string; stroke?: number }>; color: string; tip: string };

const SHARED_STAGES: StageConfig[] = [
  { key: "new", label: STAGE_META.new.label, Icon: IconInbox, color: STAGE_META.new.color, tip: STAGE_META.new.tip },
];

const AGENT_STAGES: StageConfig[] = [
  { key: "start_work", label: STAGE_META.start_work.label, Icon: IconSparkles, color: STAGE_META.start_work.color, tip: STAGE_META.start_work.tip },
  // plan_review has no column — tasks in plan_review appear under Planning (start_work)
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
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const toggleParentExpanded = (id: string) => setExpandedParents(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
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
  const [config, setConfig] = useState<{ repoMappings?: Array<{ pattern: string; repoPath: string }>; name?: string; linearUsername?: string } | null>(null);

  useEffect(() => {
    window.deck.checkAuth?.().then(setAuthStatus).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const has = await window.deck.hasConfig?.();
        if (has) { const c = await window.deck.getConfig?.(); setConfig(c as typeof config); }
      } catch { /* no config yet */ }
    })();
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
    let movedTitle = "";
    let oldStage = "new";
    let movedParentTaskId: string | undefined;
    setNotifications(prev => {
      const updated = prev.map(n => {
        if (n.id === id) {
          movedTitle = n.title;
          oldStage = n.stage ?? "new";
          movedParentTaskId = n.parentTaskId;
          return { ...n, stage: newStage };
        }
        return n;
      });
      return updated;
    });

    // All items are now server-side, just update by ID
    window.deck.updateNotificationById?.(id, { stage: newStage })
      .catch(() => {});

    // Learn from user's manual stage change
    if (movedTitle && oldStage !== newStage) {
      window.deck.learnFromAction?.("priority_change", `Moved "${movedTitle}" from ${oldStage} to ${newStage}`).catch(() => {});
    }

    // Stage cascade: if this is a subtask, recompute and update the parent stage
    if (movedParentTaskId) {
      const parentId = movedParentTaskId;
      setNotifications(prev => {
        const parent = prev.find(n => n.id === parentId);
        if (!parent?.subtaskIds) return prev;
        const siblingStages = parent.subtaskIds.map(sid => {
          const sibling = prev.find(n => n.id === sid);
          return sibling?.stage ?? "new";
        });
        const newParentStage = computeParentStage(siblingStages);
        if (newParentStage !== parent.stage) {
          window.deck.updateNotificationById?.(parentId, { stage: newParentStage }).catch(() => {});
          return prev.map(n => n.id === parentId ? { ...n, stage: newParentStage } : n);
        }
        return prev;
      });
    }
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
  // lookbackHours removed — global refresh handles cadence
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

  // Build a lookup map for quick notification access by ID
  const notificationMap = useMemo(() => {
    const m = new Map<string, NotificationItem>();
    for (const n of notifications) m.set(n.id, n);
    return m;
  }, [notifications]);

  // Memoize filtered lists so we don't re-filter on every render
  const actionableByStage = useMemo(() => {
    const map = new Map<string, NotificationItem[]>();
    for (const stage of ACTIONABLE_ROW) {
      const filtered = notifications.filter(n => {
        // Exclude subtasks from top-level kanban — they appear nested under parent
        if (n.parentTaskId) return false;
        if (HUMAN_ONLY_TYPES.has(n.taskType ?? "")) return false;
        if (n.stage === "skipped") return false;
        // Parent tasks: compute effective stage from children
        let nStage = n.stage ?? "new";
        if (n.subtaskIds && n.subtaskIds.length > 0) {
          const childStages = n.subtaskIds.map(id => notificationMap.get(id)?.stage ?? "new");
          nStage = computeParentStage(childStages);
        }
        // plan_review tasks appear in the Planning (start_work) column
        const effectiveStage = nStage === "plan_review" ? "start_work" : nStage;
        return effectiveStage === stage.key;
      }).sort(sortByPriority);
      map.set(stage.key, filtered);
    }
    return map;
  }, [notifications, notificationMap]);

  const humanByStage = useMemo(() => {
    const map = new Map<string, NotificationItem[]>();
    for (const stage of HUMAN_ROW) {
      const filtered = notifications.filter(n => {
        // Exclude subtasks from top-level kanban
        if (n.parentTaskId) return false;
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
            <Text size="xs" c="dimmed">{notifications.filter(n => n.stage !== "skipped").length} items</Text>
            {!pollStatus.fetching && notifications.some(n => n.pollCycle && (!seenCycle.has(n.id) || (seenCycle.get(n.id) ?? 0) < n.pollCycle)) && (
              <UnstyledButton onClick={markAllSeen} aria-label="Mark all as read" style={{ fontSize: "0.6rem", color: "var(--mantine-color-blue-4)", padding: "2px 6px", borderRadius: 4, backgroundColor: "color-mix(in srgb, var(--mantine-color-blue-9) 15%, transparent)" }}>
                Mark all read
              </UnstyledButton>
            )}
            <UnstyledButton
              onClick={() => setShowDebug(!showDebug)}
              style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 500, color: showDebug ? "var(--mantine-color-blue-4)" : "var(--mantine-color-dimmed)" }}
            >
              {showDebug ? "Hide logs" : "Logs"}
            </UnstyledButton>
          </>
        }
      />
      <GlobalLoadingBanner />

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
                          const isParent = (n.subtaskIds?.length ?? 0) > 0;
                          const isExpanded = expandedParents.has(n.id);
                          return (
                            <div key={n.id}>
                            <div
                              draggable
                              onMouseDown={() => { wasDragging.current = false; }}
                              onDragStart={(e) => { if (isParent) { e.preventDefault(); return; } e.dataTransfer.setData("text/plain", n.id); setDraggingId(n.id); wasDragging.current = true; }}
                              onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                              onClick={() => {
                                if (wasDragging.current) { wasDragging.current = false; return; }
                                if (n.pollCycle) markSeen(n.id, n.pollCycle);
                                setSelectedId(n.id === selectedId ? null : n.id);
                              }}
                              className="notif-card"
                              style={{
                                padding: "10px 12px", borderRadius: 6, cursor: isParent ? "pointer" : "grab", userSelect: "none",
                                border: `1px solid ${
                                  n.id === selectedId ? "var(--mantine-color-blue-5)"
                                  : "color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)"
                                }`,
                                backgroundColor: (n.stage === "done" || n.stage === "backlog") ? "var(--mantine-color-body)" : "var(--mantine-color-default)",
                                opacity: isDragging ? 0.4 : (n.stage === "done" || n.stage === "backlog") ? 0.5 : 1,
                                transition: "opacity 0.15s ease, background-color 0.15s ease",
                              }}
                            >
                              <Group gap={6} mb={2} justify="space-between">
                                <Group gap={4}>
                                  {!isParent && <IconGripVertical size={10} color="var(--mantine-color-dimmed)" style={{ opacity: 0.3 }} />}
                                  {isParent && (
                                    <UnstyledButton
                                      onClick={(e) => { e.stopPropagation(); toggleParentExpanded(n.id); }}
                                      style={{ padding: 0, display: "flex", alignItems: "center" }}
                                    >
                                      {isExpanded ? <IconChevronDown size={12} color="var(--mantine-color-dimmed)" /> : <IconChevronRight size={12} color="var(--mantine-color-dimmed)" />}
                                    </UnstyledButton>
                                  )}
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
                                {n.verdict && (
                                  <Tooltip label={n.verdict.summary} withArrow>
                                    <span style={{ display: "inline-flex", alignItems: "center" }}>
                                      {n.verdict.status === "approved" ? <IconShieldCheck size={12} color="var(--mantine-color-green-5)" />
                                        : n.verdict.status === "concerns" ? <IconAlertTriangle size={12} color="var(--mantine-color-yellow-5)" />
                                        : <IconShieldX size={12} color="var(--mantine-color-red-5)" />}
                                    </span>
                                  </Tooltip>
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
                                {isParent && (
                                  <Badge size="xs" variant="light" color="violet" radius="sm" style={{ fontSize: "0.55rem" }}>
                                    {n.subtaskIds!.length} subtask{n.subtaskIds!.length !== 1 ? "s" : ""}
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
                              {!isParent && (stage.key === "start_work" || stage.key === "hack") && !plansReady.has(n.id) && (
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
                              {!isParent && stage.key !== "done" && stage.key !== "skipped" && stage.key !== "start_work" && stage.key !== "hack" && (
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
                            {/* Expanded subtask list for parent cards */}
                            {isParent && isExpanded && (
                              <div style={{
                                padding: "4px 8px",
                                borderLeft: "2px solid var(--mantine-color-violet-5)",
                                marginLeft: 8,
                                marginTop: 2,
                              }}>
                                <SubtaskList
                                  subtasks={(n.subtaskIds ?? []).map(id => {
                                    const child = notificationMap.get(id);
                                    return { id, title: child?.title ?? id, stage: child?.stage ?? "new" };
                                  })}
                                  onSelect={(childId) => {
                                    setSelectedId(childId);
                                  }}
                                />
                              </div>
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
                                backgroundColor: (n.stage === "done" || n.stage === "backlog") ? "var(--mantine-color-body)" : "var(--mantine-color-default)",
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
                            backgroundColor: "var(--mantine-color-body)",
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

      {/* Detail drawer */}
      {selected && (
        <>
          {/* Backdrop — click to close */}
          <div
            onClick={() => setSelectedId(null)}
            style={{ position: "fixed", inset: 0, top: 42, zIndex: 99, backgroundColor: "rgba(0,0,0,0.2)" }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="detail-drawer-panel"
            style={{
              position: "fixed", top: 42, right: 0, bottom: 0,
              width: 520, maxWidth: "60vw",
              zIndex: 100,
              backgroundColor: "var(--mantine-color-body)",
              borderLeft: "1px solid var(--mantine-color-default-border)",
              boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
              animation: "slideInRight 0.2s ease-out",
            }}
          >
            <DetailDrawer
              notification={selected}
              onClose={() => setSelectedId(null)}
              onDismiss={() => dismiss(selected.id)}
              onPlanReady={() => setPlansReady(prev => new Set([...prev, selected.id]))}
              onPlanCleared={() => setPlansReady(prev => { const next = new Set(prev); next.delete(selected.id); return next; })}
              config={config}
              notificationMap={notificationMap}
              onSelectNotification={(id) => setSelectedId(id)}
            />
          </div>
        </>
      )}


      {/* Debug sidebar */}
      {showDebug && (
        <div style={{
          position: "fixed", top: 42, right: 0, bottom: 0, width: 400,
          backgroundColor: "var(--mantine-color-body)",
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
                    : "var(--mantine-color-default)",
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
