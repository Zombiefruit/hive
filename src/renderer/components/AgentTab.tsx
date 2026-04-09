/**
 * AgentTab — hybrid chat/log with sticky input.
 * Zone 1: Chat bubbles (agent questions highlighted)
 * Zone 2: NextStepsCard (from structured actions)
 * Zone 3: Compact activity log (collapsible)
 * Zone 4: Sticky input (routes to skill process or MCP bridge)
 */

import { Group, Loader, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronRight, IconSend } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { ChatBubble, isQuestion } from "./ChatBubble";
import { NextStepsCard, type NextStepsCardProps } from "./NextStepsCard";
import { parseActions } from "../../shared/action-parser";
import type { Action } from "../../shared/action-types";
import { Markdown } from "./Markdown";
import { isTerminalStage, STAGE_ACTIONS } from "../../shared/stage-machine";

// ── Exported helpers (tested) ──

export function shouldAutoExpand(loading: boolean, eventCount: number): boolean {
  return loading && eventCount > 0;
}

/** Derive display actions from raw parsed actions + task state. */
export function deriveActions(rawActions: Action[], stage?: string): Action[] {
  const allNoAction = rawActions.length > 0 && rawActions.every(a => a.type === "no_action");
  const isDone = isTerminalStage(stage ?? "new");
  if (allNoAction && !isDone) {
    return [...rawActions, { type: "dismiss" as const, label: "Mark Done", reason: "No action needed", risk: "low" as const }];
  }
  return rawActions;
}

/**
 * Get the empty state message for the Agent tab. Returns null when the stage
 * implies an active agent process — in those cases the loading spinner should
 * show instead of static text.
 */
export function getEmptyStateMessage(stage?: string): string | null {
  // Stages where an agent is actively running — never show static empty text
  const action = STAGE_ACTIONS[stage ?? ""];
  if (action?.inProgress) return null;
  if (stage === "new" || stage === "skipped") {
    return 'Click "Move to Planning" to begin.';
  }
  if (stage === "plan_review") {
    return "Plan ready — switch to the Plan tab to review.";
  }
  return "No conversation yet.";
}

export function getInputPlaceholder(skillRunning: boolean, hasConversation: boolean): string {
  if (skillRunning) return "Reply to agent...";
  if (hasConversation) return "Push back, ask questions, or refine the plan...";
  return "Start work to begin a conversation...";
}

// ── Types ──

interface AgentTabProps {
  notificationId: string;
  stage?: string;
  conversation: Array<{ role: string; content: string }>;
  activity: Array<{ type: string; content: string; timestamp: string }>;
  loading: boolean;
  skillRunning: boolean;
  onSendMessage: (message: string) => void;
  actionHandlers: Omit<NextStepsCardProps, "actions">;
}

// ── Component ──

