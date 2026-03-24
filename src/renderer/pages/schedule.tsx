import { Badge, Group, Loader, Progress, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import {
  IconCalendarEvent, IconCircleCheck, IconRefresh, IconChevronRight,
  IconChevronDown, IconGripVertical, IconFocus2, IconSettings,
} from "@tabler/icons-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

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
}

const HOUR_HEIGHT = 60; // px per hour

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

const priorityColors: Record<string, string> = {
  urgent: "#ef4444",
  today: "#f59e0b",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#6b7280",
};

/** Subtle background tint per priority (very low opacity) */
const priorityBgTints: Record<string, string> = {
  urgent: "rgba(239, 68, 68, 0.08)",
  today: "rgba(245, 158, 11, 0.06)",
  high: "rgba(245, 158, 11, 0.06)",
  medium: "rgba(59, 130, 246, 0.04)",
  low: "transparent",
};

const taskTypeLabels: Record<string, string> = {
  implementation: "Code",
  investigation: "Research",
  review: "Review",
  meeting_prep: "Meeting",
  response: "Reply",
  planning: "Plan",
  follow_up: "Follow up",
};

/** Recalculate start/end times after reorder, keeping durations and 15min buffers */
function recalcTimes(items: ScheduleItem[], dayStartMinutes: number): ScheduleItem[] {
  let cursor = dayStartMinutes;
  return items.map(item => {
    const start = minutesToTime(cursor);
    const end = minutesToTime(cursor + item.estimatedMinutes);
    cursor += item.estimatedMinutes + 15;
    return { ...item, startTime: start, endTime: end };
  });
}

