/**
 * NextStepsCard — renders agent-defined actions as risk-tiered CTAs.
 * Low-risk: immediate click. Medium-risk: inline confirm. High-risk: editable preview.
 */

import { Button, Group, Loader, Stack, Text, Textarea, UnstyledButton } from "@mantine/core";
import {
  IconRocket, IconExternalLink, IconBrandSlack, IconMail,
  IconCalendar, IconGitPullRequest, IconCheck, IconClock,
  IconInfoCircle,
} from "@tabler/icons-react";
import { SiLinear } from "@icons-pack/react-simple-icons";
import { useState } from "react";
import type { Action, ActionRisk } from "../../shared/action-types";

// ── Exported helpers (tested) ──

const ICON_MAP: Record<string, string> = {
  run_skill: "rocket",
  update_linear: "linear",
  open_url: "external-link",
  send_slack: "slack",
  send_email: "mail",
  join_meeting: "calendar",
  review_pr: "git-pull-request",
  dismiss: "check",
  snooze: "clock",
  no_action: "info-circle",
};

export function getActionIcon(type: string): string {
  return ICON_MAP[type] ?? "info-circle";
}

export function getConfirmMessage(action: Action): string {
  if (action.type === "no_action") return "";
  const risk = (action as { risk: ActionRisk }).risk;
  if (risk === "low") return "";
  if (action.type === "run_skill") return `Run ${action.skill}${action.params?.phase ? ` phase ${action.params.phase}` : ""}?`;
  if (action.type === "update_linear") return `Set ${action.ticket} ${action.field} to "${action.value}"?`;
  return "";
}

// ── Icon resolver ──

function ActionTypeIcon({ type }: { type: string }) {
  const size = 16;
  switch (type) {
    case "run_skill": return <IconRocket size={size} />;
    case "update_linear": return <SiLinear size={size - 2} />;
    case "open_url": return <IconExternalLink size={size} />;
    case "send_slack": return <IconBrandSlack size={size} />;
    case "send_email": return <IconMail size={size} />;
    case "join_meeting": return <IconCalendar size={size} />;
    case "review_pr": return <IconGitPullRequest size={size} />;
    case "dismiss": return <IconCheck size={size} />;
    case "snooze": return <IconClock size={size} />;
    case "no_action": return <IconInfoCircle size={size} />;
    default: return <IconInfoCircle size={size} />;
  }
}

// ── Props ──

export interface NextStepsCardProps {
  actions: Action[];
  onRunSkill: (skill: string, params?: Record<string, unknown>) => void;
  onUpdateLinear: (ticket: string, field: string, value: string) => void;
  onSendSlack: (channel: string, message: string, threadTs?: string) => void;
  onSendEmail: (to: string, subject: string, body: string) => void;
  onOpenUrl: (url: string) => void;
  onDismiss: (reason?: string) => void;
  onSnooze: (reason?: string) => void;
}

// ── Action Row ──