export function AgentTab({
  notificationId,
  stage,
  conversation,
  activity,
  loading,
  skillRunning,
  onSendMessage,
  actionHandlers,
}: AgentTabProps) {
  const [feedback, setFeedback] = useState("");
  const [showActivity, setShowActivity] = useState(activity.length > 0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-expand activity when events arrive
  useEffect(() => {
    if (activity.length > 0 && !showActivity) setShowActivity(true);
  }, [activity.length]);

  // Auto-scroll conversation
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation.length, loading]);

  const handleSend = () => {
    if (!feedback.trim()) return;
    onSendMessage(feedback.trim());
    setFeedback("");
  };

  // Parse actions from last assistant message.
  // During work stages (hack, ship, etc.), filter out run_skill actions (those
  // duplicate the plan flow) but keep side-effect actions (update_linear,
  // send_slack, open_url, etc.) — those are useful regardless of stage.
  const lastAssistant = [...conversation].reverse().find(m => m.role === "assistant");
  const rawActions = lastAssistant ? parseActions(lastAssistant.content) : [];
  const WORK_STAGES = new Set(["hack", "ship", "code_review", "pr_feedback", "done"]);
  const inWorkStage = WORK_STAGES.has(stage ?? "");
  const filteredActions = inWorkStage
    ? rawActions.filter(a => {
        if (a.type === "run_skill") return false;
        // Filter "Move to In Progress" once we're past planning — already in progress
        if (a.type === "update_linear") {
          const p = (a as unknown as { params?: Record<string, string> }).params;
          const val = a.value || p?.value || "";
          if (/in.progress/i.test(val)) return false;
        }
        return true;
      })
    : rawActions;
  const noActionText = lastAssistant && filteredActions.length === 0 && rawActions.length === 0 &&
    /no action needed|already responded|already replied/i.test(lastAssistant.content);
  const effectiveActions = noActionText
    ? [{ type: "no_action" as const, label: "No action needed" }]
    : filteredActions;
  const actions = deriveActions(effectiveActions, stage);

  const hasConversation = conversation.length > 0;
  const inputDisabled = !skillRunning && !hasConversation;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Zone 1: Conversation */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {/* Empty state — stage aware */}
        {conversation.length === 0 && !loading && activity.length === 0 && (() => {
          const msg = getEmptyStateMessage(stage);
          if (!msg) return null; // Active stages show the loader below instead
          return (
            <Stack align="center" py="xl" gap="sm">
              <Text size="sm" c="dimmed">{msg}</Text>
            </Stack>
          );
        })()}

        {/* Loading at top when no conversation yet — also show for active stages during mount race */}
        {!hasConversation && (loading || (activity.length === 0 && getEmptyStateMessage(stage) === null)) && (
          <Stack align="center" py="sm" gap={6}>
            <Loader size={16} />
            <Text size="sm" c="dimmed" ta="center">
              {stage === "start_work" ? "Planning — connecting to your tools..."
                : stage === "preparing" ? "Gathering context from Slack, Linear, and other sources..."
                : stage === "plan_review" ? "Loading plan..."
                : stage === "hack" ? "Agent is working..."
                : "Working..."}
            </Text>
            {activity.length > 0 && (
              <>
                <Text size="xs" c="dimmed" ta="center" truncate style={{ maxWidth: "90%" }}>
                  {activity[activity.length - 1].content}
                </Text>
                {activity.length > 1 && (
                  <Text size="xs" c="dimmed" ta="center" style={{ opacity: 0.5 }}>
                    {activity.length} events
                  </Text>
                )}
              </>
            )}
          </Stack>
        )}

        {conversation.map((msg, i) => {
          if (msg.role === "user") {
            return <ChatBubble key={i} role="user" content={msg.content} />;
          }
          // Assistant messages — render with Markdown, split at "---"
          const content = msg.content;
          if (content.includes("\n---\n")) {
            const parts = content.split("\n---\n");
            const tldr = parts[0].trim();
            const details = parts.slice(1).join("\n---\n").trim();
            return (
              <div key={i} style={{
                padding: "10px 14px", borderRadius: 8, marginBottom: 8,
                background: "var(--aegen-glass-bg)",
                backdropFilter: "var(--aegen-glass-blur)",
                border: "1px solid var(--aegen-glass-border)",
              }}>
                <Markdown content={tldr} />
                {details && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer", fontSize: "0.75rem", color: "var(--mantine-color-dimmed)" }}>
                      Show details
                    </summary>
                    <div style={{ marginTop: 8 }}>
                      <Markdown content={details} />
                    </div>
                  </details>
                )}
              </div>
            );
          }
          // Regular assistant message — use Markdown, not raw text
          return (
            <div key={i} style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 8,
              background: "var(--aegen-glass-bg)",
              backdropFilter: "var(--aegen-glass-blur)",
              border: isQuestion(content)
                ? "1px solid rgba(255, 170, 51, 0.25)"
                : "1px solid var(--aegen-glass-border)",
            }}>
              <Markdown content={content} />
            </div>
          );
        })}

        {/* Loading indicator after conversation */}
        {loading && hasConversation && (
          <Group gap={8} py={8}>
            <Loader size={14} />
            <Text size="xs" c="dimmed">Thinking...</Text>
          </Group>
        )}

        {/* Zone 2: NextStepsCard */}
        {actions.length > 0 && !loading && (
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <NextStepsCard actions={actions} {...actionHandlers} />
          </div>
        )}
      </div>

      {/* Zone 3: Activity log (collapsible) */}
      {activity.length > 0 && (
        <div style={{ borderTop: "1px solid var(--aegen-glass-border)" }}>
          <UnstyledButton
            onClick={() => setShowActivity(!showActivity)}
            aria-label={showActivity ? "Collapse activity" : "Expand activity"}
            style={{
              width: "100%", padding: "6px 20px",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <IconChevronRight
              size={10}
              style={{ transform: showActivity ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
            />
            <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem" }}>
              Activity ({activity.length})
            </Text>
            {loading && <Loader size={10} />}
          </UnstyledButton>
          {showActivity && (
            <div style={{
              padding: "0 20px 8px", maxHeight: 200, overflowY: "auto",
              fontSize: "0.7rem", fontFamily: "var(--mantine-font-family-monospace)", lineHeight: 1.5,
            }}>
              {activity.slice(-20).map((evt, i) => {
                const color = evt.type === "error" ? "var(--mantine-color-red-5)"
                  : evt.type === "tool_use" ? "var(--mantine-color-blue-5)"
                  : evt.type === "init" ? "var(--mantine-color-green-5)"
                  : evt.type === "verdict" ? "var(--mantine-color-violet-5)"
                  : evt.type === "escalation" ? "var(--mantine-color-orange-5)"
                  : "var(--mantine-color-dimmed)";
                return (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "1px 8px" }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: color, marginTop: 6, flexShrink: 0 }} />
                    <Text size="xs" c="dimmed" style={{ fontSize: "0.65rem" }} truncate>{evt.content}</Text>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Zone 4: Sticky input */}
      <div style={{
        padding: "10px 20px",
        borderTop: "1px solid var(--aegen-glass-border)",
        flexShrink: 0,
      }}>
        <Group gap="xs">
          <input
            type="text"
            placeholder={getInputPlaceholder(skillRunning, hasConversation)}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !inputDisabled) handleSend(); }}
            disabled={inputDisabled || loading}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 6, fontSize: "0.8rem",
              backgroundColor: "var(--aegen-glass-bg)",
              border: "1px solid var(--aegen-glass-border)",
              color: "var(--aegen-star-white)", outline: "none",
              fontFamily: "inherit",
              opacity: inputDisabled ? 0.5 : 1,
            }}
          />
          <UnstyledButton
            onClick={handleSend}
            disabled={!feedback.trim() || inputDisabled || loading}
            aria-label="Send message"
            style={{
              padding: "8px", borderRadius: 6,
              backgroundColor: feedback.trim() && !inputDisabled ? "var(--aegen-cosmic-blue)" : "var(--aegen-glass-bg)",
              color: feedback.trim() && !inputDisabled ? "white" : "var(--mantine-color-dimmed)",
            }}
          >
            <IconSend size={14} />
          </UnstyledButton>
        </Group>
      </div>
    </div>
  );
}
