import { Badge, Group, Loader, Skeleton, Stack, Text, Tooltip } from "@mantine/core";
import {
  IconMessageCircle, IconTarget, IconCalendarEvent, IconTrendingUp,
  IconArrowUp, IconArrowDown, IconMinus, IconAlertTriangle,
} from "@tabler/icons-react";
import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "../components/AppHeader";
import type {
  ReflectSignals, ManagerTake, WeeklySnapshot, ReflectData,
} from "../../shared/reflect-types";

/* ---------- Rating badge color map ---------- */

const RATING_COLORS: Record<string, string> = {
  "Strong week": "green",
  "Good progress": "blue",
  "Steady": "gray",
  "Needs attention": "yellow",
  "Falling behind": "red",
};

/* ---------- Glass card wrapper ---------- */

const glassStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 10,
  background: "var(--aegen-glass-bg)",
  backdropFilter: "var(--aegen-glass-blur)",
  border: "1px solid var(--aegen-glass-border)",
};

/* ---------- Trend arrow ---------- */

function TrendArrow({ trend, good }: { trend: "up" | "down" | "flat"; good: boolean }) {
  if (trend === "flat") return <IconMinus size={14} color="var(--aegen-dust-gray)" />;
  const color = (trend === "up" && good) || (trend === "down" && !good)
    ? "var(--mantine-color-green-5)"
    : "var(--mantine-color-red-5)";
  return trend === "up"
    ? <IconArrowUp size={14} color={color} />
    : <IconArrowDown size={14} color={color} />;
}

/* ---------- Signal Card ---------- */

interface SignalCardProps {
  icon: React.FC<{ size?: number }>;
  label: string;
  value: string;
  subtext: string;
  trend: "up" | "down" | "flat";
  trendGood: boolean;
  callout?: string;
}

function SignalCard({ icon: Icon, label, value, subtext, trend, trendGood, callout }: SignalCardProps) {
  return (
    <div style={glassStyle}>
      <Group gap={6} mb={8}>
        <Icon size={14} />
        <Text size="xs" fw={600} c="dimmed" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {label}
        </Text>
      </Group>
      <Group gap={6} align="baseline">
        <Text size="xl" fw={700}>{value}</Text>
        <TrendArrow trend={trend} good={trendGood} />
      </Group>
      <Text size="xs" c="dimmed">{subtext}</Text>
      {callout && (
        <Group gap={4} mt={6} wrap="nowrap" align="flex-start">
          <IconAlertTriangle size={12} color="var(--mantine-color-yellow-5)" style={{ marginTop: 2, flexShrink: 0 }} />
          <Text size="xs" c="yellow.5">{callout}</Text>
        </Group>
      )}
    </div>
  );
}

/* ---------- Weekly Bars ---------- */

