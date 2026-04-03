import { useMemo } from "react";
import { Badge, Group, Stack, Text } from "@mantine/core";
import { IconFileText, IconShieldCheck, IconAlertTriangle, IconShieldX } from "@tabler/icons-react";
import { PlanView } from "./PlanView";
import { Markdown } from "./Markdown";
import { parsePlanMd } from "../../shared/plan-parser";
import { EmptyState } from "./shared";
import type { PlanVerdict } from "../../shared/judge-types";

interface PlanTabProps {
  planText: string | null;
  verdict?: PlanVerdict | null;
}

function VerdictPanel({ verdict }: { verdict: PlanVerdict }) {
  const statusColor = verdict.status === "approved" ? "green"
    : verdict.status === "concerns" ? "yellow" : "red";
  const StatusIcon = verdict.status === "approved" ? IconShieldCheck
    : verdict.status === "concerns" ? IconAlertTriangle : IconShieldX;

  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8, marginBottom: 12,
      backgroundColor: `color-mix(in srgb, var(--mantine-color-${statusColor}-light) 30%, transparent)`,
      border: `1px solid color-mix(in srgb, var(--mantine-color-${statusColor}-5) 30%, transparent)`,
    }}>
      <Group gap={8} mb={4}>
        <StatusIcon size={14} color={`var(--mantine-color-${statusColor}-5)`} />
        <Text size="xs" fw={600} c={`${statusColor}.5`} style={{ textTransform: "uppercase" }}>
          {verdict.status}
        </Text>
        <Badge size="xs" variant="light" color="gray">
          {verdict.confidence}/10 confidence
        </Badge>
        {verdict.durationMs > 0 && (
          <Text size="xs" c="dimmed">{Math.round(verdict.durationMs / 1000)}s</Text>
        )}
      </Group>
      <Text size="xs" c="dimmed" mb={6}>{verdict.summary}</Text>

      {(verdict.feasibilityScore > 0 || verdict.completenessScore > 0) && (
        <Group gap={12} mb={6}>
          <Text size="xs" c="dimmed">
            Feasibility: <strong>{verdict.feasibilityScore}/10</strong>
          </Text>
          <Text size="xs" c="dimmed">
            Completeness: <strong>{verdict.completenessScore}/10</strong>
          </Text>
        </Group>
      )}

      {verdict.concerns.length > 0 && (
        <Stack gap={4} mt={6}>
          {verdict.concerns.map((c, i) => (
            <Group key={i} gap={6} align="flex-start" wrap="nowrap">
              <Badge
                size="xs"
                variant="light"
                color={c.severity === "blocker" ? "red" : c.severity === "warning" ? "yellow" : "blue"}
                style={{ flexShrink: 0 }}
              >
                {c.severity}
              </Badge>
              <Text size="xs" c="dimmed" lineClamp={2}>
                {c.description}{c.suggestion ? ` → ${c.suggestion}` : ""}
              </Text>
            </Group>
          ))}
        </Stack>
      )}

      {verdict.risks.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <Text size="xs" fw={500} c="dimmed">Risks:</Text>
          {verdict.risks.map((r, i) => (
            <Text key={i} size="xs" c="dimmed" style={{ paddingLeft: 8 }}>• {r}</Text>
          ))}
        </div>
      )}

      {verdict.missingSteps.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <Text size="xs" fw={500} c="dimmed">Missing steps:</Text>
          {verdict.missingSteps.map((s, i) => (
            <Text key={i} size="xs" c="dimmed" style={{ paddingLeft: 8 }}>• {s}</Text>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlanTab({ planText, verdict }: PlanTabProps) {
  const parsedPlan = useMemo(() => (planText ? parsePlanMd(planText) : null), [planText]);
  const hasPhases = parsedPlan && parsedPlan.phases.length > 0;

  // No plan text at all → empty state
  if (!planText) {
    return <EmptyState icon={IconFileText} message="No plan yet." detail="Start work from the Agent tab." />;
  }

  return (
    <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
      {verdict && <VerdictPanel verdict={verdict} />}
      {hasPhases ? <PlanView plan={parsedPlan} /> : <Markdown content={planText} />}
    </div>
  );
}

/** Check if plan text contains actual implementation plan phases (not just response context). */
export function hasPlanPhases(planText: string | null): boolean {
  if (!planText) return false;
  const parsed = parsePlanMd(planText);
  return parsed.phases.length > 0;
}
