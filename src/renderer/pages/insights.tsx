import { Badge, Group, Stack, Text, UnstyledButton, Loader, Tooltip } from "@mantine/core";
import {
  IconBulb, IconRefresh, IconAlertTriangle, IconTrendingUp,
  IconRocket, IconTools, IconCheck, IconX, IconExternalLink,
} from "@tabler/icons-react";
import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "../components/AppHeader";
import { GlobalLoadingBanner } from "../components/GlobalLoadingBanner";
import type { Insight } from "../../shared/insight-types";

const TYPE_CONFIG: Record<string, { label: string; color: string; Icon: React.FC<{ size?: number }> }> = {
  feature_idea: { label: "Feature Idea", color: "blue", Icon: IconBulb },
  customer_pain: { label: "Customer Pain", color: "red", Icon: IconAlertTriangle },
  trend: { label: "Trend", color: "violet", Icon: IconTrendingUp },
  proactive_task: { label: "Proactive", color: "green", Icon: IconRocket },
  optimization: { label: "Optimization", color: "orange", Icon: IconTools },
};

function InsightCard({ insight, onAcknowledge, onDismiss, onConvert }: {
  insight: Insight;
  onAcknowledge: () => void;
  onDismiss: () => void;
  onConvert: () => void;
}) {
  const config = TYPE_CONFIG[insight.type] ?? TYPE_CONFIG.feature_idea;

  return (
    <div style={{
      padding: "14px 16px", borderRadius: 10, marginBottom: 10,
      backgroundColor: "var(--mantine-color-default)",
      border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
    }}>
      <Group gap={8} mb={6} wrap="nowrap">
        <Badge size="xs" variant="light" color={config.color} leftSection={<config.Icon size={10} />}>
          {config.label}
        </Badge>
        <Badge size="xs" variant="light" color={insight.impactEstimate === "high" ? "red" : insight.impactEstimate === "medium" ? "yellow" : "gray"}>
          {insight.impactEstimate} impact
        </Badge>
        {insight.frequency > 1 && (
          <Badge size="xs" variant="outline" color="gray">
            {insight.frequency}x
          </Badge>
        )}
        <div style={{ flex: 1 }} />
        <Group gap={4}>
          <Tooltip label="Create task from this insight">
            <UnstyledButton onClick={onConvert} style={{ padding: 4, borderRadius: 4, color: "var(--mantine-color-blue-5)" }}>
              <IconRocket size={14} />
            </UnstyledButton>
          </Tooltip>
          <Tooltip label="Acknowledge">
            <UnstyledButton onClick={onAcknowledge} style={{ padding: 4, borderRadius: 4, color: "var(--mantine-color-green-5)" }}>
              <IconCheck size={14} />
            </UnstyledButton>
          </Tooltip>
          <Tooltip label="Dismiss">
            <UnstyledButton onClick={onDismiss} style={{ padding: 4, borderRadius: 4, color: "var(--mantine-color-dimmed)" }}>
              <IconX size={14} />
            </UnstyledButton>
          </Tooltip>
        </Group>
      </Group>

      <Text size="sm" fw={600} mb={4}>{insight.title}</Text>
      <Text size="xs" c="dimmed" lineClamp={3} mb={6}>{insight.description}</Text>

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
  );
}

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    window.deck?.getInsights?.().then((data: Insight[]) => {
      if (Array.isArray(data)) setInsights(data);
    }).catch(() => {});

    const unsub = window.deck?.onInsightsUpdate?.((data: Insight[]) => {
      if (Array.isArray(data)) setInsights(prev => [...data, ...prev]);
      setLocalLoading(false);
    });
    return () => { unsub?.(); };
  }, []);

  const handleRefresh = useCallback(async () => {
    setLocalLoading(true);
    try {
      const data = await window.deck?.generateInsights?.();
      if (Array.isArray(data)) setInsights(data);
    } catch {}
    setLocalLoading(false);
  }, []);

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
    .sort((a, b) => {
      // Sort by impact (high first), then by relevance score (highest first)
      const impactDiff = (IMPACT_ORDER[a.impactEstimate] ?? 1) - (IMPACT_ORDER[b.impactEstimate] ?? 1);
      if (impactDiff !== 0) return impactDiff;
      return b.relevanceScore - a.relevanceScore;
    });

  const filterTypes = Object.entries(TYPE_CONFIG);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppHeader rightContent={
        <UnstyledButton
          onClick={handleRefresh}
          disabled={localLoading}
          style={{ padding: "4px 12px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500, backgroundColor: "var(--mantine-color-blue-5)", color: "white", opacity: localLoading ? 0.6 : 1 }}
        >
          <Group gap={6}>
            {localLoading ? <Loader size={12} color="white" /> : <IconRefresh size={12} />}
            {localLoading ? "Scanning..." : "Refresh"}
          </Group>
        </UnstyledButton>
      } />
      <GlobalLoadingBanner />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", paddingTop: 8 }}>
        {/* Filter chips */}
        <Group gap={6} mb={12}>
          <UnstyledButton
            onClick={() => setFilter(null)}
            style={{
              padding: "4px 10px", borderRadius: 6, fontSize: "0.7rem", fontWeight: 500,
              backgroundColor: !filter ? "var(--mantine-color-default-hover)" : "transparent",
              color: !filter ? "var(--mantine-color-text)" : "var(--mantine-color-dimmed)",
            }}
          >
            All ({filtered.length})
          </UnstyledButton>
          {filterTypes.map(([key, cfg]) => {
            const count = insights.filter(i => i.type === key && (i.status === "new" || i.status === "acknowledged")).length;
            return (
              <UnstyledButton
                key={key}
                onClick={() => setFilter(filter === key ? null : key)}
                style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: "0.7rem", fontWeight: 500,
                  backgroundColor: filter === key ? "var(--mantine-color-default-hover)" : "transparent",
                  color: filter === key ? "var(--mantine-color-text)" : "var(--mantine-color-dimmed)",
                }}
              >
                {cfg.label} ({count})
              </UnstyledButton>
            );
          })}
        </Group>

        {/* Empty state */}
        {filtered.length === 0 && !localLoading && (
          <Stack align="center" py="xl" gap="sm">
            <IconBulb size={32} color="var(--mantine-color-dimmed)" />
            <Text size="sm" c="dimmed">No insights yet.</Text>
            <Text size="xs" c="dimmed">Click Refresh to scan your Slack channels, Gong calls, and Linear for proactive ideas.</Text>
          </Stack>
        )}

        {/* Local loading state — only for page-specific "Refresh" action */}
        {localLoading && filtered.length === 0 && (
          <Stack align="center" py="xl" gap="sm">
            <Loader size={24} />
            <Text size="sm" c="dimmed">Scanning sources for insights...</Text>
          </Stack>
        )}

        {/* Insight cards */}
        {filtered.map(insight => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onAcknowledge={() => handleUpdateStatus(insight.id, "acknowledged")}
            onDismiss={() => handleUpdateStatus(insight.id, "dismissed")}
            onConvert={() => handleConvert(insight.id)}
          />
        ))}
      </div>
    </div>
  );
}
