import { Text, Tooltip } from "@mantine/core";
import { useState, useEffect } from "react";
import { AppHeader } from "../components/AppHeader";
import type { UsageSummary, DailyUsage, UsageEntry } from "../../shared/usage-types";

/* ---------- Helpers ---------- */

const fmt = (n: number) => `$${n.toFixed(2)}`;

const SOURCE_COLORS: Record<string, string> = {
  agent: "#4a7dff",
  "poll-bridge": "#a78bfa",
  "planning-agent": "#34d399",
  ephemeral: "#94a3b8",
  judge: "#f59e0b",
  "skill-runner": "#ec4899",
  "work-agent": "#06b6d4",
  "memory-extract": "#8b5cf6",
  reflect: "#10b981",
  "setup-agent": "#6366f1",
  manager: "#f97316",
  insights: "#eab308",
};

const glassStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 10,
  background: "var(--aegen-glass-bg)",
  backdropFilter: "var(--aegen-glass-blur)",
  border: "1px solid var(--aegen-glass-border)",
};

/* ---------- Summary Card ---------- */

function SummaryCard({ label, cost, calls }: { label: string; cost: number; calls: number }) {
  return (
    <div style={glassStyle}>
      <Text size="xs" fw={600} c="dimmed" mb={4} style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </Text>
      <Text size="xl" fw={700}>{fmt(cost)}</Text>
      <Text size="xs" c="dimmed">{calls.toLocaleString()} calls</Text>
    </div>
  );
}

/* ---------- Daily Spend Bars ---------- */

