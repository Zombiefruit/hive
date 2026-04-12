import { Badge, Group, Stack, Text, TextInput, UnstyledButton, Loader, Tooltip } from "@mantine/core";
import {
  IconBulb, IconAlertTriangle, IconTrendingUp,
  IconRocket, IconTools, IconCheck, IconX, IconExternalLink,
  IconChevronDown, IconChevronRight,
} from "@tabler/icons-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip } from "recharts";
import { AppHeader } from "../components/AppHeader";
import { useGlobalRefresh } from "../hooks/useGlobalRefresh";
import type { Insight } from "../../shared/insight-types";

const TYPE_CONFIG: Record<string, { label: string; color: string; Icon: React.FC<{ size?: number }> }> = {
  feature_idea: { label: "Feature", color: "blue", Icon: IconBulb },
  customer_pain: { label: "Pain", color: "red", Icon: IconAlertTriangle },
  trend: { label: "Trend", color: "violet", Icon: IconTrendingUp },
  proactive_task: { label: "Proactive", color: "green", Icon: IconRocket },
  optimization: { label: "Optimize", color: "orange", Icon: IconTools },
};

const IMPACT_DOTS: Record<string, string> = {
  high: "var(--mantine-color-red-5)",
  medium: "var(--mantine-color-yellow-5)",
  low: "var(--mantine-color-gray-5)",
};

/* Chart colors — hardcoded hex because recharts doesn't resolve CSS vars */
const IMPACT_CHART_COLORS: Record<string, string> = { high: "#fa5252", medium: "#fab005", low: "#868e96" };
const TYPE_CHART_COLORS: Record<string, string> = {
  feature_idea: "#339af0", customer_pain: "#fa5252", trend: "#845ef7",
  proactive_task: "#40c057", optimization: "#fd7e14",
};

/* Custom tooltip for recharts that matches Aegen glass style */
function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div style={{
      padding: "6px 10px", borderRadius: 6, fontSize: 12,
      background: "rgba(20,20,30,0.9)", border: "1px solid rgba(255,255,255,0.1)",
      color: "#e0e0e0",
    }}>
      <span style={{ color: d.payload.fill, fontWeight: 600 }}>{d.name}</span>: {d.value}
    </div>
  );
}

