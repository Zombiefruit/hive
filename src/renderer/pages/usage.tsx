import { Text, Tooltip } from "@mantine/core";
import { useState, useEffect } from "react";
import { AppHeader } from "../components/AppHeader";
import type { UsageSummary, DailyUsage, UsageEntry } from "../../shared/usage-types";
import { PIPELINE_STAGES, MODEL_COLORS } from "../../shared/pipeline-types";

/* ---------- Helpers ---------- */

const fmt = (n: number) => `$${n.toFixed(2)}`;
const MODEL_LABELS: Record<string, string> = { haiku: "Haiku", sonnet: "Sonnet", opus: "Opus", none: "TS" };
const SOURCE_TO_STAGE: Record<string, string> = {
  "poll-fetch": "fetch", "poll-bridge": "fetch", "poll-triage": "triage",
  judge: "judge", "planning-agent": "plan", "work-agent": "hack",
  "skill-runner": "hack", ephemeral: "plan",
};
const FAMILY_COLORS: Record<string, string> = {
  haiku: "var(--aegen-success)", sonnet: "var(--aegen-cosmic-blue)",
  opus: "var(--aegen-stellar-purple)", other: "var(--aegen-dim-gray)",
};
const SOURCE_COLORS: Record<string, string> = {
  agent: "#4a7dff", "poll-bridge": "#a78bfa", "planning-agent": "#34d399",
  ephemeral: "#94a3b8", judge: "#f59e0b", "skill-runner": "#ec4899",
  "work-agent": "#06b6d4", "memory-extract": "#8b5cf6", reflect: "#10b981",
  "setup-agent": "#6366f1", manager: "#f97316", insights: "#eab308",
  "poll-fetch": "#22d3ee", "poll-triage": "#818cf8",
};

const glass: React.CSSProperties = {
  padding: "14px 16px", borderRadius: 10, background: "var(--aegen-glass-bg)",
  backdropFilter: "var(--aegen-glass-blur)", border: "1px solid var(--aegen-glass-border)",
};
const sectionLabel: React.CSSProperties = { textTransform: "uppercase", letterSpacing: "0.5px" };

function sumDays(days: DailyUsage[]) {
  let cost = 0, calls = 0;
  for (const d of days) { cost += d.totalCostUsd; calls += d.callCount; }
  return { cost, calls };
}

function canonicalModel(name: string) {
  const n = name.toLowerCase();
  if (n.includes("haiku")) return "haiku";
  if (n.includes("sonnet")) return "sonnet";
  if (n.includes("opus")) return "opus";
  return "other";
}

function stageCostFromDays(days: DailyUsage[]) {
  const m: Record<string, number> = {};
  for (const d of days) for (const [src, v] of Object.entries(d.bySource)) {
    if (!v) continue;
    const sid = SOURCE_TO_STAGE[src];
    if (sid) m[sid] = (m[sid] ?? 0) + v.costUsd;
  }
  return m;
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

/* ---------- Pipeline Components ---------- */

function PipelineNode({ stage, cost, active }: {
  stage: typeof PIPELINE_STAGES[number]; cost: number; active: boolean;
}) {
  const color = MODEL_COLORS[stage.model];
  return (
    <Tooltip label={stage.description} position="bottom" withArrow>
      <div style={{
        ...glass, minWidth: 80, flex: 1, maxWidth: 120, minHeight: 82, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 3, padding: "8px 6px",
        boxShadow: active ? `0 0 12px ${color}` : undefined,
        animation: active ? "pipeline-pulse 2s ease-in-out infinite" : undefined,
      }}>
        <Text size="xs" fw={700} style={{ color: "var(--aegen-star-white)", fontSize: 11 }}>{stage.label}</Text>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
          <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>{MODEL_LABELS[stage.model]}</Text>
        </div>
        <Text size="xs" fw={600} c="dimmed" style={{ fontSize: 10 }}>{fmt(cost)}</Text>
      </div>
    </Tooltip>
  );
}

function Arrow() {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" style={{ flexShrink: 0, alignSelf: "center" }}>
      <line x1="0" y1="5" x2="14" y2="5" stroke="var(--aegen-dim-gray)" strokeWidth="1.2" />
      <polygon points="14,2 20,5 14,8" fill="var(--aegen-dim-gray)" />
    </svg>
  );
}