function DailyBars({ days }: { days: DailyUsage[] }) {
  const last14 = days.slice(-14);
  const max = Math.max(0.01, ...last14.map((d) => d.totalCostUsd));
  return (
    <div style={glassStyle}>
      <Text size="xs" fw={600} c="dimmed" mb={10} style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Daily spend (14 days)
      </Text>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 140 }}>
        {last14.map((d, i) => {
          const pct = Math.max(4, (d.totalCostUsd / max) * 100);
          const isToday = i === last14.length - 1;
          const dateLabel = d.date.slice(5); // MM-DD
          return (
            <Tooltip key={d.date} label={`${d.date}: ${fmt(d.totalCostUsd)} (${d.callCount} calls)`} position="top" withArrow>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div style={{
                  width: "100%",
                  maxWidth: 28,
                  height: `${pct}%`,
                  borderRadius: 4,
                  background: isToday ? "var(--aegen-cosmic-blue)" : "var(--aegen-dust-gray)",
                  transition: "height 0.3s ease",
                }} />
                <Text size="xs" c="dimmed" mt={4} ta="center" style={{ fontSize: 10 }}>{dateLabel}</Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Breakdown Row ---------- */

function BreakdownSection({ title, data }: { title: string; data: Array<{ name: string; cost: number; calls: number; color: string }> }) {
  const max = Math.max(0.01, ...data.map((d) => d.cost));
  if (data.length === 0) return null;
  return (
    <div style={glassStyle}>
      <Text size="xs" fw={600} c="dimmed" mb={10} style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {title}
      </Text>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.map((item) => (
          <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
            <Text size="xs" c="dimmed" style={{ width: 120, flexShrink: 0 }}>{item.name}</Text>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--aegen-glass-border)" }}>
              <div style={{
                height: "100%",
                width: `${(item.cost / max) * 100}%`,
                borderRadius: 4,
                background: item.color,
                transition: "width 0.3s ease",
              }} />
            </div>
            <Text size="xs" c="dimmed" style={{ width: 60, textAlign: "right", flexShrink: 0 }}>{fmt(item.cost)}</Text>
            <Text size="xs" c="dimmed" style={{ width: 50, textAlign: "right", flexShrink: 0 }}>{item.calls}</Text>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Recent Calls Table ---------- */

function RecentTable({ entries }: { entries: UsageEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div style={glassStyle}>
      <Text size="xs" fw={600} c="dimmed" mb={10} style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Recent calls
      </Text>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--aegen-glass-border)" }}>
              {["Time", "Source", "Model", "In", "Out", "Cost", "Label"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: "var(--aegen-dust-gray)", fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderBottom: "1px solid var(--aegen-glass-border)" }}>
                <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{new Date(e.timestamp).toLocaleTimeString()}</td>
                <td style={{ padding: "4px 8px" }}>
                  <span style={{
                    display: "inline-block",
                    padding: "1px 6px",
                    borderRadius: 4,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    background: (SOURCE_COLORS[e.source] ?? "#94a3b8") + "22",
                    color: SOURCE_COLORS[e.source] ?? "#94a3b8",
                  }}>
                    {e.source}
                  </span>
                </td>
                <td style={{ padding: "4px 8px" }}>{e.model}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{(e.inputTokens / 1000).toFixed(1)}k</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{(e.outputTokens / 1000).toFixed(1)}k</td>
                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>{fmt(e.costUsd)}</td>
                <td style={{ padding: "4px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Aggregation helpers ---------- */

function sumDays(days: DailyUsage[]) {
  let cost = 0, calls = 0;
  for (const d of days) { cost += d.totalCostUsd; calls += d.callCount; }
  return { cost, calls };
}

function aggregateBySource(days: DailyUsage[]) {
  const map: Record<string, { cost: number; calls: number }> = {};
  for (const d of days) {
    for (const [src, v] of Object.entries(d.bySource)) {
      if (!v) continue;
      if (!map[src]) map[src] = { cost: 0, calls: 0 };
      map[src].cost += v.costUsd;
      map[src].calls += v.callCount;
    }
  }
  return Object.entries(map)
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([name, v]) => ({ name, ...v, color: SOURCE_COLORS[name] ?? "#94a3b8" }));
}

function aggregateByModel(days: DailyUsage[]) {
  const map: Record<string, { cost: number; calls: number }> = {};
  for (const d of days) {
    for (const [model, v] of Object.entries(d.byModel)) {
      if (!map[model]) map[model] = { cost: 0, calls: 0 };
      map[model].cost += v.costUsd;
      map[model].calls += v.callCount;
    }
  }
  const palette = ["#4a7dff", "#a78bfa", "#34d399", "#f59e0b", "#ec4899", "#06b6d4"];
  return Object.entries(map)
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([name, v], i) => ({ name, ...v, color: palette[i % palette.length] }));
}

/* ---------- Main page ---------- */

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [recent, setRecent] = useState<UsageEntry[]>([]);

  useEffect(() => {
    window.deck?.getUsageSummary?.().then((s: UsageSummary) => s && setSummary(s));
    window.deck?.getRecentUsage?.(50).then((r: UsageEntry[]) => r && setRecent(r));
  }, []);

  const seven = summary ? sumDays(summary.last7Days) : { cost: 0, calls: 0 };
  const thirty = summary ? sumDays(summary.last30Days) : { cost: 0, calls: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--aegen-void)" }}>
      <AppHeader />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", paddingTop: 8 }}>
        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
          <SummaryCard label="Today" cost={summary?.today.totalCostUsd ?? 0} calls={summary?.today.callCount ?? 0} />
          <SummaryCard label="Last 7 Days" cost={seven.cost} calls={seven.calls} />
          <SummaryCard label="Last 30 Days" cost={thirty.cost} calls={thirty.calls} />
          <SummaryCard label="All Time" cost={summary?.allTimeCostUsd ?? 0} calls={summary?.allTimeCallCount ?? 0} />
        </div>

        {/* Daily spend chart */}
        {summary && summary.last30Days.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <DailyBars days={summary.last30Days} />
          </div>
        )}

        {/* By Source */}
        {summary && (
          <div style={{ marginBottom: 12 }}>
            <BreakdownSection title="By Source" data={aggregateBySource(summary.last30Days)} />
          </div>
        )}

        {/* By Model */}
        {summary && (
          <div style={{ marginBottom: 12 }}>
            <BreakdownSection title="By Model" data={aggregateByModel(summary.last30Days)} />
          </div>
        )}

        {/* Recent calls */}
        <RecentTable entries={recent} />
      </div>
    </div>
  );
}
