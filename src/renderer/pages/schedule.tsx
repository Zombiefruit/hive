import { Badge, Group, Loader, Progress, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import {
  IconCalendarEvent, IconCircleCheck, IconRefresh, IconChevronRight,
  IconChevronDown, IconGripVertical, IconFocus2,
} from "@tabler/icons-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { AppHeader } from "../components/AppHeader";
import { PRIORITY_COLORS, PRIORITY_BG_TINTS, TASK_TYPE_LABELS } from "../../shared/ui-constants";

interface ScheduleItem {
  id: string;
  title: string;
  source: string;
  taskType: string;
  priority: string;
  confidence?: number;
  estimatedMinutes: number;
  startTime: string; // HH:MM
  endTime: string;
  status: "pending" | "active" | "done";
  summary?: string;
  actionNeeded?: string;
  url?: string;
  links?: Array<{ type: string; label: string; url: string }>;
}

// Math: smallest task = 15min = HOUR_HEIGHT/4. Min card = 36px for title. So HOUR_HEIGHT = 36*4 = 144.
const MIN_CARD_HEIGHT = 36;
const HOUR_HEIGHT = MIN_CARD_HEIGHT * 4; // 144px — guarantees 15min tasks always fit

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  // Cap at 23:59 — never produce "26:00" or similar
  const capped = Math.min(mins, 23 * 60 + 59);
  const h = Math.floor(capped / 60);
  const m = capped % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

const priorityColors = PRIORITY_COLORS as Record<string, string>;
const priorityBgTints = PRIORITY_BG_TINTS as Record<string, string>;
const taskTypeLabels = TASK_TYPE_LABELS;

/** Recalculate start/end times after reorder, back-to-back */
function recalcTimes(items: ScheduleItem[], dayStartMinutes: number): ScheduleItem[] {
  let cursor = dayStartMinutes;
  return items.map(item => {
    const start = minutesToTime(cursor);
    const end = minutesToTime(cursor + item.estimatedMinutes);
    cursor += item.estimatedMinutes;
    return { ...item, startTime: start, endTime: end };
  });
}

/** Fetches and displays timeline from the notification data for a schedule task. */
function ScheduleTaskTimeline({ taskId }: { taskId: string }) {
  const [timeline, setTimeline] = useState<Array<{ timestamp: string; event: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await window.deck?.getNotifications?.();
        if (cancelled || !result) return;
        const all = Array.isArray(result) ? result : ((result as { items?: unknown[] }).items ?? []);
        const n = (all as Array<{ id: string; timeline?: Array<{ timestamp: string; event: string }> }>).find(n => n.id === taskId);
        if (n?.timeline?.length) setTimeline(n.timeline);
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [taskId]);

  if (timeline.length === 0) return null;

  return (
    <>
      <Text size="xs" fw={600} mt={16} mb={6}>Activity</Text>
      <Stack gap={4}>
        {[...timeline].reverse().map((entry, i) => (
          <Group key={i} gap={8} wrap="nowrap">
            <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "var(--mantine-color-dimmed)", flexShrink: 0, marginTop: 5 }} />
            <div>
              <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem" }}>
                {new Date(entry.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
              </Text>
              <Text size="xs" style={{ fontSize: "0.7rem" }}>{entry.event}</Text>
            </div>
          </Group>
        ))}
      </Stack>
    </>
  );
}

const SCHEDULE_STORAGE_KEY = "claude-deck-schedule-slots";

/** Only time assignments are persisted — all other data comes from notifications (SSoT). */
type TimeSlot = { startTime: string; endTime: string };
type SlotStore = { slots: Record<string, TimeSlot>; date: string };

function loadTimeSlots(): Record<string, TimeSlot> {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SlotStore;
    const today = new Date().toISOString().split("T")[0];
    if (parsed.date === today) return parsed.slots;
  } catch {}
  return {};
}

function saveTimeSlots(slots: Record<string, TimeSlot>): void {
  try {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({ slots, date: today }));
  } catch {}
}