export function Schedule() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [workingHours] = useState({ start: "09:00", end: "18:00" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const wasDragging = useRef(false);

  // Load schedule from notifications
  const generateSchedule = useCallback(async () => {
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

      // Sort by priority (urgent > today > high > medium > low), then confidence
      const priorityOrder: Record<string, number> = { urgent: 0, today: 1, high: 1, medium: 2, low: 3 };
      const sorted = [...actionable].sort((a, b) => {
        const pa = priorityOrder[String(a.priority ?? "medium")] ?? 2;
        const pb = priorityOrder[String(b.priority ?? "medium")] ?? 2;
        if (pa !== pb) return pa - pb;
        return (Number(b.confidence ?? 0)) - (Number(a.confidence ?? 0));
      });

      // Build time blocks
      let currentMinutes = timeToMinutes(workingHours.start);
      const endMinutes = timeToMinutes(workingHours.end);
      const schedule: ScheduleItem[] = [];

      for (const n of sorted) {
        const est = estimateMinutes(n);
        if (currentMinutes + est > endMinutes) break; // Day is full

        schedule.push({
          id: String(n.id),
          title: String(n.title ?? ""),
          source: String(n.source ?? ""),
          taskType: String(n.taskType ?? ""),
          priority: String(n.priority ?? "medium"),
          confidence: Number(n.confidence ?? 0),
          estimatedMinutes: est,
          startTime: minutesToTime(currentMinutes),
          endTime: minutesToTime(currentMinutes + est),
          status: n.stage === "working" ? "active" : n.stage === "done" ? "done" : "pending",
          summary: String(n.summary ?? ""),
          actionNeeded: n.actionNeeded ? String(n.actionNeeded) : undefined,
        });

        currentMinutes += est + 15; // 15 min buffer between tasks
      }

      setItems(schedule);
    } catch {}
    setGenerating(false);
  }, [workingHours]);

  useEffect(() => { generateSchedule(); }, [generateSchedule]);

  // Time markers for the day
  const startHour = parseInt(workingHours.start.split(":")[0]);
  const endHour = parseInt(workingHours.end.split(":")[0]);
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  // Current time indicator
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const dayStartMinutes = timeToMinutes(workingHours.start);
  const dayEndMinutes = timeToMinutes(workingHours.end);
  const nowInRange = nowMinutes >= dayStartMinutes && nowMinutes <= dayEndMinutes;
  const nowOffset = nowInRange ? ((nowMinutes - dayStartMinutes) / 60) * HOUR_HEIGHT : -1;

  // Total day height
  const totalHeight = (endHour - startHour) * HOUR_HEIGHT;

  // Capacity calculations
  const totalWorkMinutes = items.reduce((sum, i) => sum + i.estimatedMinutes, 0);
  const availableMinutes = dayEndMinutes - dayStartMinutes;
  const capacityPct = availableMinutes > 0 ? Math.min(100, Math.round((totalWorkMinutes / availableMinutes) * 100)) : 0;

  const markDone = (id: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, status: "done" } : item));
    window.deck?.updateNotificationById?.(id, { stage: "done" });
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
      return recalcTimes(next, dayStartMinutes);
    });

    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  // Build a set of hours that have scheduled items
  const occupiedHours = new Set<number>();
  for (const item of items) {
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime);
    for (let h = Math.floor(start / 60); h <= Math.floor((end - 1) / 60); h++) {
      occupiedHours.add(h);
    }
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", backgroundColor: "var(--mantine-color-body)" }}>
      {/* Header — matches notifications.tsx */}
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
            onClick={() => navigate("/notifications")}
            style={{ padding: "4px 14px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 500, color: "var(--mantine-color-dimmed)" }}
          >
            Inbox
          </UnstyledButton>
          <UnstyledButton
            style={{ padding: "4px 14px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 500, backgroundColor: "var(--mantine-color-dark-6)", color: "var(--mantine-color-text)" }}
          >
            Schedule
          </UnstyledButton>
        </Group>
        <Group gap={8} style={{ WebkitAppRegion: "no-drag", marginLeft: "auto" }}>
          <Text size="xs" c="dimmed">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </Text>
          <Tooltip label={focusMode ? "Exit focus mode" : "Focus mode — hide sidebar"} position="bottom" withArrow>
            <UnstyledButton
              onClick={() => setFocusMode(f => !f)}
              style={{
                padding: "2px 8px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 500,
                backgroundColor: focusMode ? "var(--mantine-color-blue-9)" : "var(--mantine-color-dark-6)",
                color: focusMode ? "var(--mantine-color-blue-4)" : "var(--mantine-color-dimmed)",
                display: "flex", alignItems: "center", gap: 4,
                transition: "background-color 0.15s ease, color 0.15s ease",
              }}
            >
              <IconFocus2 size={12} />
              Focus
            </UnstyledButton>
          </Tooltip>
          <UnstyledButton onClick={generateSchedule} disabled={generating}
            style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 500, backgroundColor: "var(--mantine-color-dark-6)", color: "var(--mantine-color-dimmed)", display: "flex", alignItems: "center", gap: 4 }}>
            {generating ? <Loader size={10} /> : <IconRefresh size={12} />}
            {generating ? "Generating..." : "Regenerate"}
          </UnstyledButton>
          <Tooltip label="Settings" position="bottom" withArrow>
            <UnstyledButton
              onClick={() => navigate("/settings")}
              style={{
                padding: "4px",
                borderRadius: 4,
                color: "var(--mantine-color-dimmed)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <IconSettings size={16} />
            </UnstyledButton>
          </Tooltip>
        </Group>
      </div>

      {/* Schedule body */}
      <div style={{ flex: 1, overflow: "auto", display: "flex" }}>
        {/* Time gutter */}
        <div style={{ width: 60, flexShrink: 0, borderRight: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)" }}>
          {hours.map(hour => (
            <div key={hour} style={{ height: HOUR_HEIGHT, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 2 }}>
              <Text size="xs" c="dimmed" style={{ fontSize: "0.65rem" }}>
                {hour.toString().padStart(2, "0")}:00
              </Text>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div style={{ flex: 1, position: "relative", minHeight: totalHeight }}>
          {/* Hour grid lines + free-time labels */}
          {hours.map(hour => {
            const isFree = items.length > 0 && !occupiedHours.has(hour) && hour < endHour;
            return (
              <div key={hour} style={{ position: "absolute", top: (hour - startHour) * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT }}>
                <div style={{ borderTop: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 20%, transparent)" }} />
                {isFree && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center", height: HOUR_HEIGHT - 1,
                    opacity: 0.35,
                  }}>
                    <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem", fontStyle: "italic", letterSpacing: "0.02em" }}>
                      Free time
                    </Text>
                  </div>
                )}
              </div>
            );
          })}

          {/* Current time indicator */}
          {nowInRange && (
            <div style={{
              position: "absolute", top: nowOffset, left: 0, right: 0, zIndex: 10,
              display: "flex", alignItems: "center",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#ef4444", marginLeft: -4 }} />
              <div style={{ flex: 1, height: 2, backgroundColor: "#ef4444" }} />
            </div>
          )}

          {/* Schedule items */}
          {items.map(item => {
            const itemStart = timeToMinutes(item.startTime) - dayStartMinutes;
            const baseHeight = (item.estimatedMinutes / 60) * HOUR_HEIGHT;
            const topOffset = (itemStart / 60) * HOUR_HEIGHT;
            const color = priorityColors[item.priority] ?? "#3b82f6";
            const bgTint = priorityBgTints[item.priority] ?? "transparent";
            const isDone = item.status === "done";
            const isExpanded = expandedId === item.id;
            const isDragging = draggingId === item.id;
            const isDragOver = dragOverId === item.id;
            const isUrgent = item.priority === "urgent";

            // When expanded, grow to fit content; otherwise use natural height
            const collapsedHeight = Math.max(baseHeight - 4, 28);

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
                  setExpandedId(prev => prev === item.id ? null : item.id);
                }}
                style={{
                  position: "absolute",
                  top: topOffset + 2,
                  left: 8,
                  right: 8,
                  minHeight: collapsedHeight,
                  height: isExpanded ? "auto" : collapsedHeight,
                  zIndex: isExpanded ? 20 : isDragOver ? 15 : 1,
                  borderRadius: 6,
                  padding: "6px 10px",
                  background: isDone
                    ? "color-mix(in srgb, var(--mantine-color-dark-6) 50%, transparent)"
                    : `linear-gradient(135deg, ${bgTint}, var(--mantine-color-dark-7))`,
                  border: isDragOver
                    ? "1px solid var(--mantine-color-blue-5)"
                    : `1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)`,
                  borderLeft: `${isUrgent && !isDone ? 4 : 3}px solid ${isDone ? "var(--mantine-color-dimmed)" : color}`,
                  opacity: isDone ? 0.45 : isDragging ? 0.4 : 1,
                  cursor: "grab",
                  overflow: "hidden",
                  transition: "opacity 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
                  boxShadow: isUrgent && !isDone
                    ? `0 0 8px ${color}22`
                    : isDragOver
                      ? "0 0 0 1px var(--mantine-color-blue-5)"
                      : "none",
                  userSelect: "none",
                }}
              >
                <Group justify="space-between" gap={4} wrap="nowrap">
                  <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <IconGripVertical size={12} color="var(--mantine-color-dimmed)" style={{ opacity: 0.4, flexShrink: 0, cursor: "grab" }} />
                    {isUrgent && !isDone && (
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%", backgroundColor: color, flexShrink: 0,
                        boxShadow: `0 0 4px ${color}`,
                      }} />
                    )}
                    <Text size="xs" fw={600} truncate style={{ textDecoration: isDone ? "line-through" : undefined }}>
                      {item.title}
                    </Text>
                  </Group>
                  <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Badge size="xs" variant="light" color="gray" style={{ fontSize: "0.55rem" }}>
                      {taskTypeLabels[item.taskType] ?? item.taskType}
                    </Badge>
                    <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem" }}>
                      {item.startTime}–{item.endTime}
                    </Text>
                    {isExpanded ? (
                      <IconChevronDown size={12} color="var(--mantine-color-dimmed)" style={{ opacity: 0.6 }} />
                    ) : (
                      <IconChevronRight size={12} color="var(--mantine-color-dimmed)" style={{ opacity: 0.4 }} />
                    )}
                    {!isDone && (
                      <UnstyledButton onClick={(e) => { e.stopPropagation(); markDone(item.id); }}
                        style={{ color: "var(--mantine-color-dimmed)", opacity: 0.5 }}>
                        <IconCircleCheck size={14} />
                      </UnstyledButton>
                    )}
                  </Group>
                </Group>

                {/* Action needed — always show if present on non-tiny blocks */}
                {!isExpanded && baseHeight > 40 && item.actionNeeded && (
                  <Text size="xs" c="blue.4" lineClamp={1} mt={2} style={{ fontSize: "0.65rem" }}>
                    {item.actionNeeded}
                  </Text>
                )}

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)" }}>
                    {item.actionNeeded && (
                      <Text size="xs" c="blue.4" mb={4} style={{ fontSize: "0.65rem" }}>
                        {item.actionNeeded}
                      </Text>
                    )}
                    {item.summary && (
                      <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem", lineHeight: 1.5 }}>
                        {item.summary}
                      </Text>
                    )}
                    {!item.summary && !item.actionNeeded && (
                      <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem", fontStyle: "italic" }}>
                        No additional details.
                      </Text>
                    )}
                    <Group gap={8} mt={6}>
                      <Badge size="xs" variant="dot" color={color} style={{ fontSize: "0.55rem" }}>
                        {item.priority}
                      </Badge>
                      <Text size="xs" c="dimmed" style={{ fontSize: "0.55rem" }}>
                        {item.estimatedMinutes}min estimated
                      </Text>
                    </Group>
                  </div>
                )}

                {/* Summary peek — only when collapsed and tall enough */}
                {!isExpanded && baseHeight > 60 && item.summary && (
                  <Text size="xs" c="dimmed" lineClamp={2} mt={2} style={{ fontSize: "0.6rem" }}>
                    {item.summary}
                  </Text>
                )}
              </div>
            );
          })}

          {/* Empty state */}
          {items.length === 0 && !generating && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 200 }}>
              <Stack align="center" gap={8}>
                <IconCalendarEvent size={32} color="var(--mantine-color-dimmed)" style={{ opacity: 0.4 }} />
                <Text size="sm" c="dimmed">No tasks scheduled. Fetch notifications first.</Text>
              </Stack>
            </div>
          )}
        </div>

        {/* Summary sidebar — hidden in focus mode */}
        {!focusMode && (
          <div style={{
            width: 220, flexShrink: 0,
            borderLeft: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
            padding: 16,
            transition: "width 0.2s ease",
          }}>
            <Text size="xs" fw={700} mb={12}>Today's Summary</Text>

            <Stack gap={8}>
              <div>
                <Text size="xs" c="dimmed">Tasks</Text>
                <Text size="sm" fw={600}>{items.length} scheduled</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Completed</Text>
                <Text size="sm" fw={600} c="green">{items.filter(i => i.status === "done").length} / {items.length}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Total work time</Text>
                <Text size="sm" fw={600}>{Math.round(totalWorkMinutes / 60 * 10) / 10}h</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Free time</Text>
                <Text size="sm" fw={600}>
                  {Math.round((availableMinutes - items.reduce((sum, i) => sum + i.estimatedMinutes + 15, 0)) / 60 * 10) / 10}h
                </Text>
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

            <Text size="xs" fw={700} mt={20} mb={8}>Priority Breakdown</Text>
            <Stack gap={4}>
              {["urgent", "today", "medium", "low"].map(p => {
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
    </div>
  );
}
