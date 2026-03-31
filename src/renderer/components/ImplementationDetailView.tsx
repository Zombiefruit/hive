import { Stack, Text, Group, Badge, Loader } from "@mantine/core";
import {
  IconPlayerPlay,
  IconRocket,
  IconGitPullRequest,
  IconTool,
  IconEye,
  IconCheck,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { ActionButton } from "./ActionButton";
import { PlanView } from "./PlanView";
import { ReviewView } from "./ReviewView";
import { parsePlanMd } from "../../shared/plan-parser";
import { parseReviewMd } from "../../shared/review-parser";
import { parseActions } from "../../shared/action-parser";
import { NextStepsCard } from "./NextStepsCard";

interface ImplementationDetailViewProps {
  notification: {
    id: string;
    title: string;
    stage?: string;
    repoPath?: string;
    branch?: string;
    workSlug?: string;
    taskType?: string;
  };
  fetchedContext: Array<{ type: string; content: string; timestamp: string }>;
  planText: string | null;
  agentOutput: string | null;
  reviewTexts: string[];
  onStartWork: () => void;
  onStartHack: () => void;
  onReviewPlan: () => void;
  onShip: () => void;
  onCodeReview: () => void;
  onFixFindings: (findingIds: string[]) => void;
  onRunSkill: (skill: string, params?: Record<string, unknown>) => void;
  onUpdateLinear: (ticket: string, field: string, value: string) => void;
  onOpenUrl: (url: string) => void;
  onDismiss: (reason?: string) => void;
  onSnooze: (reason?: string) => void;
  loading: boolean;
}

function ActivityLog({ events }: { events: Array<{ type: string; content: string; timestamp: string }> }) {
  return (
    <Stack gap={6}>
      <Text size="xs" fw={600} c="dimmed">
        Activity
      </Text>
      {events.map((event, i) => (
        <Group key={i} gap={8} wrap="nowrap" align="flex-start">
          <Text
            size="xs"
            c="dimmed"
            style={{ fontSize: "0.6rem", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {event.timestamp}
          </Text>
          <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
            {event.type}
          </Badge>
          <Text size="xs" style={{ fontSize: "0.7rem" }}>
            {event.content}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

export function ImplementationDetailView({
  notification,
  fetchedContext,
  planText,
  agentOutput,
  reviewTexts,
  onStartWork,
  onStartHack,
  onReviewPlan,
  onShip,
  onCodeReview,
  onFixFindings,
  onRunSkill,
  onUpdateLinear,
  onOpenUrl,
  onDismiss,
  onSnooze,
  loading,
}: ImplementationDetailViewProps) {
  const stage = notification.stage ?? "new";
  const repoLabel = notification.repoPath ?? "target repo";

  const parsedPlan = useMemo(
    () => (planText ? parsePlanMd(planText) : null),
    [planText],
  );

  const actions = useMemo(
    () => parseActions(agentOutput ?? planText ?? ""),
    [agentOutput, planText],
  );

  const parsedReview = useMemo(
    () => (reviewTexts.length > 0 ? parseReviewMd(reviewTexts[0]) : null),
    [reviewTexts],
  );

  const renderStageContent = () => {
    switch (stage) {
      // ─── New ───────────────────────────────────────────────────
      case "new":
        return (
          <ActionButton
            label="Start Work"
            description={`Runs /start-work in ${repoLabel} \u2014 discovers relevant code and creates a phased plan. No code changes.`}
            onClick={onStartWork}
            icon={<IconPlayerPlay size={14} />}
            loading={loading}
          />
        );

      // ─── Start Work (planning) ────────────────────────────────
      case "start_work": {
        return (
          <Stack gap={16}>
            {loading && !planText && (
              <Group gap={8}>
                <Loader size={16} />
                <Text size="sm" c="dimmed">
                  Planning...
                </Text>
              </Group>
            )}

            {parsedPlan && (
              <PlanView
                plan={parsedPlan}
                onStartHack={onStartHack}
                onReviewPlan={onReviewPlan}
              />
            )}

            {actions.length > 0 ? (
              <NextStepsCard
                actions={actions}
                onRunSkill={onRunSkill}
                onUpdateLinear={onUpdateLinear}
                onSendSlack={() => {}}
                onSendEmail={() => {}}
                onOpenUrl={onOpenUrl}
                onDismiss={onDismiss}
                onSnooze={onSnooze}
              />
            ) : (
              <ActionButton
                label="Start Hack"
                description={`Runs /hack in ${repoLabel} \u2014 implements plan phases, runs tests, commits per task. No PRs created yet.`}
                onClick={onStartHack}
                icon={<IconPlayerPlay size={14} />}
                disabled={!parsedPlan}
                loading={loading}
              />
            )}
          </Stack>
        );
      }

      // ─── Plan Review ──────────────────────────────────────────
      case "plan_review":
        return (
          <Stack gap={16}>
            {parsedReview && (
              <ReviewView review={parsedReview} />
            )}

            <ActionButton
              label="Proceed to Hack"
              description="Plan review complete. Proceeding runs /hack to start implementation."
              onClick={onStartHack}
              icon={<IconPlayerPlay size={14} />}
              loading={loading}
            />
          </Stack>
        );

      // ─── Hack (building) ──────────────────────────────────────
      case "hack":
        return (
          <Stack gap={16}>
            {loading && (
              <Group gap={8}>
                <Loader size={16} />
                <Text size="sm" c="dimmed">
                  Building...
                </Text>
              </Group>
            )}

            {parsedPlan && <PlanView plan={parsedPlan} />}

            <ActionButton
              label="Ship"
              description="Runs /ship \u2014 verifies code, pushes branch, opens PR. Moves Linear ticket to In Review."
              onClick={onShip}
              color="#16a34a"
              icon={<IconRocket size={14} />}
              disabled={loading}
              loading={loading}
            />
          </Stack>
        );

      // ─── Ship ─────────────────────────────────────────────────
      case "ship":
        return (
          <Stack gap={16}>
            {notification.branch && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--mantine-color-default-border)",
                  backgroundColor: "var(--mantine-color-dark-7)",
                }}
              >
                <Text size="xs" c="dimmed" mb={4}>
                  Pull Request
                </Text>
                <Text
                  size="xs"
                  style={{
                    fontFamily: "var(--mantine-font-family-monospace)",
                    fontSize: "0.75rem",
                  }}
                >
                  {notification.branch}
                </Text>
                {notification.repoPath && (
                  <Text size="xs" c="dimmed" mt={2} style={{ fontSize: "0.65rem" }}>
                    {notification.repoPath}
                  </Text>
                )}
              </div>
            )}

            <ActionButton
              label="Run Code Review"
              description="Runs /code-review \u2014 parallel reviewer agents check security, architecture, testing, correctness."
              onClick={onCodeReview}
              icon={<IconGitPullRequest size={14} />}
              loading={loading}
            />
          </Stack>
        );

      // ─── Code Review ──────────────────────────────────────────
      case "code_review":
        return (
          <Stack gap={16}>
            {parsedReview && (
              <ReviewView
                review={parsedReview}
                onFixSelected={onFixFindings}
                onPostToPR={onCodeReview}
              />
            )}

            <ActionButton
              label="Fix Selected"
              description="Runs /handle-pr-feedback \u2014 applies fixes for checked findings, runs tests, commits. You review before push."
              onClick={() => onFixFindings([])}
              icon={<IconTool size={14} />}
              loading={loading}
            />
          </Stack>
        );

      // ─── Done ─────────────────────────────────────────────────
      case "done":
        return (
          <Stack gap={12}>
            <Group gap={8}>
              <IconCheck size={20} color="#22c55e" />
              <Text size="sm" fw={600} c="green">
                Task complete
              </Text>
            </Group>

            {notification.branch && (
              <Text
                size="xs"
                style={{
                  fontFamily: "var(--mantine-font-family-monospace)",
                  fontSize: "0.7rem",
                }}
              >
                Branch: {notification.branch}
              </Text>
            )}
          </Stack>
        );

      default:
        return null;
    }
  };

  const stageContent = renderStageContent();

  // Fallback: if there is no stage-specific content but we have context events, show the activity log.
  const showFallback = !stageContent && fetchedContext.length > 0;

  return (
    <Stack gap={16}>
      {stageContent}

      {showFallback && <ActivityLog events={fetchedContext} />}

      {/* Always show activity log below stage content if events exist and we already have content */}
      {stageContent && fetchedContext.length > 0 && (
        <ActivityLog events={fetchedContext} />
      )}
    </Stack>
  );
}
