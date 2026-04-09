import { Badge, Group, Skeleton, Stack, Text, Loader } from "@mantine/core";
import { IconTrendingUp, IconAlertTriangle, IconCheck, IconTarget } from "@tabler/icons-react";
import { useState, useEffect, useRef } from "react";
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
      <AppHeader rightContent={
        loadingTake ? (
          <Group gap={6}>
            <Loader size={12} />
            <Text size="xs" c="dimmed">Loading...</Text>
          </Group>
        ) : undefined
      } />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", paddingTop: 8 }}>
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
                <Text size="sm">
                  {managerTake.summary}
                </Text>
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
                    {items.map((c, i) => (
                      <Text key={i} size="sm" mb={i < items.length - 1 ? 6 : 0} style={{ paddingLeft: 20 }}>
                        {c}
                      </Text>
                    ))}
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
