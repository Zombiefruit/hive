import { useMemo } from "react";
import { IconFileText } from "@tabler/icons-react";
import { PlanView } from "./PlanView";
import { Markdown } from "./Markdown";
import { parsePlanMd } from "../../shared/plan-parser";
import { EmptyState } from "./shared";

interface PlanTabProps {
  planText: string | null;
}

export function PlanTab({ planText }: PlanTabProps) {
  const parsedPlan = useMemo(() => (planText ? parsePlanMd(planText) : null), [planText]);
  const hasPhases = parsedPlan && parsedPlan.phases.length > 0;

  // No plan text at all → empty state
  if (!planText) {
    return <EmptyState icon={IconFileText} message="No plan yet." detail="Start work from the Agent tab." />;
  }

  // Phased implementation plan → structured PlanView
  if (hasPhases) {
    return (
      <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
        <PlanView plan={parsedPlan} />
      </div>
    );
  }

  // Non-phased plan (response/meeting_prep agent output) → render as markdown
  return (
    <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
      <Markdown content={planText} />
    </div>
  );
}

/** Check if plan text contains actual implementation plan phases (not just response context). */
export function hasPlanPhases(planText: string | null): boolean {
  if (!planText) return false;
  const parsed = parsePlanMd(planText);
  return parsed.phases.length > 0;
}
