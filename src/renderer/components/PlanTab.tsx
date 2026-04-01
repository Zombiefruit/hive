import { useMemo } from "react";
import { IconFileText } from "@tabler/icons-react";
import { PlanView } from "./PlanView";
import { parsePlanMd } from "../../shared/plan-parser";
import { EmptyState } from "./shared";

interface PlanTabProps {
  planText: string | null;
}

export function PlanTab({ planText }: PlanTabProps) {
  const parsedPlan = useMemo(() => (planText ? parsePlanMd(planText) : null), [planText]);

  // Only show plan if it has actual phases/tasks — not for response/meeting_prep text
  if (!parsedPlan || parsedPlan.phases.length === 0) {
    return <EmptyState icon={IconFileText} message="No implementation plan." detail="Implementation tasks get a phased plan from /start-work." />;
  }

  return (
    <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
      <PlanView plan={parsedPlan} />
    </div>
  );
}

/** Check if plan text contains actual implementation plan phases (not just response context). */
export function hasPlanPhases(planText: string | null): boolean {
  if (!planText) return false;
  const parsed = parsePlanMd(planText);
  return parsed.phases.length > 0;
}