export function Schedule() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNextDay, setIsNextDay] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<string | null>(null);

  // Load working hours from config (not hardcoded)
  const [workingHours, setWorkingHours] = useState({ start: "09:00", end: "18:00" });
  useEffect(() => {
    (async () => {
      try {
        const config = await window.deck?.getConfig?.();
        if (config) {
          setWorkingHours({
            start: (config as { workingHoursStart?: string }).workingHoursStart ?? "09:00",
            end: (config as { workingHoursEnd?: string }).workingHoursEnd ?? "18:00",
          });
        }
      } catch {}
    })();
  }, []);
  const [focusMode, setFocusMode] = useState(false);

  // Auto-scroll to current time on mount
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (hasScrolledRef.current || items.length === 0) return;
    hasScrolledRef.current = true;
    // Scroll so current time is roughly centered
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const offsetPx = (nowMins / 60) * HOUR_HEIGHT;
    const container = scrollContainerRef.current;
    if (container) {
      const centerOffset = Math.max(0, offsetPx - container.clientHeight / 2);
      container.scrollTop = centerOffset;
    }
  }, [items.length, workingHours.start]);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const wasDragging = useRef(false);

  // Load schedule from notifications
  // forceRegen = true clears all stored slots and reassigns from scratch
  const generateSchedule = useCallback(async (forceRegen = false) => {
    setGenerating(true);
    try {
      if (!window.deck) return;
      const result = await window.deck.getNotifications();
      if (!result) return;
      const data = result as { items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
      const notifications = Array.isArray(data) ? data : (data.items ?? []);

      // Filter to actionable items (not done, not skipped)
      const actionable = notifications.filter(n =>
        n.stage !== "done" && n.stage !== "skipped" && n.stage !== "follow_up"
      );

      // Estimate time per task type
      const estimateMinutes = (n: Record<string, unknown>): number => {
        const type = String(n.taskType ?? "");
        if (type === "meeting_prep") return 30;
        if (type === "response") return 15;
        if (type === "review") return 45;
        if (type === "investigation") return 60;
        if (type === "implementation") return 90;
        if (type === "planning") return 30;
        return 30;
      };

      // Sort by priority (critical > high > medium > low > backlog), then confidence
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, backlog: 4 };
      const sorted = [...actionable].sort((a, b) => {
        const pa = priorityOrder[String(a.priority ?? "medium")] ?? 2;
        const pb = priorityOrder[String(b.priority ?? "medium")] ?? 2;
        if (pa !== pb) return pa - pb;
        return (Number(b.confidence ?? 0)) - (Number(a.confidence ?? 0));
      });

      // SSoT: notifications are the source of truth for all task data.
      // localStorage only stores TIME SLOT ASSIGNMENTS.
      const slots = forceRegen ? {} : loadTimeSlots();
      const schedule: ScheduleItem[] = [];

      // Find next available slot
      const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
      const endOfDay = timeToMinutes(workingHours.end);
      const startOfDay = timeToMinutes(workingHours.start);
      const rounded = Math.ceil(nowMins / 15) * 15;

      // Only show "Tomorrow" if the current time is ACTUALLY past working hours
      const isPastWorkingHours = rounded >= endOfDay;
      let nextSlot = isPastWorkingHours ? startOfDay : Math.max(rounded, startOfDay);
      if (!forceRegen) {
        for (const [, slot] of Object.entries(slots)) {
          const endMins = timeToMinutes(slot.endTime);
          if (endMins > nextSlot) nextSlot = endMins;
        }
      }

      for (const n of sorted) {
        const id = String(n.id);
        const customEst = n.estimatedMinutes ? Number(n.estimatedMinutes) : 0;
        const est = customEst > 0 ? customEst : estimateMinutes(n);

        // If no slot exists (or force regen), assign one
        if (!slots[id]) {
          slots[id] = { startTime: minutesToTime(nextSlot), endTime: minutesToTime(nextSlot + est) };
          nextSlot += est;
        }

        // Build ScheduleItem from notification data (SSoT) + time slot
        schedule.push({
          id,
          title: String(n.title ?? ""),
          source: String(n.source ?? ""),
          taskType: String(n.taskType ?? ""),
          priority: String(n.priority ?? "medium"),
          confidence: Number(n.confidence ?? 0),
          estimatedMinutes: est,
          startTime: slots[id].startTime,
          endTime: slots[id].endTime,
          status: n.stage === "working" ? "active" : n.stage === "done" ? "done" : "pending",
          summary: String(n.summary ?? ""),
          actionNeeded: n.actionNeeded ? String(n.actionNeeded) : undefined,
          url: n.url ? String(n.url) : undefined,
          links: (n.links as ScheduleItem["links"]) ?? undefined,
        });
      }

      saveTimeSlots(slots);
      setIsNextDay(isPastWorkingHours);
      setScheduleDate(new Date().toISOString().split("T")[0]);
      setItems(schedule);
    } catch {}
    setGenerating(false);
  }, [workingHours]); // eslint-disable-line — items intentionally not in deps to avoid infinite loop

  useEffect(() => { generateSchedule(); }, [generateSchedule]);

  // Auto-regenerate when notifications update
  useEffect(() => {
    if (!window.deck?.onNotificationsUpdate) return;
    const unsub = window.deck.onNotificationsUpdate(() => {
      generateSchedule();
    });
    return unsub;
  }, [generateSchedule]);

  // Live-updating current time (re-renders every 60s) — must be before timeline calcs
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  // Track the current date string so we can detect day changes
  const [todayStr, setTodayStr] = useState(() => new Date().toISOString().split("T")[0]);
  useEffect(() => {
    const interval = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
      // Detect day change (midnight boundary) — regenerate schedule
      const newDay = n.toISOString().split("T")[0];
      if (newDay !== todayStr) {
        setTodayStr(newDay);
        generateSchedule(true);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [todayStr, generateSchedule]);

  // Timeline — full 24-hour day, always
  const startHour = 0;
  const endHour = 24;
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const dayStartMinutes = timeToMinutes(workingHours.start);
  const dayEndMinutes = timeToMinutes(workingHours.end);
  // Show current time indicator — always visible on today's schedule
  // The timeline starts at startHour (0), so offset is from hour 0
  const nowInRange = !isNextDay;
  const nowOffset = nowInRange ? ((nowMinutes - startHour * 60) / 60) * HOUR_HEIGHT : -1;

  // Detect stale schedule: data was generated for a previous day
  const isStaleSchedule = scheduleDate !== null && scheduleDate !== todayStr && !isNextDay;

  const totalHeight = (endHour - startHour) * HOUR_HEIGHT;

  // Capacity calculations
  const totalWorkMinutes = items.reduce((sum, i) => sum + i.estimatedMinutes, 0);
  const availableMinutes = dayEndMinutes - dayStartMinutes;
  const capacityPct = availableMinutes > 0 ? Math.min(100, Math.round((totalWorkMinutes / availableMinutes) * 100)) : 0;

  const markDone = (id: string) => {
    // Update the SSoT (notifications) — schedule will rebuild from it
    window.deck?.updateNotificationById?.(id, { stage: "done" });
    // Optimistic local update so UI reflects immediately
    setItems(prev => prev.map(item => item.id === id ? { ...item, status: "done" as const } : item));
  };

  // Drag handlers for reorder
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
    wasDragging.current = true;
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragOverId) setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    setItems(prev => {
      const srcIdx = prev.findIndex(i => i.id === sourceId);
      const tgtIdx = prev.findIndex(i => i.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, moved);
      const reordered = recalcTimes(next, dayStartMinutes);
      // Persist new time assignments
      const slots = loadTimeSlots();
      for (const item of reordered) {
        slots[item.id] = { startTime: item.startTime, endTime: item.endTime };
      }
      saveTimeSlots(slots);
      return reordered;
    });

    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--aegen-void)" }}>
      {/* Header */}
      <AppHeader
        rightContent={
          <>
            <Text size="xs" c="dimmed">
              {(isNextDay ? new Date(Date.now() + 86400000) : new Date()).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}{isNextDay ? " (Tomorrow)" : ""}
            </Text>
            <Tooltip label={focusMode ? "Exit focus mode" : "Focus mode — hide sidebar"} position="bottom" withArrow>
              <UnstyledButton
                onClick={() => setFocusMode(f => !f)}
                style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 500,
                  backgroundColor: focusMode ? "var(--mantine-color-blue-filled)" : "var(--mantine-color-default-hover)",
                  color: focusMode ? "white" : "var(--mantine-color-dimmed)",
                  display: "flex", alignItems: "center", gap: 4,
                  transition: "background-color 0.15s ease, color 0.15s ease",
                }}
              >
                <IconFocus2 size={12} />
                Focus
              </UnstyledButton>
            </Tooltip>
            <UnstyledButton onClick={() => generateSchedule(true)} disabled={generating}
              style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 500, backgroundColor: "var(--mantine-color-default-hover)", color: "var(--mantine-color-dimmed)", display: "flex", alignItems: "center", gap: 4 }}>
              {generating ? <Loader size={10} /> : <IconRefresh size={12} />}
              {generating ? "Generating..." : "Regenerate"}
            </UnstyledButton>
          </>
        }
      />

      {/* Schedule header — date + condensed task list */}
      {items.length > 0 && (() => {
        const pending = items.filter(i => i.status !== "done");
        const done = items.filter(i => i.status === "done");
        const totalMins = pending.reduce((s, i) => s + i.estimatedMinutes, 0);
        const targetDate = isNextDay ? new Date(Date.now() + 86400000) : new Date();
        const dateLabel = targetDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
        const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, backlog: 4 };
        const topTasks = [...pending]
          .sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2))
          .slice(0, 5);

        return (
          <div style={{
            padding: "12px 20px",
            borderBottom: "1px solid rgba(68, 73, 85, 0.2)",
            flexShrink: 0,
          }}>
            <Group justify="space-between" mb={8}>
              <div>
                <Text size="sm" fw={700}>{isNextDay ? "Tomorrow" : "Today"} — {dateLabel}</Text>
                <Text size="xs" c="dimmed">{pending.length} tasks remaining · {Math.round(totalMins / 60 * 10) / 10}h estimated{done.length > 0 ? ` · ${done.length} done` : ""}</Text>
              </div>
            </Group>
            <Group gap={6} wrap="wrap">
              {topTasks.map(t => (
                <Badge
                  key={t.id}
                  size="sm"
                  variant="light"
                  color={t.priority === "critical" ? "red" : t.priority === "high" ? "yellow" : "blue"}
                  style={{ cursor: "pointer", maxWidth: 200 }}
                  onClick={() => setSelectedId(t.id)}
                >
                  {t.title.length > 30 ? t.title.slice(0, 30) + "..." : t.title}
                </Badge>
              ))}
              {pending.length > 5 && (
                <Text size="xs" c="dimmed">+{pending.length - 5} more</Text>
              )}
            </Group>
          </div>
        );
      })()}

      {/* Stale schedule banner — shown when schedule was generated on a previous day */}
      {isStaleSchedule && (
        <div style={{
          padding: "8px 20px",
          backgroundColor: "rgba(255, 170, 51, 0.1)",
          borderBottom: "1px solid rgba(255, 170, 51, 0.2)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <Text size="xs" c="yellow.4">
            Schedule is from yesterday — regenerate?
          </Text>
          <UnstyledButton
            onClick={() => generateSchedule(true)}
            disabled={generating}
            style={{
              padding: "2px 10px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 600,
              backgroundColor: "var(--mantine-color-yellow-9)", color: "var(--mantine-color-yellow-2)",
            }}
          >
            {generating ? "Regenerating..." : "Regenerate"}
          </UnstyledButton>
        </div>
      )}

      {/* Schedule body — sidebar fixed, calendar scrolls */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Scrollable calendar area */}
        <div ref={scrollContainerRef} style={{ flex: 1, overflow: "auto", display: "flex" }}>
        {/* Time gutter */}
        <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid rgba(68, 73, 85, 0.2)", paddingTop: 16, paddingBottom: 40, minHeight: "100%" }}>
          {hours.map(hour => (
            <div key={hour} style={{ height: HOUR_HEIGHT, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 2 }}>
              <Text size="xs" c="dimmed" style={{ fontSize: "0.65rem" }}>
                {hour.toString().padStart(2, "0")}:00
              </Text>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div style={{ flex: 1, position: "relative", minHeight: totalHeight + 56, paddingTop: 16, paddingBottom: 40 }}>
          {/* Hour grid lines */}
          {hours.map(hour => (
            <div key={hour} style={{ position: "absolute", top: 16 + (hour - startHour) * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT }}>
              <div style={{ borderTop: "1px solid rgba(68, 73, 85, 0.12)" }} />
            </div>
          ))}

          {/* Current time indicator */}
          {nowInRange && (
            <div style={{
              position: "absolute", top: 16 + nowOffset, left: 0, right: 0, zIndex: 10,
              display: "flex", alignItems: "center",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--mantine-color-red-filled)", marginLeft: -4 }} />
              <div style={{ flex: 1, height: 2, backgroundColor: "var(--mantine-color-red-filled)" }} />
            </div>
          )}

          {/* Schedule items — absolute positioned on timeline, side-by-side for overlaps */}
          {(() => {
            // Detect overlapping items and assign columns
            const layout: Array<{ item: ScheduleItem; col: number; totalCols: number }> = [];
            const active: Array<{ endMin: number; col: number }> = [];

            for (const item of [...items].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))) {
              const startMin = timeToMinutes(item.startTime);
              // Remove items that ended before this one starts
              const stillActive = active.filter(a => a.endMin > startMin);
              active.length = 0;
              active.push(...stillActive);
              // Find first free column
              const usedCols = new Set(active.map(a => a.col));
              let col = 0;
              while (usedCols.has(col)) col++;
              const endMin = timeToMinutes(item.endTime);
              active.push({ endMin, col });
              layout.push({ item, col, totalCols: 0 }); // totalCols computed in second pass
            }
            // Second pass: compute totalCols for each group
            for (let i = 0; i < layout.length; i++) {
              const startMin = timeToMinutes(layout[i].item.startTime);
              const endMin = timeToMinutes(layout[i].item.endTime);
              let maxCol = layout[i].col;
              for (let j = 0; j < layout.length; j++) {
                const oStart = timeToMinutes(layout[j].item.startTime);
                const oEnd = timeToMinutes(layout[j].item.endTime);
                if (oStart < endMin && oEnd > startMin) {
                  maxCol = Math.max(maxCol, layout[j].col);
                }
              }
              layout[i].totalCols = maxCol + 1;
            }

            return layout.map(({ item, col, totalCols }) => {
            const itemStartMinutes = timeToMinutes(item.startTime) - startHour * 60;
            const baseHeight = (item.estimatedMinutes / 60) * HOUR_HEIGHT;
            const cardHeight = Math.max(baseHeight - 2, MIN_CARD_HEIGHT);
            const topOffset = (itemStartMinutes / 60) * HOUR_HEIGHT;
            const color = priorityColors[item.priority] ?? "var(--mantine-color-blue-filled)";
            const bgTint = priorityBgTints[item.priority] ?? "transparent";
            const isDone = item.status === "done";
            const isDragging = draggingId === item.id;
            const isDragOver = dragOverId === item.id;
            const isUrgent = item.priority === "critical";

            // Side-by-side layout
            const colWidth = 100 / totalCols;
            const leftPct = col * colWidth;

            return (
              <div
                key={item.id}
                draggable
                onMouseDown={() => { wasDragging.current = false; }}
                onDragStart={(e) => handleDragStart(e, item.id)}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDrop={(e) => handleDrop(e, item.id)}
                onDragEnd={handleDragEnd}
                onClick={() => {
                  if (wasDragging.current) { wasDragging.current = false; return; }
                  setSelectedId(item.id === selectedId ? null : item.id);
                }}
                style={{
                  position: "absolute",
                  top: 16 + topOffset + 1,
                  left: `calc(${leftPct}% + 4px)`,
                  width: `calc(${colWidth}% - 8px)`,
                  minHeight: cardHeight,
                  height: cardHeight,
                  borderRadius: 6,
                  padding: "6px 10px",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: cardHeight <= 50 ? "center" : "flex-start",
                  zIndex: isDragOver ? 15 : 1,
                  background: isDone
                    ? "rgba(74, 125, 255, 0.06)"
                    : `linear-gradient(135deg, ${bgTint}, rgba(16, 21, 32, 0.65))`,
                  border: isDragOver
                    ? "1px solid var(--mantine-color-blue-5)"
                    : `1px solid rgba(68, 73, 85, 0.2)`,
                  borderLeft: `${isUrgent && !isDone ? 4 : 3}px solid ${isDone ? "var(--mantine-color-dimmed)" : color}`,
                  opacity: isDone ? 0.45 : isDragging ? 0.4 : 1,
                  cursor: "grab",
                  transition: "opacity 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
                  boxShadow: isUrgent && !isDone
                    ? `0 0 8px ${color}22`
                    : isDragOver
                      ? "0 0 0 1px var(--mantine-color-blue-5)"
                      : "none",
                  userSelect: "none",
                }}
              >
                {/* Title row — always visible */}
                <Group justify="space-between" gap={4} wrap="nowrap">
                  <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <IconGripVertical size={10} color="var(--mantine-color-dimmed)" style={{ opacity: 0.3, flexShrink: 0 }} />
                    {isUrgent && !isDone && (
                      <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: color, flexShrink: 0, boxShadow: `0 0 4px ${color}` }} />
                    )}
                    <Text size="xs" fw={600} truncate style={{ textDecoration: isDone ? "line-through" : undefined, fontSize: "0.7rem" }}>
                      {item.title}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" style={{ fontSize: "0.55rem", flexShrink: 0 }}>
                    {item.startTime}–{item.endTime}
                  </Text>
                </Group>
                {/* Extra content — only if card is tall enough (>50px = 30+ min tasks) */}
                {cardHeight > 50 && (
                  <>
                    {item.actionNeeded && (
                      <Text size="xs" c="blue.4" lineClamp={1} mt={2} style={{ fontSize: "0.6rem" }}>
                        {item.actionNeeded}
                      </Text>
                    )}
                    {cardHeight > 80 && item.summary && (
                      <Text size="xs" c="dimmed" lineClamp={2} mt={2} style={{ fontSize: "0.58rem" }}>
                        {item.summary}
                      </Text>
                    )}
                  </>
                )}
              </div>
            );
          });
          })()}

          {/* Empty state */}
          {items.length === 0 && !generating && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
              <Stack align="center" gap={8}>
                <IconCalendarEvent size={32} color="var(--mantine-color-dimmed)" style={{ opacity: 0.4 }} />
                <Text size="sm" c="dimmed">No tasks scheduled. Fetch notifications first.</Text>
              </Stack>
            </div>
          )}
        </div>
        </div>{/* end scrollable calendar area */}

        {/* Summary sidebar — FIXED, doesn't scroll with calendar */}
        {!focusMode && (
          <div style={{
            width: 220, flexShrink: 0,
            borderLeft: "1px solid rgba(68, 73, 85, 0.2)",
            padding: 16,
            overflowY: "auto",
          }}>
            <Text size="xs" fw={700} mb={12}>What's Left</Text>

            <Stack gap={8}>
              <div>
                <Text size="xs" c="dimmed">Tasks</Text>
                <Text size="sm" fw={600}>{items.filter(i => i.status !== "done").length} remaining</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Completed</Text>
                <Text size="sm" fw={600} c="green">{items.filter(i => i.status === "done").length} / {items.length}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Estimated work</Text>
                <Text size="sm" fw={600}>{Math.round(items.filter(i => i.status !== "done").reduce((s, i) => s + i.estimatedMinutes, 0) / 60 * 10) / 10}h</Text>
              </div>
            </Stack>

            {/* Capacity progress bar */}
            <Text size="xs" fw={700} mt={20} mb={6}>Day Capacity</Text>
            <div>
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem" }}>
                  {Math.round(totalWorkMinutes / 60 * 10) / 10}h / {Math.round(availableMinutes / 60 * 10) / 10}h
                </Text>
                <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem" }}>
                  {capacityPct}%
                </Text>
              </Group>
              <Progress
                value={capacityPct}
                color={capacityPct > 90 ? "red" : capacityPct > 70 ? "yellow" : "blue"}
                size="sm"
                radius="xl"
              />
            </div>

            {/* Context links from all scheduled items */}
            {(() => {
              const allLinks: Array<{ label: string; url: string; source: string }> = [];
              for (const item of items) {
                if (item.url) allLinks.push({ label: item.title, url: item.url, source: item.source });
                if (item.links) for (const l of item.links) {
                  if (l.url && !allLinks.some(a => a.url === l.url)) allLinks.push({ label: l.label, url: l.url, source: item.source });
                }
              }
              if (allLinks.length === 0) return null;
              return (
                <>
                  <Text size="xs" fw={700} mt={20} mb={8}>Context</Text>
                  <Stack gap={6}>
                    {allLinks.slice(0, 15).map((link, i) => (
                      <UnstyledButton
                        key={i}
                        onClick={() => window.deck?.openExternal?.(link.url)}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 4,
                          backgroundColor: "rgba(74, 125, 255, 0.06)",
                          display: "block",
                        }}
                      >
                        <Text size="xs" c="blue.4" lineClamp={2} style={{ fontSize: "0.7rem", lineHeight: 1.4 }}>
                          {link.label}
                        </Text>
                      </UnstyledButton>
                    ))}
                  </Stack>
                </>
              );
            })()}

            <Text size="xs" fw={700} mt={20} mb={8}>Priority Breakdown</Text>
            <Stack gap={4}>
              {["critical", "high", "medium", "low", "backlog"].map(p => {
                const count = items.filter(i => i.priority === p).length;
                if (count === 0) return null;
                return (
                  <Group key={p} gap={6}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: priorityColors[p] }} />
                    <Text size="xs" c="dimmed" tt="capitalize">{p}</Text>
                    <Text size="xs" fw={500}>{count}</Text>
                  </Group>
                );
              })}
            </Stack>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedId && (() => {
        const item = items.find(i => i.id === selectedId);
        if (!item) return null;
        const color = priorityColors[item.priority] ?? "var(--mantine-color-blue-filled)";
        return (
          <>
            <div onClick={() => setSelectedId(null)} style={{ position: "fixed", inset: 0, top: 42, zIndex: 99, backgroundColor: "rgba(5, 8, 16, 0.4)", backdropFilter: "blur(2px)" }} />
            <div style={{
              position: "fixed", top: 42, right: 0, bottom: 0, width: 380, zIndex: 100,
              background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)",
              borderLeft: "1px solid var(--mantine-color-default-hover)",
              overflowY: "auto", padding: 20,
            }}>
              <Group justify="space-between" mb={12}>
                <Badge size="xs" variant="dot" color={color}>{item.priority}</Badge>
                <UnstyledButton onClick={() => setSelectedId(null)}>
                  <Text size="xs" c="dimmed">Close</Text>
                </UnstyledButton>
              </Group>
              <Text fw={600} size="sm" mb={8}>{item.title}</Text>
              <Group gap={8} mb={12}>
                <Badge size="xs" variant="light" color="gray">{taskTypeLabels[item.taskType] ?? item.taskType}</Badge>
                <Text size="xs" c="dimmed">{item.startTime} – {item.endTime} ({item.estimatedMinutes}min)</Text>
              </Group>
              {item.actionNeeded && (
                <div style={{ padding: "8px 12px", borderRadius: 6, backgroundColor: "var(--mantine-color-blue-light)", marginBottom: 12 }}>
                  <Text size="xs" c="blue.4">{item.actionNeeded}</Text>
                </div>
              )}
              {item.summary && (
                <>
                  <Text size="xs" fw={600} mb={4}>Summary</Text>
                  <Text size="xs" c="dimmed" style={{ lineHeight: 1.6 }}>{item.summary}</Text>
                </>
              )}

              {/* Context links */}
              {(item.links?.length || item.url) && (
                <>
                  <Text size="xs" fw={600} mt={16} mb={6}>Links</Text>
                  <Stack gap={4}>
                    {item.url && (
                      <UnstyledButton
                        onClick={() => window.deck?.openExternal?.(item.url!)}
                        style={{ padding: "6px 8px", borderRadius: 4, backgroundColor: "rgba(74, 125, 255, 0.06)" }}
                      >
                        <Text size="xs" c="blue.4" lineClamp={1}>{item.url}</Text>
                      </UnstyledButton>
                    )}
                    {item.links?.map((link, i) => (
                      <UnstyledButton
                        key={i}
                        onClick={() => window.deck?.openExternal?.(link.url)}
                        style={{ padding: "6px 8px", borderRadius: 4, backgroundColor: "rgba(74, 125, 255, 0.06)" }}
                      >
                        <Group gap={6}>
                          <Badge size="xs" variant="light" color="gray">{link.type}</Badge>
                          <Text size="xs" c="blue.4" lineClamp={1}>{link.label}</Text>
                        </Group>
                      </UnstyledButton>
                    ))}
                  </Stack>
                </>
              )}

              {/* Timeline — fetch from notification data */}
              <ScheduleTaskTimeline taskId={item.id} />

              <Group gap={8} mt={16}>
                <UnstyledButton
                  onClick={() => { markDone(item.id); setSelectedId(null); }}
                  style={{ padding: "6px 12px", borderRadius: 6, fontSize: "0.7rem", fontWeight: 600, backgroundColor: "var(--mantine-color-default-hover)", color: "var(--mantine-color-green-5)" }}
                >
                  Mark done
                </UnstyledButton>
              </Group>
            </div>
          </>
        );
      })()}
    </div>
  );
}