/** Compact insight row — title, type dot, impact dot, and actions. Expandable for details. */
function InsightRow({ insight, expanded, onToggle, onAcknowledge, onDismiss, onConvert }: {
  insight: Insight;
  expanded: boolean;
  onToggle: () => void;
  onAcknowledge: () => void;
  onDismiss: () => void;
  onConvert: () => void;
}) {
  const config = TYPE_CONFIG[insight.type] ?? TYPE_CONFIG.feature_idea;
  const impactColor = IMPACT_DOTS[insight.impactEstimate] ?? IMPACT_DOTS.medium;

  return (
    <div style={{
      borderRadius: 8, marginBottom: 4,
      background: expanded ? "var(--aegen-glass-bg)" : "transparent",
      border: expanded ? "1px solid var(--aegen-glass-border)" : "1px solid transparent",
      transition: "background 0.15s ease, border 0.15s ease",
    }}>
      {/* Compact row */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", cursor: "pointer",
          borderRadius: 8,
        }}
        onClick={onToggle}
        onMouseEnter={(e) => {
          if (!expanded) e.currentTarget.style.backgroundColor = "var(--aegen-glass-bg)";
        }}
        onMouseLeave={(e) => {
          if (!expanded) e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        {/* Expand chevron */}
        {expanded
          ? <IconChevronDown size={12} color="var(--aegen-dust-gray)" style={{ flexShrink: 0 }} />
          : <IconChevronRight size={12} color="var(--aegen-dust-gray)" style={{ flexShrink: 0 }} />
        }

        {/* Impact dot */}
        <Tooltip label={`${insight.impactEstimate} impact`} position="top" withArrow>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: impactColor, flexShrink: 0 }} />
        </Tooltip>

        {/* Type badge */}
        <Badge size="xs" variant="light" color={config.color} leftSection={<config.Icon size={9} />}
          style={{ flexShrink: 0, fontSize: 10 }}>
          {config.label}
        </Badge>

        {/* Title */}
        <Text size="sm" fw={500} style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {insight.title}
        </Text>

        {/* Frequency */}
        {insight.frequency > 1 && (
          <Badge size="xs" variant="outline" color="gray" style={{ flexShrink: 0 }}>
            {insight.frequency}x
          </Badge>
        )}

        {/* Quick actions */}
        <Group gap={2} style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <Tooltip label="Create task">
            <UnstyledButton onClick={onConvert} style={{ padding: 3, borderRadius: 4, color: "var(--mantine-color-blue-5)" }}>
              <IconRocket size={13} />
            </UnstyledButton>
          </Tooltip>
          <Tooltip label="Acknowledge">
            <UnstyledButton onClick={onAcknowledge} style={{ padding: 3, borderRadius: 4, color: "var(--mantine-color-green-5)" }}>
              <IconCheck size={13} />
            </UnstyledButton>
          </Tooltip>
          <Tooltip label="Dismiss">
            <UnstyledButton onClick={onDismiss} style={{ padding: 3, borderRadius: 4, color: "var(--mantine-color-dimmed)" }}>
              <IconX size={13} />
            </UnstyledButton>
          </Tooltip>
        </Group>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: "4px 12px 10px 32px" }}>
          <Text size="xs" c="dimmed" mb={6}>{insight.description}</Text>
          {insight.sources.length > 0 && (
            <Group gap={6}>
              {insight.sources.slice(0, 3).map((src, i) => (
                <Badge
                  key={i} size="xs" variant="outline" color="gray" radius="sm"
                  style={{ cursor: src.url ? "pointer" : "default" }}
                  rightSection={src.url ? <IconExternalLink size={8} /> : undefined}
                  onClick={() => src.url && window.deck?.openExternal?.(src.url)}
                >
                  {src.label}
                </Badge>
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const { isRefreshing } = useGlobalRefresh();
  const [filter, setFilter] = useState<string | null>(null);
  const [impactFilter, setImpactFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load insights on mount and whenever global refresh triggers
  const loadInsights = useCallback(() => {
    window.deck?.getInsights?.().then((data: Insight[]) => {
      if (Array.isArray(data)) setInsights(data);
    }).catch(() => {}).finally(() => setInitialLoading(false));
  }, []);

  useEffect(() => {
    loadInsights();

    const unsub = window.deck?.onInsightsUpdate?.((data: Insight[]) => {
      // Only update if we received actual insights — never wipe existing data with empty array
      if (Array.isArray(data) && data.length > 0) setInsights(data);
      setInitialLoading(false);
    });
    return () => { unsub?.(); };
  }, [loadInsights]);

  // Reload when global refresh finishes
  useEffect(() => {
    if (!isRefreshing) loadInsights();
  }, [isRefreshing, loadInsights]);

  const handleUpdateStatus = useCallback((id: string, status: string) => {
    window.deck?.updateInsight?.(id, { status });
    setInsights(prev => prev.map(i => i.id === id ? { ...i, status: status as Insight["status"] } : i));
  }, []);

  const handleConvert = useCallback((id: string) => {
    window.deck?.convertInsightToTask?.(id);
    setInsights(prev => prev.map(i => i.id === id ? { ...i, status: "converted" as Insight["status"] } : i));
  }, []);

  const IMPACT_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const filtered = insights
    .filter(i => i.status === "new" || i.status === "acknowledged")
    .filter(i => !filter || i.type === filter)
    .filter(i => !impactFilter || i.impactEstimate === impactFilter)
    .filter(i => !search || i.title.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const impactDiff = (IMPACT_ORDER[a.impactEstimate] ?? 1) - (IMPACT_ORDER[b.impactEstimate] ?? 1);
      if (impactDiff !== 0) return impactDiff;
      return b.relevanceScore - a.relevanceScore;
    });
  const displayedItems = showAll ? filtered : filtered.slice(0, 25);

  // Group by impact for section headers
  const high = filtered.filter(i => i.impactEstimate === "high");
  const medium = filtered.filter(i => i.impactEstimate === "medium");
  const low = filtered.filter(i => i.impactEstimate === "low");

  const filterTypes = Object.entries(TYPE_CONFIG);

  // Chart data — memoized to avoid recalculation on every render
  const impactChartData = useMemo(() => [
    { name: "High", value: high.length, fill: IMPACT_CHART_COLORS.high },
    { name: "Medium", value: medium.length, fill: IMPACT_CHART_COLORS.medium },
    { name: "Low", value: low.length, fill: IMPACT_CHART_COLORS.low },
  ].filter(d => d.value > 0), [high.length, medium.length, low.length]);

  const typeChartData = useMemo(() =>
    Object.entries(TYPE_CONFIG).map(([key, cfg]) => ({
      name: cfg.label,
      value: filtered.filter(i => i.type === key).length,
      fill: TYPE_CHART_COLORS[key] ?? "#868e96",
      key,
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value),
  [filtered]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--aegen-void)" }}>
      {/* No header bar — refresh state shown via sidebar spinner */}

      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        {/* Visual summary — charts + filter badges */}
        {filtered.length > 0 && (
          <div style={{
            display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap",
            padding: "14px 16px", borderRadius: 10,
            background: "var(--aegen-glass-bg)", backdropFilter: "var(--aegen-glass-blur)",
            border: "1px solid var(--aegen-glass-border)",
          }}>
            {/* Impact donut */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 120 }}>
              <Text size="xs" fw={600} c="dimmed" mb={4} style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Impact
              </Text>
              <div style={{ width: 100, height: 100, position: "relative" }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={impactChartData}
                      cx="50%" cy="50%"
                      innerRadius={28} outerRadius={44}
                      dataKey="value" stroke="none"
                      style={{ cursor: "pointer" }}
                      onClick={(_, idx) => {
                        const level = ["high", "medium", "low"].filter(l =>
                          (l === "high" && high.length > 0) || (l === "medium" && medium.length > 0) || (l === "low" && low.length > 0)
                        )[idx];
                        if (level) setImpactFilter(impactFilter === level ? null : level);
                      }}
                    >
                      {impactChartData.map((d, i) => (
                        <Cell key={i} fill={d.fill} opacity={!impactFilter || impactFilter === ["high", "medium", "low"].filter(l =>
                          (l === "high" && high.length > 0) || (l === "medium" && medium.length > 0) || (l === "low" && low.length > 0)
                        )[i] ? 1 : 0.3} />
                      ))}
                    </Pie>
                    <RTooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                  textAlign: "center", pointerEvents: "none",
                }}>
                  <Text size="lg" fw={700} lh={1}>{filtered.length}</Text>
                  <Text size="8px" c="dimmed">total</Text>
                </div>
              </div>
              {/* Impact legend */}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {impactChartData.map(d => (
                  <Text key={d.name} size="10px" c="dimmed" style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: d.fill, display: "inline-block" }} />
                    {d.value}
                  </Text>
                ))}
              </div>
            </div>

            {/* Type bar chart */}
            <div style={{ flex: 1, minWidth: 200, maxWidth: 400 }}>
              <Text size="xs" fw={600} c="dimmed" mb={4} style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                By Type
              </Text>
              <div style={{ width: "100%", height: 100 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={typeChartData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={65} tick={{ fontSize: 11, fill: "#868e96" }} axisLine={false} tickLine={false} />
                    <RTooltip content={<ChartTooltip />} cursor={false} />
                    <Bar
                      dataKey="value" radius={[0, 4, 4, 0]} barSize={14}
                      style={{ cursor: "pointer" }}
                      onClick={(_d, idx) => {
                        const key = typeChartData[idx]?.key;
                        if (key) setFilter(filter === key ? null : key);
                      }}
                    >
                      {typeChartData.map((d, i) => (
                        <Cell key={i} fill={d.fill} opacity={!filter || filter === d.key ? 1 : 0.3} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top insight callout */}
            {high.length > 0 && (
              <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <Text size="xs" fw={600} c="dimmed" mb={4} style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Top Insight
                </Text>
                <Text size="sm" fw={500} lineClamp={2}>{high[0].title}</Text>
                <Text size="xs" c="dimmed" lineClamp={2} mt={2}>{high[0].description}</Text>
              </div>
            )}
          </div>
        )}

        {/* Active filters */}
        {(impactFilter || filter) && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            {impactFilter && (
              <Badge size="sm" color={impactFilter === "high" ? "red" : impactFilter === "medium" ? "yellow" : "gray"}
                variant="filled" style={{ cursor: "pointer" }} onClick={() => setImpactFilter(null)}
                rightSection={<IconX size={10} />}>
                {impactFilter} impact
              </Badge>
            )}
            {filter && (
              <Badge size="sm" color={TYPE_CONFIG[filter]?.color ?? "gray"}
                variant="filled" style={{ cursor: "pointer" }} onClick={() => setFilter(null)}
                rightSection={<IconX size={10} />}>
                {TYPE_CONFIG[filter]?.label ?? filter}
              </Badge>
            )}
          </div>
        )}

        {/* Search */}
        <TextInput
          placeholder="Search insights..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          mb={12}
          style={{ maxWidth: 300 }}
        />

        {/* Loading state */}
        {(initialLoading || isRefreshing) && filtered.length === 0 && (
          <Stack align="center" py="xl" gap="sm">
            <Loader size={24} />
            <Text size="sm" c="dimmed">{isRefreshing ? "Scanning sources..." : "Loading insights..."}</Text>
          </Stack>
        )}

        {/* Empty state */}
        {filtered.length === 0 && !isRefreshing && !initialLoading && (
          <Stack align="center" py="xl" gap="sm">
            <IconBulb size={32} color="var(--aegen-dust-gray)" />
            <Text size="sm" c="dimmed">No insights yet.</Text>
            <Text size="xs" c="dimmed">Click Refresh to scan sources.</Text>
          </Stack>
        )}

        {/* Results count */}
        {filtered.length > 0 && (
          <Text size="xs" c="dimmed" mb={8}>
            Showing {displayedItems.length} of {filtered.length} insights
          </Text>
        )}

        {/* Insight list */}
        {displayedItems.map(insight => (
          <InsightRow
            key={insight.id}
            insight={insight}
            expanded={expandedId === insight.id}
            onToggle={() => setExpandedId(expandedId === insight.id ? null : insight.id)}
            onAcknowledge={() => handleUpdateStatus(insight.id, "acknowledged")}
            onDismiss={() => handleUpdateStatus(insight.id, "dismissed")}
            onConvert={() => handleConvert(insight.id)}
          />
        ))}

        {/* Show more */}
        {!showAll && filtered.length > 25 && (
          <UnstyledButton
            onClick={() => setShowAll(true)}
            style={{
              display: "block", margin: "12px auto", padding: "6px 16px",
              borderRadius: 6, fontSize: "0.75rem", fontWeight: 500,
              border: "1px solid var(--aegen-glass-border)", color: "var(--aegen-dust-gray)",
            }}
          >
            Show all {filtered.length} insights
          </UnstyledButton>
        )}
      </div>
    </div>
  );
}
