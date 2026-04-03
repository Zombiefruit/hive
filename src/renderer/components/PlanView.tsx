import { Badge, Group, Stack, Text, UnstyledButton, Progress } from "@mantine/core";
import {
  IconChevronRight,
  IconChevronDown,
  IconCheck,
  IconCircle,
  IconPlayerPlay,
  IconEye,
} from "@tabler/icons-react";
import { useState } from "react";
import type { ParsedPlan } from "../../shared/plan-parser";

interface PlanViewProps {
  plan: ParsedPlan;
  onStartHack?: () => void;
  onReviewPlan?: () => void;
}

export function PlanView({ plan, onStartHack, onReviewPlan }: PlanViewProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set([1])); // First phase expanded by default
  const [showFiles, setShowFiles] = useState(false);

  const togglePhase = (num: number) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  const progressPct = plan.totalTasks > 0 ? Math.round((plan.completedTasks / plan.totalTasks) * 100) : 0;

  const scopeColor = plan.scope === "Large" ? "red" : plan.scope === "Medium" ? "yellow" : "green";

  return (
    <Stack gap={12}>
      {/* Header */}
      <div>
        <Group gap={8} mb={6}>
          {plan.ticket && (
            <Badge size="sm" variant="light" color="violet">
              {plan.ticket}
            </Badge>
          )}
          {plan.scope && (
            <Badge size="sm" variant="dot" color={scopeColor}>
              {plan.scope} scope
            </Badge>
          )}
          {plan.status && (
            <Badge size="sm" variant="outline" color="gray">
              {plan.status}
            </Badge>
          )}
        </Group>
        {plan.branch && (
          <Text
            size="xs"
            c="dimmed"
            style={{ fontFamily: "var(--mantine-font-family-monospace)", fontSize: "0.7rem" }}
          >
            {plan.branch}
          </Text>
        )}
      </div>

      {/* Progress */}
      <div>
        <Group justify="space-between" mb={4}>
          <Text size="xs" c="dimmed">
            Progress
          </Text>
          <Text size="xs" c="dimmed">
            {plan.completedTasks}/{plan.totalTasks} tasks ({progressPct}%)
          </Text>
        </Group>
        <Progress value={progressPct} size="sm" color={progressPct === 100 ? "green" : "blue"} />
      </div>

      {/* Relevant Files (collapsible) */}
      {plan.relevantFiles.length > 0 && (
        <div>
          <UnstyledButton
            onClick={() => setShowFiles(!showFiles)}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            {showFiles ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
            <Text size="xs" c="dimmed" fw={600}>
              Relevant Files ({plan.relevantFiles.length})
            </Text>
          </UnstyledButton>
          {showFiles && (
            <div
              style={{
                marginTop: 6,
                padding: "8px 12px",
                borderRadius: 6,
                background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)",
                fontSize: "0.7rem",
              }}
            >
              {plan.relevantFiles.map((f, i) => (
                <Group key={i} gap={8} mb={2}>
                  <Text
                    size="xs"
                    style={{
                      fontFamily: "var(--mantine-font-family-monospace)",
                      color: "var(--mantine-color-blue-4)",
                    }}
                  >
                    {f.path}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {f.purpose}
                  </Text>
                </Group>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Phases */}
      <Stack gap={6}>
        {plan.phases.map((phase) => {
          const expanded = expandedPhases.has(phase.number);
          const phaseComplete = phase.tasks.every((t) => t.checked);
          const phaseDone = phase.tasks.filter((t) => t.checked).length;
          return (
            <div
              key={phase.number}
              style={{
                border: "1px solid rgba(68, 73, 85, 0.2)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <UnstyledButton
                onClick={() => togglePhase(phase.number)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: phaseComplete
                    ? "rgba(38, 191, 126, 0.06)"
                    : "transparent",
                }}
              >
                {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                <Text size="sm" fw={500} style={{ flex: 1 }}>
                  Phase {phase.number}: {phase.name}
                </Text>
                <Badge size="xs" variant="light" color={phaseComplete ? "green" : "gray"}>
                  {phaseDone}/{phase.tasks.length}
                </Badge>
              </UnstyledButton>
              {expanded && (
                <div style={{ padding: "8px 12px 12px" }}>
                  <Stack gap={4}>
                    {phase.tasks.map((task) => (
                      <Group key={task.id} gap={8} wrap="nowrap" align="flex-start">
                        {task.checked ? (
                          <IconCheck size={14} color="var(--mantine-color-green-filled)" style={{ flexShrink: 0, marginTop: 2 }} />
                        ) : (
                          <IconCircle
                            size={14}
                            color="var(--mantine-color-dimmed)"
                            style={{ flexShrink: 0, marginTop: 2 }}
                          />
                        )}
                        <div>
                          <Text
                            size="xs"
                            style={{
                              fontFamily: "var(--mantine-font-family-monospace)",
                              fontSize: "0.7rem",
                              color: task.checked
                                ? "var(--mantine-color-dimmed)"
                                : "var(--mantine-color-text)",
                              textDecoration: task.checked ? "line-through" : "none",
                            }}
                          >
                            {task.commitMessage}
                          </Text>
                          {task.description && (
                            <Text size="xs" c="dimmed" style={{ fontSize: "0.65rem" }}>
                              {task.description}
                            </Text>
                          )}
                        </div>
                      </Group>
                    ))}
                  </Stack>
                </div>
              )}
            </div>
          );
        })}
      </Stack>

      {/* Actions */}
      <Group gap={8} mt={4}>
        {onStartHack && (
          <UnstyledButton
            onClick={onStartHack}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              fontSize: "0.8rem",
              fontWeight: 600,
              backgroundColor: "var(--mantine-color-green-filled)",
              color: "var(--mantine-color-white)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <IconPlayerPlay size={14} /> Start Hack
          </UnstyledButton>
        )}
        {onReviewPlan && (
          <UnstyledButton
            onClick={onReviewPlan}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              fontSize: "0.8rem",
              fontWeight: 500,
              border: "1px solid rgba(68, 73, 85, 0.2)",
              color: "var(--mantine-color-text)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <IconEye size={14} /> Review Plan
          </UnstyledButton>
        )}
      </Group>
    </Stack>
  );
}
