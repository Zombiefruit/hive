import { Badge, Group, Skeleton, Stack, Text, Loader } from "@mantine/core";
import { IconTrendingUp, IconAlertTriangle, IconCheck, IconTarget, IconFocus2, IconClock, IconCalendarEvent, IconArrowUp, IconArrowDown } from "@tabler/icons-react";
import { useState, useEffect, useRef } from "react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid } from "recharts";
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

/* ---------- Callout categorizer ---------- */

type CalloutCategory = "win" | "risk" | "focus";

function categorizeCallout(text: string): CalloutCategory {
  const lower = text.toLowerCase();
  if (lower.includes("risk") || lower.includes("attention") || lower.includes("behind") ||
      lower.includes("concern") || lower.includes("slow") || lower.includes("blocked") ||
      lower.includes("delay") || lower.includes("miss") || lower.includes("overdue")) {
    return "risk";
  }
  if (lower.includes("focus") || lower.includes("priorit") || lower.includes("next") ||
      lower.includes("should") || lower.includes("consider") || lower.includes("recommend") ||
      lower.includes("action") || lower.includes("plan")) {
    return "focus";
  }
  return "win";
}

const CATEGORY_CONFIG: Record<CalloutCategory, { label: string; icon: React.FC<{ size?: number; style?: React.CSSProperties }>; color: string }> = {
  win: { label: "Wins", icon: IconCheck, color: "var(--mantine-color-green-5)" },
  risk: { label: "Risks", icon: IconAlertTriangle, color: "var(--mantine-color-yellow-5)" },
  focus: { label: "Focus Areas", icon: IconTarget, color: "var(--mantine-color-blue-5)" },
};

/* ---------- Signal gauge card ---------- */

function SignalGauge({ label, value, unit, icon: Icon, color, subtext }: {
  label: string; value: string | number; unit?: string;
  icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
  color: string; subtext?: string;
}) {
  return (
    <div style={{
      ...glassStyle, flex: "1 1 0", minWidth: 130, textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    }}>
      <Icon size={18} style={{ color, opacity: 0.8 }} />
      <Text size="xs" fw={600} c="dimmed" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </Text>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <Text size="xl" fw={700} style={{ color, lineHeight: 1 }}>{value}</Text>
        {unit && <Text size="xs" c="dimmed">{unit}</Text>}
      </div>
      {subtext && <Text size="10px" c="dimmed">{subtext}</Text>}
    </div>
  );
}

/* ---------- Trend chart tooltip ---------- */

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      padding: "8px 12px", borderRadius: 6, fontSize: 11,
      background: "rgba(20,20,30,0.92)", border: "1px solid rgba(255,255,255,0.1)",
      color: "#e0e0e0",
    }}>
      <Text size="xs" fw={600} mb={4}>{label}</Text>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
          <span>{p.name}: <strong>{typeof p.value === "number" ? (Number.isInteger(p.value) ? p.value : p.value.toFixed(1)) : p.value}</strong></span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Session-level cache so data persists across tab switches ---------- */

const CACHE_KEY = "relay-reflect-cache";

function loadCache(): { signals: ReflectSignals | null; take: ManagerTake | null; history: WeeklySnapshot[] } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveCache(signals: ReflectSignals, take: ManagerTake | null, history: WeeklySnapshot[]): void {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ signals, take, history })); } catch {}
}

/* ---------- Main page ---------- */

