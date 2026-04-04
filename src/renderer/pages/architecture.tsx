import { Text, Tooltip } from "@mantine/core";
import { useState, useEffect } from "react";
import { AppHeader } from "../components/AppHeader";
import type { UsageSummary, DailyUsage } from "../../shared/usage-types";
import { PIPELINE_STAGES, MODEL_COLORS } from "../../shared/pipeline-types";

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
const glass: React.CSSProperties = {
  padding: "14px 16px", borderRadius: 10, background: "var(--aegen-glass-bg)",
  backdropFilter: "var(--aegen-glass-blur)", border: "1px solid var(--aegen-glass-border)",
};
const sectionLabel: React.CSSProperties = { textTransform: "uppercase", letterSpacing: "0.5px" };

function stageCostFromDays(days: DailyUsage[]) {
  const m: Record<string, number> = {};
  for (const d of days) for (const [src, v] of Object.entries(d.bySource)) {
    if (!v) continue;
    const sid = SOURCE_TO_STAGE[src];
    if (sid) m[sid] = (m[sid] ?? 0) + v.costUsd;
  }
  return m;
}
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

/* ---------- Components ---------- */

function PipelineNode({ stage, cost, active }: {
  stage: typeof PIPELINE_STAGES[number]; cost: number; active: boolean;
}) {
  const color = MODEL_COLORS[stage.model];
  return (
    <Tooltip label={stage.description} position="bottom" withArrow>
      <div style={{
        ...glass, width: 88, minHeight: 90, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 4, padding: "10px 6px",
        boxShadow: active ? `0 0 12px ${color}` : undefined,
        animation: active ? "pipeline-pulse 2s ease-in-out infinite" : undefined,
      }}>
        <Text size="xs" fw={700} style={{ color: "var(--aegen-star-white)" }}>{stage.label}</Text>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
          <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>{MODEL_LABELS[stage.model]}</Text>
        </div>
        <Text size="xs" fw={600} c="dimmed" style={{ fontSize: 11 }}>{fmt(cost)}</Text>
      </div>
    </Tooltip>
  );
}

function Arrow() {
  return (
    <svg width="24" height="12" viewBox="0 0 24 12" style={{ flexShrink: 0, alignSelf: "center" }}>
      <line x1="0" y1="6" x2="18" y2="6" stroke="var(--aegen-dim-gray)" strokeWidth="1.5" />
      <polygon points="18,2 24,6 18,10" fill="var(--aegen-dim-gray)" />
    </svg>
  );
}

function SummaryCard({ label, cost, calls }: { label: string; cost: number; calls: number }) {
  return (
    <div style={glass}>
      <Text size="xs" fw={600} c="dimmed" mb={4} style={sectionLabel}>{label}</Text>
      <Text size="xl" fw={700}>{fmt(cost)}</Text>
      <Text size="xs" c="dimmed">{calls.toLocaleString()} calls</Text>
    </div>
  );
}

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
      <Text size="xs" fw={600} c="dimmed" mb={10} style={sectionLabel}>Model Breakdown</Text>
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

function StageCostTable({ today, week, month }: {
  today: Record<string, number>; week: Record<string, number>; month: Record<string, number>;
}) {
  const thStyle = (align: "left" | "right"): React.CSSProperties => ({
    textAlign: align, padding: "4px 8px", color: "var(--aegen-dust-gray)",
    fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase",
  });
  return (
    <div style={glass}>
      <Text size="xs" fw={600} c="dimmed" mb={10} style={sectionLabel}>Stage Costs</Text>
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

/* ---------- Main Page ---------- */

export default function ArchitecturePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  useEffect(() => {
    window.deck?.getUsageSummary?.().then((s: UsageSummary) => s && setSummary(s));
  }, []);

  const todayCosts = summary ? stageCostFromDays([summary.today]) : {};
  const weekCosts = summary ? stageCostFromDays(summary.last7Days) : {};
  const monthCosts = summary ? stageCostFromDays(summary.last30Days) : {};
  const seven = summary ? sumDays(summary.last7Days) : { cost: 0, calls: 0 };
  const allTime = { cost: summary?.allTimeCostUsd ?? 0, calls: summary?.allTimeCallCount ?? 0 };
  const activeStages = new Set(Object.entries(todayCosts).filter(([, c]) => c > 0).map(([id]) => id));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--aegen-void)" }}>
      <style>{`@keyframes pipeline-pulse { 0%,100%{opacity:1} 50%{opacity:0.85} }`}</style>
      <AppHeader title="Pipeline" />
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", paddingTop: 8 }}>
        {/* Pipeline Flow */}
        <div style={{ ...glass, marginBottom: 12, overflowX: "auto" }}>
          <Text size="xs" fw={600} c="dimmed" mb={10} style={sectionLabel}>Pipeline Flow</Text>
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 0", minWidth: "fit-content" }}>
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <PipelineNode stage={stage} cost={todayCosts[stage.id] ?? 0} active={activeStages.has(stage.id)} />
                {i < PIPELINE_STAGES.length - 1 && <Arrow />}
              </div>
            ))}
          </div>
        </div>
        {/* Cost Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
          <SummaryCard label="Today" cost={summary?.today.totalCostUsd ?? 0} calls={summary?.today.callCount ?? 0} />
          <SummaryCard label="Last 7 Days" cost={seven.cost} calls={seven.calls} />
          <SummaryCard label="All Time" cost={allTime.cost} calls={allTime.calls} />
        </div>
        {/* Model Breakdown */}
        {summary && <div style={{ marginBottom: 12 }}><ModelBreakdown days={summary.last30Days} /></div>}
        {/* Stage Cost Table */}
        <StageCostTable today={todayCosts} week={weekCosts} month={monthCosts} />
      </div>
    </div>
  );
}