function ActionRow({
  action,
  onExecute,
  onSendSlack,
  onSendEmail,
  disabled,
  executing,
}: {
  action: Action;
  onExecute: () => void;
  onSendSlack: (channel: string, message: string, threadTs?: string) => void;
  onSendEmail: (to: string, subject: string, body: string) => void;
  disabled: boolean;
  executing: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editedMessage, setEditedMessage] = useState("");

  const risk = action.type === "no_action" ? undefined : (action as { risk: ActionRisk }).risk;
  const confirmMsg = getConfirmMessage(action);

  const handleClick = () => {
    if (action.type === "no_action" || disabled || executing) return;
    if (risk === "low") { onExecute(); return; }
    if (risk === "medium") { setConfirming(true); return; }
    if (risk === "high") {
      if (action.type === "send_slack") setEditedMessage(action.message);
      if (action.type === "send_email") setEditedMessage(action.body);
      setExpanded(true);
    }
  };

  const handleSend = () => {
    setExpanded(false);
    if (action.type === "send_slack") {
      onSendSlack(action.channel, editedMessage, action.threadTs);
    } else if (action.type === "send_email") {
      onSendEmail(action.to, action.subject, editedMessage);
    }
  };

  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8,
      border: `1px solid color-mix(in srgb, var(--mantine-color-default-border) ${action.type === "no_action" ? "15%" : "30%"}, transparent)`,
      backgroundColor: action.type === "no_action" ? "transparent" : "var(--mantine-color-default)",
    }}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap={10} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <ActionTypeIcon type={action.type} />
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={500} truncate>{action.label}</Text>
            {"description" in action && action.description && (
              <Text size="xs" c="dimmed" lineClamp={2}>{action.description}</Text>
            )}
          </div>
        </Group>

        {action.type !== "no_action" && !confirming && !expanded && (
          executing ? (
            <Group gap={6} style={{ flexShrink: 0 }}>
              <Loader size={12} />
              <Text size="xs" c="dimmed">Running...</Text>
            </Group>
          ) : (
            <UnstyledButton
              onClick={handleClick}
              aria-label={action.label}
              disabled={disabled}
              style={{
                padding: "4px 12px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500,
                backgroundColor: disabled ? "var(--mantine-color-default-hover)"
                  : action.type === "dismiss" ? "var(--mantine-color-green-filled)"
                  : risk === "high" ? "var(--mantine-color-orange-filled)"
                  : "var(--mantine-color-blue-filled)",
                color: disabled ? "var(--mantine-color-dimmed)" : "white",
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
                flexShrink: 0,
              }}
            >
              {action.type === "dismiss" ? "Mark Done"
                : risk === "high" ? "Edit & Send"
                : risk === "medium" ? "Run"
                : action.type === "open_url" || action.type === "join_meeting" || action.type === "review_pr" ? "Open"
                : action.type === "send_slack" || action.type === "send_email" ? "Draft"
                : action.type === "run_skill" ? "Start"
                : action.type === "update_linear" ? "Update"
                : "View"}
            </UnstyledButton>
          )
        )}
      </Group>

      {/* Medium-risk: inline confirmation */}
      {confirming && (
        <Group gap={8} mt={8}>
          <Text size="xs" c="dimmed" style={{ flex: 1 }}>{confirmMsg}</Text>
          <Button size="xs" variant="filled" color="blue" onClick={() => { setConfirming(false); onExecute(); }}>
            Confirm
          </Button>
          <Button size="xs" variant="subtle" color="gray" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </Group>
      )}

      {/* High-risk: editable preview */}
      {expanded && (
        <Stack gap={8} mt={8}>
          {action.type === "send_slack" && (
            <>
              <Text size="xs" c="dimmed">Channel: {action.channel}{action.threadTs ? " (thread)" : ""}</Text>
              <Textarea
                value={editedMessage}
                onChange={(e) => setEditedMessage(e.currentTarget.value)}
                minRows={3}
                maxRows={8}
                autosize
                size="xs"
              />
            </>
          )}
          {action.type === "send_email" && (
            <>
              <Text size="xs" c="dimmed">To: {action.to}</Text>
              <Text size="xs" c="dimmed">Subject: {action.subject}</Text>
              <Textarea
                value={editedMessage}
                onChange={(e) => setEditedMessage(e.currentTarget.value)}
                minRows={3}
                maxRows={8}
                autosize
                size="xs"
              />
            </>
          )}
          <Group gap={8}>
            <Button size="xs" variant="filled" color="blue" onClick={handleSend}>
              Send
            </Button>
            <Button size="xs" variant="subtle" color="gray" onClick={() => setExpanded(false)}>
              Cancel
            </Button>
          </Group>
        </Stack>
      )}
    </div>
  );
}

// ── Main Component ──

export function NextStepsCard({
  actions,
  onRunSkill,
  onUpdateLinear,
  onSendSlack,
  onSendEmail,
  onOpenUrl,
  onDismiss,
  onSnooze,
}: NextStepsCardProps) {
  const [executingIndex, setExecutingIndex] = useState<number | null>(null);

  if (actions.length === 0) return null;

  const executeAction = (action: Action, index: number) => {
    // Only show loading for async actions (skills, updates, messages)
    const isAsync = action.type === "run_skill" || action.type === "update_linear" || action.type === "send_slack" || action.type === "send_email";
    if (isAsync) setExecutingIndex(index);

    switch (action.type) {
      case "run_skill": onRunSkill(action.skill, action.params); break;
      case "update_linear": onUpdateLinear(action.ticket, action.field, action.value); break;
      case "open_url": onOpenUrl(action.url); break;
      case "send_slack": onSendSlack(action.channel, action.message, action.threadTs); break;
      case "send_email": onSendEmail(action.to, action.subject, action.body); break;
      case "join_meeting": onOpenUrl(action.url); break;
      case "review_pr":
        // Review PRs should spin up the code-review skill, not just open a link
        onRunSkill("/code-review", { url: action.url });
        setExecutingIndex(index);
        break;
      case "dismiss": onDismiss(action.reason); break;
      case "snooze": onSnooze(action.reason); break;
      case "no_action": break;
    }
  };

  return (
    <div style={{
      padding: "14px 16px", borderRadius: 10,
      border: "1px solid color-mix(in srgb, var(--mantine-color-blue-5) 30%, transparent)",
      backgroundColor: "var(--mantine-color-blue-light)",
    }}>
      <Text size="xs" fw={600} mb={10} c="blue.4">Next Steps</Text>
      <Stack gap={8}>
        {actions.map((action, i) => (
          <ActionRow
            key={i}
            action={action}
            onExecute={() => executeAction(action, i)}
            onSendSlack={onSendSlack}
            onSendEmail={onSendEmail}
            disabled={executingIndex !== null && executingIndex !== i}
            executing={executingIndex === i}
          />
        ))}
      </Stack>
    </div>
  );
}