/* ---------- Summary Card ---------- */

function SummaryCard({ label, cost, calls }: { label: string; cost: number; calls: number }) {
  return (
    <div style={glass}>
      <Text size="xs" fw={600} c="dimmed" mb={4} style={sectionLabel}>{label}</Text>
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
    <div style={glass}>
      <Text size="xs" fw={600} c="dimmed" mb={10} style={sectionLabel}>Daily spend (14 days)</Text>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 120 }}>
        {last14.map((d, i) => {
          const pct = Math.max(4, (d.totalCostUsd / max) * 100);
          const isToday = i === last14.length - 1;
          const dateLabel = d.date.slice(5);
          return (
            <Tooltip key={d.date} label={`${d.date}: ${fmt(d.totalCostUsd)} (${d.callCount} calls)`} position="top" withArrow>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div style={{
                  width: "100%", maxWidth: 28, height: `${pct}%`, borderRadius: 4,
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
    <div style={glass}>
      <Text size="xs" fw={600} c="dimmed" mb={10} style={sectionLabel}>{title}</Text>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.map((item) => (
          <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
            <Text size="xs" c="dimmed" style={{ width: 110, flexShrink: 0 }}>{item.name}</Text>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--aegen-glass-border)" }}>
              <div style={{
                height: "100%", width: `${(item.cost / max) * 100}%`,
                borderRadius: 4, background: item.color, transition: "width 0.3s ease",
              }} />
            </div>
            <Text size="xs" c="dimmed" style={{ width: 56, textAlign: "right", flexShrink: 0 }}>{fmt(item.cost)}</Text>
            <Text size="xs" c="dimmed" style={{ width: 46, textAlign: "right", flexShrink: 0 }}>{item.calls}</Text>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Model Breakdown ---------- */

function ModelBreakdown({ days }: { days: DailyUsage[] }) {
  const families: Record<string, { cost: number; calls: number }> = {};
  for (const d of days) for (const [model, v] of Object.entries(d.byModel)) {
    const fam = canonicalModel(model);
    if (!families[fam]) families[fam] = { cost: 0, calls: 0 };
    families[fam].cost += v.costUsd;
    families[fam].calls += v.callCount;
  }
  const total = Object.values(families).reduce((s, v) => s + v.cost, 0) || 1;
  const sorted = Object.entries(families).sort((a, b) => b[1].cost - a[1].cost);
  const max = Math.max(0.01, ...sorted.map(([, v]) => v.cost));
  return (
    <div style={glass}>
      <Text size="xs" fw={600} c="dimmed" mb={10} style={sectionLabel}>By Model</Text>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map(([fam, v]) => {
          const color = FAMILY_COLORS[fam] ?? "var(--aegen-dim-gray)";
          return (
            <div key={fam} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <Text size="xs" c="dimmed" style={{ width: 60, flexShrink: 0, textTransform: "capitalize" }}>{fam}</Text>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--aegen-glass-border)" }}>
                <div style={{ height: "100%", width: `${(v.cost / max) * 100}%`, borderRadius: 4, background: color, transition: "width 0.3s ease" }} />
              </div>
              <Text size="xs" c="dimmed" style={{ width: 56, textAlign: "right", flexShrink: 0 }}>{fmt(v.cost)}</Text>
              <Text size="xs" c="dimmed" style={{ width: 36, textAlign: "right", flexShrink: 0 }}>{Math.round((v.cost / total) * 100)}%</Text>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Stage Cost Table ---------- */

function StageCostTable({ today, week, month }: {
  today: Record<string, number>; week: Record<string, number>; month: Record<string, number>;
}) {
  const thStyle = (align: "left" | "right"): React.CSSProperties => ({
    textAlign: align, padding: "4px 8px", color: "var(--aegen-dust-gray)",
    fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase",
  });
  return (
    <div style={glass}>
      <Text size="xs" fw={600} c="dimmed" mb={10} style={sectionLabel}>Cost by Stage</Text>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--aegen-glass-border)" }}>
            <th style={thStyle("left")}>Stage</th><th style={thStyle("left")}>Model</th>
            <th style={thStyle("right")}>Today</th><th style={thStyle("right")}>7 Day</th>
            <th style={thStyle("right")}>30 Day</th>
          </tr>
        </thead>
        <tbody>
          {PIPELINE_STAGES.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid var(--aegen-glass-border)" }}>
              <td style={{ padding: "6px 8px", fontWeight: 600 }}>{s.label}</td>
              <td style={{ padding: "6px 8px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: MODEL_COLORS[s.model], display: "inline-block" }} />
                  {MODEL_LABELS[s.model]}
                </span>
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(today[s.id] ?? 0)}</td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(week[s.id] ?? 0)}</td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(month[s.id] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Recent Calls Table ---------- */

function RecentTable({ entries }: { entries: UsageEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div style={glass}>
      <Text size="xs" fw={600} c="dimmed" mb={10} style={sectionLabel}>Recent calls</Text>
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
                    display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: "0.7rem", fontWeight: 600,
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
  const todayCosts = summary ? stageCostFromDays([summary.today]) : {};
  const weekCosts = summary ? stageCostFromDays(summary.last7Days) : {};
  const monthCosts = summary ? stageCostFromDays(summary.last30Days) : {};
  const activeStages = new Set(Object.entries(todayCosts).filter(([, c]) => c > 0).map(([id]) => id));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--aegen-void)" }}>
      <style>{`@keyframes pipeline-pulse { 0%,100%{opacity:1} 50%{opacity:0.85} }`}</style>
      <AppHeader />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", paddingTop: 8 }}>
        {/* Pipeline Flow — full width */}
        <div style={{ ...glass, marginBottom: 12 }}>
          <Text size="xs" fw={600} c="dimmed" mb={8} style={sectionLabel}>Pipeline — Today's Activity</Text>
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 0" }}>
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage.id} style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
                <PipelineNode stage={stage} cost={todayCosts[stage.id] ?? 0} active={activeStages.has(stage.id)} />
                {i < PIPELINE_STAGES.length - 1 && <Arrow />}
              </div>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 12 }}>
          <SummaryCard label="Today" cost={summary?.today.totalCostUsd ?? 0} calls={summary?.today.callCount ?? 0} />
          <SummaryCard label="Last 7 Days" cost={seven.cost} calls={seven.calls} />
          <SummaryCard label="Last 30 Days" cost={thirty.cost} calls={thirty.calls} />
          <SummaryCard label="All Time" cost={summary?.allTimeCostUsd ?? 0} calls={summary?.allTimeCallCount ?? 0} />
        </div>

        {/* Daily spend chart */}
        {summary && summary.last30Days.length > 0 && (
          <div style={{ marginBottom: 12 }}><DailyBars days={summary.last30Days} /></div>
        )}

        {/* Two-column: Source + Model breakdowns */}
        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <BreakdownSection title="By Source" data={aggregateBySource(summary.last30Days)} />
            <ModelBreakdown days={summary.last30Days} />
          </div>
        )}

        {/* Stage cost table */}
        <div style={{ marginBottom: 12 }}>
          <StageCostTable today={todayCosts} week={weekCosts} month={monthCosts} />
        </div>

        {/* Recent calls */}
        <RecentTable entries={recent} />
      </div>
    </div>
  );
}