export default function ReflectPage() {
  const cacheRef = useRef(loadCache());
  const cached = cacheRef.current;

  const [signals, setSignals] = useState<ReflectSignals | null>(cached?.signals ?? null);
  const [managerTake, setManagerTake] = useState<ManagerTake | null>(cached?.take ?? null);
  const [history, setHistory] = useState<WeeklySnapshot[]>(cached?.history ?? []);
  const [loadingTake, setLoadingTake] = useState(!cached);

  useEffect(() => {
    if (cacheRef.current) return;

    let settled = false;
    const done = () => { if (!settled) { settled = true; setLoadingTake(false); } };

    const safetyTimer = setTimeout(done, 20000);

    window.deck?.getReflectSignals?.().then((s: ReflectSignals) => {
      if (s) setSignals(s);
    }).catch(() => {});

    window.deck?.getReflectData?.().then((d: ReflectData | null) => {
      if (d) {
        setSignals(d.signals);
        setManagerTake(d.managerTake);
        setHistory(d.history);
        saveCache(d.signals, d.managerTake, d.history);
      }
      done();
    }).catch(done);

    return () => clearTimeout(safetyTimer);
  }, []);

  const noData = !loadingTake && !signals;

  // Categorize callouts into wins, risks, focus areas
  const categorized = managerTake?.callouts.reduce<Record<CalloutCategory, string[]>>(
    (acc, c) => { acc[categorizeCallout(c)].push(c); return acc; },
    { win: [], risk: [], focus: [] },
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--aegen-void)" }}>
      {/* No header bar — loading state shown inline via skeleton */}

      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        {/* Empty state */}
        {noData && (
          <Stack align="center" py="xl" gap="sm">
            <IconTrendingUp size={32} color="var(--aegen-dust-gray)" />
            <Text size="sm" c="dimmed">No data yet.</Text>
            <Text size="xs" c="dimmed">Data will appear after your first poll cycle.</Text>
          </Stack>
        )}

        {/* Loading state */}
        {loadingTake && !signals && (
          <Stack align="center" py="xl" gap="sm">
            <Loader size={24} />
            <Text size="sm" c="dimmed">Analyzing your week...</Text>
          </Stack>
        )}

        {/* Signal gauges — key metrics at a glance */}
        {signals && (
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <SignalGauge
              label="Focus" value={signals.focus.score} unit="/100"
              icon={IconFocus2} color={signals.focus.score >= 70 ? "#40c057" : signals.focus.score >= 40 ? "#fab005" : "#fa5252"}
              subtext={`${signals.focus.avgConcurrentWip.toFixed(1)} avg WIP`}
            />
            <SignalGauge
              label="Throughput" value={signals.throughput.completedThisWeek}
              icon={signals.throughput.weekOverWeekDelta >= 0 ? IconArrowUp : IconArrowDown}
              color={signals.throughput.weekOverWeekDelta >= 0 ? "#40c057" : "#fa5252"}
              unit="done"
              subtext={`${signals.throughput.weekOverWeekDelta >= 0 ? "+" : ""}${signals.throughput.weekOverWeekDelta.toFixed(0)}% vs last wk`}
            />
            <SignalGauge
              label="Meetings" value={signals.meetingLoad.meetingHoursThisWeek.toFixed(1)} unit="hrs"
              icon={IconCalendarEvent} color={signals.meetingLoad.meetingHoursThisWeek > 15 ? "#fa5252" : "#339af0"}
              subtext={`${signals.meetingLoad.longestDeepWorkBlock}m deep work`}
            />
            <SignalGauge
              label="Response" value={signals.responseCadence.medianReplyMinutes < 60
                ? `${Math.round(signals.responseCadence.medianReplyMinutes)}m`
                : `${(signals.responseCadence.medianReplyMinutes / 60).toFixed(1)}h`}
              icon={IconClock}
              color={signals.responseCadence.medianReplyMinutes <= 60 ? "#40c057" : signals.responseCadence.medianReplyMinutes <= 240 ? "#fab005" : "#fa5252"}
              subtext={`${signals.responseCadence.unansweredOver24h} unanswered`}
            />
          </div>
        )}

        {/* Weekly trend chart */}
        {history.length >= 2 && (
          <div style={{ ...glassStyle, marginBottom: 12 }}>
            <Text size="xs" fw={600} c="dimmed" mb={8} style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Weekly Trends
            </Text>
            <div style={{ width: "100%", height: 140 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={history} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#339af0" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#339af0" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradFocus" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#40c057" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#40c057" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 10, fill: "#868e96" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#868e96" }} axisLine={false} tickLine={false} width={30} />
                  <RTooltip content={<TrendTooltip />} />
                  <Area type="monotone" dataKey="completed" name="Completed" stroke="#339af0" fill="url(#gradCompleted)" strokeWidth={2} dot={{ r: 3, fill: "#339af0" }} />
                  <Area type="monotone" dataKey="focusScore" name="Focus" stroke="#40c057" fill="url(#gradFocus)" strokeWidth={2} dot={{ r: 3, fill: "#40c057" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Manager's Take — summary + rating */}
        {signals && (
          loadingTake ? (
            <Skeleton height={120} radius="md" mb={12} />
          ) : managerTake ? (
            <>
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
                {/* Split summary into paragraphs for readability */}
                {managerTake.summary.split(/\n\n|\n(?=[A-Z])/).filter(Boolean).map((para, i) => (
                  <Text key={i} size="sm" mb={8} style={{ lineHeight: 1.6 }}>
                    {para.trim()}
                  </Text>
                ))}
              </div>

              {/* Categorized feedback sections */}
              {categorized && (["win", "risk", "focus"] as CalloutCategory[]).map(cat => {
                const items = categorized[cat];
                if (items.length === 0) return null;
                const config = CATEGORY_CONFIG[cat];
                return (
                  <div key={cat} style={{ ...glassStyle, marginBottom: 12 }}>
                    <Group gap={6} mb={8}>
                      <config.icon size={14} style={{ color: config.color, flexShrink: 0 }} />
                      <Text size="xs" fw={600} style={{ color: config.color, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {config.label}
                      </Text>
                    </Group>
                    <ul style={{ margin: 0, paddingLeft: 24, display: "flex", flexDirection: "column", gap: 4 }}>
                      {items.map((c, i) => (
                        <li key={i}><Text size="sm" component="span" style={{ lineHeight: 1.5 }}>{c}</Text></li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </>
          ) : null
        )}
      </div>
    </div>
  );
}
