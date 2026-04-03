import { Badge, Group, Progress, Stack, Text } from "@mantine/core";
import {
  IconTrendingUp, IconClock, IconCheck, IconAlertTriangle,
  IconCalendar, IconMessageCircle, IconCode, IconSearch,
} from "@tabler/icons-react";
import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "../components/AppHeader";
import { GlobalLoadingBanner } from "../components/GlobalLoadingBanner";

interface DailyBrief {
  yesterday: string[];
  today: string[];
  blockers: string[];
  generatedAt: string;
}

interface WorkPatterns {
  tasksByType: Record<string, number>;
  tasksByStage: Record<string, number>;
  completedThisWeek: number;
  completedLastWeek: number;
  avgCompletionHours: number;
  bottleneckStage: string;
  meetingLoad: number;
}

interface OutputScore {
  overall: number;
  completionRate: number;
  responseSpeed: number;
  planQuality: number;
  suggestions: string[];
  weekLabel: string;
}

const TYPE_ICONS: Record<string, React.FC<{ size?: number }>> = {
  implementation: IconCode,
  response: IconMessageCircle,
  review: IconSearch,
  meeting_prep: IconCalendar,
  investigation: IconSearch,
};

function ScoreRing({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <Stack gap={4} align="center" style={{ minWidth: 70 }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        border: `3px solid var(--mantine-color-${color}-5)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Text size="sm" fw={700}>{value}</Text>
      </div>
      <Text size="xs" c="dimmed" ta="center">{label}</Text>
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: "14px 16px", borderRadius: 10, marginBottom: 12,
      background: "rgba(16, 21, 32, 0.65)",
      backdropFilter: "blur(16px) saturate(1.2)",
      border: "1px solid rgba(68, 73, 85, 0.2)",
    }}>
      <Text size="xs" fw={600} c="dimmed" mb={8} style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</Text>
      {children}
    </div>
  );
}

export default function CoachPage() {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [patterns, setPatterns] = useState<WorkPatterns | null>(null);
  const [score, setScore] = useState<OutputScore | null>(null);
  const [localLoading, setLocalLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLocalLoading(true);
    try {
      const [b, p, s] = await Promise.all([
        window.deck?.getDailyBrief?.(),
        window.deck?.getWorkPatterns?.(),
        window.deck?.getOutputScore?.(),
      ]);
      if (b) setBrief(b);
      if (p) setPatterns(p);
      if (s) setScore(s);
    } catch {}
    setLocalLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    // Reload on global refresh
    const unsub = window.deck?.onPollingFinished?.(() => loadData());
    return () => { unsub?.(); };
  }, []);

  const totalTasks = patterns ? Object.values(patterns.tasksByType).reduce((a, b) => a + b, 0) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--aegen-void)" }}>
      <AppHeader />
      <GlobalLoadingBanner />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", paddingTop: 8 }}>
        {/* Empty state */}
        {!localLoading && !score && !brief && !patterns && (
          <Stack align="center" py="xl" gap="sm">
            <IconTrendingUp size={32} color="var(--aegen-dust-gray)" />
            <Text size="sm" c="dimmed">No coaching data yet.</Text>
            <Text size="xs" c="dimmed">Data will appear after your first poll cycle.</Text>
          </Stack>
        )}

        {/* Output Score */}
        {score && (
          <Section title={score.weekLabel}>
            <Group gap={16} mb={12} justify="center">
              <ScoreRing value={score.overall} label="Overall" color={score.overall > 70 ? "green" : score.overall > 40 ? "yellow" : "red"} />
              <ScoreRing value={score.completionRate} label="Completion" color="blue" />
              <ScoreRing value={score.responseSpeed} label="Response" color="violet" />
              <ScoreRing value={score.planQuality} label="Plan Quality" color="cyan" />
            </Group>
            {score.suggestions.map((s, i) => (
              <Group key={i} gap={6} mb={4} wrap="nowrap" align="flex-start">
                <IconTrendingUp size={12} color="var(--mantine-color-blue-5)" style={{ marginTop: 3, flexShrink: 0 }} />
                <Text size="xs" c="dimmed">{s}</Text>
              </Group>
            ))}
          </Section>
        )}

        {/* Daily Brief */}
        {brief && (
          <Section title="Daily Brief">
            <Text size="xs" fw={600} c="green.5" mb={4}>
              <IconCheck size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Yesterday
            </Text>
            {brief.yesterday.map((item, i) => (
              <Text key={i} size="xs" c="dimmed" style={{ paddingLeft: 16 }} mb={2}>• {item}</Text>
            ))}

            <Text size="xs" fw={600} c="blue.5" mb={4} mt={8}>
              <IconClock size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Today
            </Text>
            {brief.today.map((item, i) => (
              <Text key={i} size="xs" c="dimmed" style={{ paddingLeft: 16 }} mb={2}>• {item}</Text>
            ))}

            {brief.blockers.length > 0 && brief.blockers[0] !== "No blockers detected" && (
              <>
                <Text size="xs" fw={600} c="red.5" mb={4} mt={8}>
                  <IconAlertTriangle size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                  Blockers
                </Text>
                {brief.blockers.map((item, i) => (
                  <Text key={i} size="xs" c="dimmed" style={{ paddingLeft: 16 }} mb={2}>• {item}</Text>
                ))}
              </>
            )}
          </Section>
        )}

        {/* Work Patterns */}
        {patterns && (
          <Section title="Work Patterns">
            <Group gap={12} mb={12}>
              <Badge size="sm" variant="light" color="green">{patterns.completedThisWeek} done this week</Badge>
              <Badge size="sm" variant="light" color="gray">{patterns.completedLastWeek} last week</Badge>
              {patterns.avgCompletionHours > 0 && (
                <Badge size="sm" variant="outline" color="gray">~{patterns.avgCompletionHours}h avg</Badge>
              )}
              {patterns.meetingLoad > 0 && (
                <Badge size="sm" variant="light" color="orange">{patterns.meetingLoad} meetings pending</Badge>
              )}
            </Group>

            <Text size="xs" fw={500} c="dimmed" mb={6}>Task distribution</Text>
            {Object.entries(patterns.tasksByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
              const Icon = TYPE_ICONS[type] ?? IconCode;
              const pct = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
              return (
                <Group key={type} gap={8} mb={4} wrap="nowrap">
                  <Icon size={12} />
                  <Text size="xs" c="dimmed" style={{ width: 90 }}>{type}</Text>
                  <Progress value={pct} size={6} color="blue" style={{ flex: 1 }} />
                  <Text size="xs" c="dimmed" style={{ width: 30, textAlign: "right" }}>{pct}%</Text>
                </Group>
              );
            })}

            {patterns.bottleneckStage !== "none" && (
              <Group gap={6} mt={8}>
                <IconAlertTriangle size={12} color="var(--mantine-color-orange-5)" />
                <Text size="xs" c="dimmed">Bottleneck: <strong>{patterns.bottleneckStage}</strong> stage has the most active tasks</Text>
              </Group>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}
