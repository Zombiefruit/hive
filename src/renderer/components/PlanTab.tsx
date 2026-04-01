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

  if (!parsedPlan) {
    return <EmptyState icon={IconFileText} message="No plan yet." detail="Start work from the Agent tab to generate a plan." />;
  }

  return (
    <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
      <PlanView plan={parsedPlan} />
    </div>
  );
}