function WeeklyBars({ weeks }: { weeks: WeeklySnapshot[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.completed));
  return (
    <div style={glassStyle}>
      <Text size="xs" fw={600} c="dimmed" mb={10} style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Weekly throughput
      </Text>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 120 }}>
        {weeks.map((w, i) => {
          const pct = Math.max(4, (w.completed / max) * 100);
          const isLast = i === weeks.length - 1;
          return (
            <Tooltip key={w.weekStartISO} label={`${w.completed} completed`} position="top" withArrow>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div style={{
                  width: "100%",
                  maxWidth: 32,
                  height: `${pct}%`,
                  borderRadius: 4,
                  background: isLast ? "var(--aegen-cosmic-blue)" : "var(--aegen-dust-gray)",
                  transition: "height 0.3s ease",
                }} />
                <Text size="xs" c="dimmed" mt={4} ta="center">{w.weekLabel}</Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Cycle Time by Type ---------- */

function CycleTimeRows({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div style={glassStyle}>
      <Text size="xs" fw={600} c="dimmed" mb={10} style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Avg cycle time by type
      </Text>
      <Stack gap={6}>
        {entries.map(([type, hours]) => (
          <Group key={type} gap={8} wrap="nowrap">
            <Text size="xs" c="dimmed" style={{ width: 100, flexShrink: 0 }}>{type}</Text>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--aegen-glass-border)" }}>
              <div style={{
                height: "100%",
                width: `${(hours / max) * 100}%`,
                borderRadius: 4,
                background: "var(--aegen-cosmic-blue)",
                transition: "width 0.3s ease",
              }} />
            </div>
            <Text size="xs" c="dimmed" style={{ width: 40, textAlign: "right", flexShrink: 0 }}>{hours}h</Text>
          </Group>
        ))}
      </Stack>
    </div>
  );
}

/* ---------- Helper: compute trend direction ---------- */

function deltaTrend(delta: number): "up" | "down" | "flat" {
  if (delta > 5) return "up";
  if (delta < -5) return "down";
  return "flat";
}

/* ---------- Main page ---------- */

export default function ReflectPage() {
  const [signals, setSignals] = useState<ReflectSignals | null>(null);
  const [managerTake, setManagerTake] = useState<ManagerTake | null>(null);
  const [history, setHistory] = useState<WeeklySnapshot[]>([]);
  const [loadingTake, setLoadingTake] = useState(true);

  useEffect(() => {
    // Phase 1: fast signals
    window.deck?.getReflectSignals?.().then((s: ReflectSignals) => {
      if (s) setSignals(s);
    }).catch(() => {});

    // Phase 2: full data with LLM manager take
    window.deck?.getReflectData?.().then((d: ReflectData) => {
      if (d) {
        setSignals(d.signals);
        setManagerTake(d.managerTake);
        setHistory(d.history);
      }
      setLoadingTake(false);
    }).catch(() => setLoadingTake(false));
  }, []);

  const noData = !loadingTake && !signals;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--aegen-void)" }}>
      <AppHeader />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", paddingTop: 8 }}>
        {/* Empty state */}
        {noData && (
          <Stack align="center" py="xl" gap="sm">
            <IconTrendingUp size={32} color="var(--aegen-dust-gray)" />
            <Text size="sm" c="dimmed">No data yet.</Text>
            <Text size="xs" c="dimmed">Data will appear after your first poll cycle.</Text>
          </Stack>
        )}

        {/* 1. Manager's Take */}
        {signals && (
          loadingTake ? (
            <Skeleton height={120} radius="md" mb={12} />
          ) : managerTake ? (
            <div style={{ ...glassStyle, marginBottom: 12, position: "relative" }}>
              <Badge
                size="sm"
                variant="light"
                color={RATING_COLORS[managerTake.rating] ?? "gray"}
                style={{ position: "absolute", top: 14, right: 16 }}
              >
                {managerTake.rating}
              </Badge>
              <Text size="xs" fw={600} c="dimmed" mb={8} style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Manager's Take
              </Text>
              <Text size="sm" mb={managerTake.callouts.length > 0 ? 10 : 0}>
                {managerTake.summary}
              </Text>
              {managerTake.callouts.map((c, i) => (
                <Group key={i} gap={6} mb={4} wrap="nowrap" align="flex-start">
                  {c.toLowerCase().includes("risk") || c.toLowerCase().includes("attention") || c.toLowerCase().includes("behind")
                    ? <IconAlertTriangle size={12} color="var(--mantine-color-yellow-5)" style={{ marginTop: 3, flexShrink: 0 }} />
                    : <IconTrendingUp size={12} color="var(--mantine-color-blue-5)" style={{ marginTop: 3, flexShrink: 0 }} />
                  }
                  <Text size="xs" c="dimmed">{c}</Text>
                </Group>
              ))}
            </div>
          ) : null
        )}

        {/* 2. Signal Cards */}
        {signals && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 12,
          }}>
            <SignalCard
              icon={IconMessageCircle}
              label="Response Cadence"
              value={`${signals.responseCadence.medianReplyMinutes}m`}
              subtext="median reply"
              trend={signals.responseCadence.medianReplyMinutes < 30 ? "up" : signals.responseCadence.medianReplyMinutes > 120 ? "down" : "flat"}
              trendGood={signals.responseCadence.medianReplyMinutes < 60}
              callout={signals.responseCadence.unansweredOver24h > 0
                ? `${signals.responseCadence.unansweredOver24h} threads unanswered >24h`
                : undefined}
            />
            <SignalCard
              icon={IconTarget}
              label="Focus Score"
              value={`${signals.focus.score}/100`}
              subtext={`${signals.focus.avgConcurrentWip} avg WIP`}
              trend={signals.focus.score >= 70 ? "up" : signals.focus.score < 50 ? "down" : "flat"}
              trendGood={signals.focus.score >= 50}
              callout={signals.focus.score < 50 ? "High context switching" : undefined}
            />
            <SignalCard
              icon={IconCalendarEvent}
              label="Meeting Load"
              value={`${signals.meetingLoad.meetingHoursThisWeek}h`}
              subtext={`${signals.meetingLoad.meetingCount} meetings`}
              trend={signals.meetingLoad.meetingFocusRatio > 0.3 ? "down" : signals.meetingLoad.meetingFocusRatio < 0.15 ? "up" : "flat"}
              trendGood={signals.meetingLoad.meetingFocusRatio <= 0.3}
              callout={signals.meetingLoad.meetingFocusRatio > 0.3
                ? `${signals.meetingLoad.longestDeepWorkBlock}m longest deep work block`
                : undefined}
            />
            <SignalCard
              icon={IconTrendingUp}
              label="Throughput"
              value={`${signals.throughput.completedThisWeek}`}
              subtext="completed this week"
              trend={deltaTrend(signals.throughput.weekOverWeekDelta)}
              trendGood={signals.throughput.weekOverWeekDelta >= 0}
            />
          </div>
        )}

        {/* 3. Weekly Trend */}
        {history.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <WeeklyBars weeks={history} />
          </div>
        )}

        {/* 4. Cycle Time by Type */}
        {signals && Object.keys(signals.throughput.cycleTimeByType).length > 0 && (
          <CycleTimeRows data={signals.throughput.cycleTimeByType} />
        )}
      </div>
    </div>
  );
}
