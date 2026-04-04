/**
 * DetailDrawer — tabbed detail view for notifications.
 * Tabs: Agent | Plan | Context | Timeline
 * Replaces the monolithic DetailPane from notifications.tsx.
 */

import { Badge, Group, Loader, Tabs, Text, UnstyledButton } from "@mantine/core";
import { IconMessageCircle, IconFileText, IconDatabase, IconTimeline, IconExternalLink, IconBrandSlack, IconBrandGithub, IconMail, IconArrowUpRight } from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentTab } from "./AgentTab";
import { PlanTab } from "./PlanTab";
import { ContextTab } from "./ContextTab";
import { TimelineTab } from "./TimelineTab";
import { RepoDetectionBanner, deriveBranch } from "./RepoDetectionBanner";
import { StartWorkModal } from "./StartWorkModal";
import { SubtaskList } from "./SubtaskList";
import { WorktreePanel } from "./WorktreePanel";
import { STAGE_META } from "../../shared/ui-constants";
import { getStageCTA, getStageAction, isHumanTask, skillToStage } from "../../shared/stage-machine";
import { detectRepo } from "../../shared/repo-detection";
import type { NextStepsCardProps } from "./NextStepsCard";

// ── Exported helpers (tested) ──

export type TabId = "agent" | "plan" | "context" | "timeline";

export function getDefaultTab(state: { hasConversation: boolean; hasPlan: boolean; isLoading: boolean }): TabId {
  if (state.hasConversation || state.isLoading) return "agent";
  if (state.hasPlan) return "plan";
  return "agent";
}

// ── Types ──

interface NotificationItem {
  id: string;
  source: string;
  priority: string;
  title: string;
  summary: string;
  url?: string;
  links?: Array<{ type: string; label: string; url: string }>;
  taskType?: string;
  author?: string;
  stage?: string;
  timeline?: Array<{ timestamp: string; event: string }>;
  repoPath?: string;
  sessionId?: string;
  workSlug?: string;
  branch?: string;
  actionNeeded?: string;
  parentTaskId?: string;
  subtaskIds?: string[];
}

interface DetailDrawerProps {
  notification: NotificationItem;
  onClose: () => void;
  onDismiss: () => void;
  onPlanReady?: () => void;
  onPlanCleared?: () => void;
  config: { repoMappings?: Array<{ pattern: string; repoPath: string }>; name?: string; linearUsername?: string } | null;
  /** Map of all notifications by ID — used to look up subtask/parent details. */
  notificationMap?: Map<string, NotificationItem>;
  /** Called when user wants to navigate to a different notification (e.g. parent or subtask). */
  onSelectNotification?: (id: string) => void;
}

// ── Component ──

export function DetailDrawer({
  notification: n,
  onClose,
  onDismiss,
  onPlanReady,
  onPlanCleared,
  config,
  notificationMap,
  onSelectNotification,
}: DetailDrawerProps) {
  // ── State ──
  const [activeTab, setActiveTab] = useState<TabId>("agent");
  const [conversation, setConversation] = useState<Array<{ role: string; content: string }>>([]);
  const [activity, setActivity] = useState<Array<{ type: string; content: string; timestamp: string }>>([]);
  const [fetchedContext, setFetchedContext] = useState<Array<{ type: string; content: string; timestamp: string }>>([]);
  const [planText, setPlanText] = useState<string | null>(null);
  const [planVerdict, setPlanVerdict] = useState<{ status: string; confidence: number; summary: string; concerns: Array<{ severity: string; category: string; description: string; suggestion?: string }>; feasibilityScore: number; completenessScore: number; risks: string[]; missingSteps: string[]; durationMs: number; type: "plan"; judgedAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [skillRunning, setSkillRunning] = useState(false);
  const [startWorkOpen, setStartWorkOpen] = useState(false);
  const sendingRef = useRef(false);

  // ── Repo detection ──
  const username = config?.linearUsername ?? config?.name?.split(" ")[0]?.toLowerCase() ?? "user";
  const detectedRepo = detectRepo({ title: n.title, links: n.links ?? [] }, config?.repoMappings ?? []);
  const suggestedBranch = deriveBranch(n.title, username);

  // ── Load existing plan + events on mount ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const plan = await window.deck.getPlan?.(n.id);
        if (cancelled) return;
        if (plan) {
          const p = plan as { conversationHistory?: Array<{ role: string; content: string }>; plan?: string; fetchedContext?: typeof fetchedContext; verdict?: typeof planVerdict };
          if (p.conversationHistory) setConversation(p.conversationHistory);
          if (p.plan) setPlanText(p.plan);
          if (p.fetchedContext) setFetchedContext(p.fetchedContext);
          if (p.verdict) setPlanVerdict(p.verdict);
          onPlanReady?.();
        }
      } catch {}
      try {
        const events = await window.deck.getPlanningEvents?.(n.id);
        if (!cancelled && Array.isArray(events)) setActivity(events);
      } catch {}
      try {
        const running = await window.deck.isSkillRunning?.(n.id);
        if (!cancelled && running) {
          setSkillRunning(true);
          setLoading(true);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [n.id]);

  // ── Listen to live planning events ──
  useEffect(() => {
    const unsub = window.deck.onPlanningEvent?.((data: { notificationId: string; event: { type: string; content: string; timestamp: string } }) => {
      if (data.notificationId !== n.id) return;
      const evt = data.event;
      setActivity(prev => [...prev, evt]);

      if (evt.type === "text") {
        setConversation(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return [...prev.slice(0, -1), { role: "assistant", content: last.content + "\n" + evt.content }];
          }
          return [...prev, { role: "assistant", content: evt.content }];
        });
      }

      if (evt.type === "result") {
        setLoading(false);
        setSkillRunning(false);
      }

      if (evt.type === "error") {
        setLoading(false);
      }

      if (activeTab !== "agent") setActiveTab("agent");
    });
    return () => { unsub?.(); };
  }, [n.id, activeTab]);

  // ── Set default tab ──
  useEffect(() => {
    setActiveTab(getDefaultTab({
      hasConversation: conversation.length > 0,
      hasPlan: !!planText,
      isLoading: loading,
    }));
  }, []);

  // ── Handlers ──

  const handleSendMessage = useCallback(async (message: string) => {
    setConversation(prev => [...prev, { role: "user", content: message }]);
    setLoading(true);
    sendingRef.current = true;
    try {
      const isRunning = await window.deck.isSkillRunning?.(n.id);
      if (isRunning) {
        await window.deck.sendToSkill?.(n.id, message);
        setSkillRunning(true);
      } else {
        const result = await window.deck.iteratePlan(n.id, message);
        const plan = result as { conversationHistory?: typeof conversation };
        if (plan?.conversationHistory) setConversation(plan.conversationHistory);
      }
    } catch {}
    sendingRef.current = false;
    setLoading(false);
  }, [n.id]);

  const handleStartWork = useCallback(async (repoPath: string, branch: string) => {
    if (!repoPath?.trim()) return;
    setStartWorkOpen(false);
    setLoading(true);
    setSkillRunning(true);
    setActiveTab("agent");
    window.deck?.updateNotificationById?.(n.id, { stage: "start_work", repoPath, branch });

    const ticketMatch = n.title.match(/^([A-Z]+-\d+)/);
    const ticketId = ticketMatch ? ticketMatch[1] : n.title;

    try {
      const result = await window.deck.runSkill({
        skill: "/start-work",
        args: ticketId,
        repoPath,
        sessionId: null,
        notificationId: n.id,
      });
      if (result && typeof result === "object") {
        const skillResult = result as { success: boolean; sessionId: string | null; resultText: string };
        if (skillResult.sessionId) {
          window.deck?.updateNotificationById?.(n.id, { sessionId: skillResult.sessionId });
        }
        const slug = branch.replace(/^[^/]+\//, "");
        const readPlan = await window.deck.readPlan?.(repoPath, slug);
        if (readPlan) {
          setPlanText(readPlan as string);
          window.deck?.updateNotificationById?.(n.id, { workSlug: slug });
          onPlanReady?.();
        }
        if (skillResult.resultText && !readPlan) {
          setConversation(prev => [...prev, { role: "assistant", content: skillResult.resultText }]);
        }
      }
    } catch (err) {
      console.error("Start work failed:", err);
    }
    setSkillRunning(false);
    setLoading(false);
  }, [n.id, n.title]);

  const handlePrepare = useCallback(() => {
    // "Move to Planning" always starts the planning phase — context gathering + plan creation.
    // Repo selection happens later when moving from Planning → Hacking.
    setLoading(true);
    setActiveTab("agent");
    const isHuman = n.taskType === "response" || n.taskType === "meeting_prep";
    window.deck?.updateNotificationById?.(n.id, { stage: isHuman ? "preparing" : "start_work" });
    (async () => {
      try {
        const result = await window.deck.prepareWorkPlan({
          id: n.id, source: n.source, title: n.title, summary: n.summary, url: n.url,
          taskType: n.taskType, links: n.links,
        });
        const plan = result as { conversationHistory?: typeof conversation; fetchedContext?: typeof fetchedContext };
        if (plan?.conversationHistory) setConversation(plan.conversationHistory);
        if (plan?.fetchedContext) setFetchedContext(plan.fetchedContext);
        window.deck?.updateNotificationById?.(n.id, { stage: isHuman ? "ready" : "plan_review" });
      } catch {}
      setLoading(false);
    })();
  }, [n.id, n.taskType, detectedRepo, suggestedBranch]);

  // ── Action handlers for NextStepsCard ──
  const actionHandlers: Omit<NextStepsCardProps, "actions"> = {
    onRunSkill: async (skill, params) => {
      // If the agent suggests /start-work but a plan already exists, run /hack instead.
      // This happens when the planning agent's output suggests "Run /start-work" even
      // though the plan is complete and the task should advance to hacking.
      let effectiveSkill = skill;
      if (skill === "/start-work" && (n.stage === "plan_review" || n.stage === "start_work") && planText) {
        effectiveSkill = "/hack";
      }

      const nextStage = skillToStage(effectiveSkill) ?? undefined;
      if (nextStage) window.deck?.updateNotificationById?.(n.id, { stage: nextStage });
      setLoading(true);
      setSkillRunning(true);
      setActiveTab("agent");
      try {
        await window.deck.runSkill({
          skill: effectiveSkill, args: params?.phase ? `phase ${params.phase}` : "",
          repoPath: n.repoPath ?? "", sessionId: n.sessionId ?? null, notificationId: n.id,
        });
      } catch (err) { console.error(`Skill ${effectiveSkill} failed:`, err); }
      setSkillRunning(false);
      setLoading(false);
    },
    onUpdateLinear: async (ticket, field, value) => { await window.deck.updateLinear?.(ticket, field, value); },
    onSendSlack: async (ch, msg, ts) => { await window.deck.sendSlackMessage?.(ch, ts ?? "", msg); },
    onSendEmail: () => {},
    onOpenUrl: (url) => window.deck.openExternal(url),
    onDismiss: () => { window.deck?.updateNotificationById?.(n.id, { stage: "done" }); onDismiss(); },
    onSnooze: () => { window.deck?.updateNotificationById?.(n.id, { stage: "backlog" }); },
  };

  // ── Render ──

  const stageConfig = STAGE_META[n.stage as keyof typeof STAGE_META] ?? { label: n.stage ?? "new", color: "#6b7280" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--aegen-gradient-surface)", backdropFilter: "var(--aegen-glass-blur)" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--aegen-glass-border)", flexShrink: 0 }}>
        <Group justify="space-between" mb={4}>
          <Group gap="xs">
            <Badge size="xs" style={{ backgroundColor: stageConfig.color, color: "white" }}>{stageConfig.label}</Badge>
            {n.priority && <Badge size="xs" variant="light" color={n.priority === "critical" ? "red" : n.priority === "high" ? "yellow" : n.priority === "medium" ? "blue" : "cyan"}>{n.priority}</Badge>}
          </Group>
          <UnstyledButton onClick={onClose} aria-label="Close detail pane">
            <Text size="xs" c="dimmed">Close</Text>
          </UnstyledButton>
        </Group>
        {/* Subtask: "Part of" parent link */}
        {n.parentTaskId && notificationMap && (
          <UnstyledButton
            onClick={() => onSelectNotification?.(n.parentTaskId!)}
            style={{
              display: "flex", alignItems: "center", gap: 4, marginBottom: 4,
              fontSize: "0.65rem", color: "var(--mantine-color-violet-4)",
            }}
          >
            <IconArrowUpRight size={10} />
            <span>Part of: {notificationMap.get(n.parentTaskId)?.title ?? n.parentTaskId}</span>
          </UnstyledButton>
        )}
        <Text size="sm" fw={600} mb={2}>{n.title}</Text>
        <Group gap={6} mb={4}>
          {n.author && <Text size="xs" c="dimmed">{n.author}</Text>}
          <Text size="xs" c="dimmed" style={{ fontSize: "0.55rem", fontFamily: "var(--mantine-font-family-monospace)", opacity: 0.5 }}>{n.id}</Text>
        </Group>
        {n.summary && <Text size="xs" c="dimmed" mb={4} lineClamp={2}>{n.summary}</Text>}

        {/* Quick context links */}
        {(n.links?.length || n.url) && (
          <Group gap={6} mb={8} wrap="wrap">
            {(n.links ?? []).map((link, i) => {
              const Icon = link.type === "linear" ? SiLinear as React.FC<{ size?: number }>
                : link.type === "slack_thread" || link.type === "slack_dm" ? IconBrandSlack
                : link.type === "github_pr" ? IconBrandGithub
                : link.type === "notion" ? SiNotion as React.FC<{ size?: number }>
                : IconExternalLink;
              return (
                <UnstyledButton
                  key={i}
                  onClick={() => window.deck.openExternal(link.url)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "2px 8px", borderRadius: 4, fontSize: "0.65rem",
                    background: "rgba(74, 125, 255, 0.08)",
                    color: "var(--mantine-color-blue-4)",
                  }}
                >
                  <Icon size={10} />
                  <span>{link.label}</span>
                </UnstyledButton>
              );
            })}
            {n.url && !(n.links ?? []).some(l => l.url === n.url) && (
              <UnstyledButton
                onClick={() => window.deck.openExternal(n.url!)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 4, fontSize: "0.65rem",
                  background: "rgba(74, 125, 255, 0.08)",
                  color: "var(--mantine-color-blue-4)",
                }}
              >
                <IconExternalLink size={10} />
                <span>Source</span>
              </UnstyledButton>
            )}
          </Group>
        )}

        {/* Repo detection banner */}
        {detectedRepo && (n.stage === "new" || !n.repoPath) && (
          <RepoDetectionBanner
            repoPath={detectedRepo}
            branch={suggestedBranch}
            source={n.source}
            onChangeRepo={() => setStartWorkOpen(true)}
          />
        )}
      </div>

      {/* Worktree info */}
      {n.repoPath && n.branch && (
        <div style={{ padding: "0 20px 8px", flexShrink: 0 }}>
          <WorktreePanel repoPath={n.repoPath} branch={n.branch} sessionId={n.sessionId} />
        </div>
      )}

      {/* Parent task: subtask list */}
      {n.subtaskIds && n.subtaskIds.length > 0 && notificationMap && (
        <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--aegen-glass-border)", flexShrink: 0 }}>
          <Text size="xs" fw={600} c="dimmed" mb={4}>
            {n.subtaskIds.filter(id => notificationMap.get(id)?.stage === "done").length} of {n.subtaskIds.length} subtasks done
          </Text>
          <SubtaskList
            subtasks={n.subtaskIds.map(id => {
              const child = notificationMap.get(id);
              return { id, title: child?.title ?? id, stage: child?.stage ?? "new" };
            })}
            onSelect={(childId) => onSelectNotification?.(childId)}
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs
        variant="pills"
        value={activeTab}
        onChange={(v) => v && setActiveTab(v as TabId)}
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
        styles={{
          tab: {
            color: "var(--aegen-dust-gray)",
            "&[data-active]": {
              color: "var(--aegen-star-white)",
              backgroundColor: "rgba(74, 125, 255, 0.15)",
            },
          },
        }}
      >
        <Tabs.List style={{ flexShrink: 0, padding: "4px 12px", gap: 4 }}>
          <Tabs.Tab value="agent" leftSection={<IconMessageCircle size={14} />} rightSection={loading ? <Loader size={8} /> : undefined}>
            Agent
          </Tabs.Tab>
          <Tabs.Tab value="plan" leftSection={<IconFileText size={14} />} rightSection={planText ? <Badge size="xs" color="green" variant="filled" circle>✓</Badge> : undefined}>
            Plan
          </Tabs.Tab>
          <Tabs.Tab value="context" leftSection={<IconDatabase size={14} />} rightSection={(n.links?.length ?? 0) > 0 ? <Badge size="xs" variant="light" color="gray">{n.links?.length ?? 0}</Badge> : undefined}>
            Context
          </Tabs.Tab>
          <Tabs.Tab value="timeline" leftSection={<IconTimeline size={14} />}>
            Timeline
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="agent" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <AgentTab
            notificationId={n.id}
            stage={n.stage}
            conversation={conversation}
            activity={activity}
            loading={loading}
            skillRunning={skillRunning}
            onSendMessage={handleSendMessage}
            actionHandlers={actionHandlers}
          />
        </Tabs.Panel>

        <Tabs.Panel value="plan" style={{ flex: 1, overflow: "auto" }}>
          <PlanTab planText={planText} verdict={planVerdict as import("../../shared/judge-types").PlanVerdict | null} />
        </Tabs.Panel>

        <Tabs.Panel value="context" style={{ flex: 1, overflow: "auto" }}>
          <ContextTab items={fetchedContext} notificationLinks={n.links} onOpenUrl={(url) => window.deck.openExternal(url)} />
        </Tabs.Panel>

        <Tabs.Panel value="timeline" style={{ flex: 1, overflow: "auto" }}>
          <TimelineTab entries={n.timeline ?? []} />
        </Tabs.Panel>
      </Tabs>

      {/* Stage CTA — single action bar derived from stage machine */}
      {!loading && !skillRunning && !(n.subtaskIds && n.subtaskIds.length > 0) && (() => {
        const cta = getStageCTA(n.stage ?? "new", n.taskType);
        if (!cta) return null;

        const action = getStageAction(cta.targetStage);

        return (
          <div style={{
            padding: "8px 20px",
            borderTop: "1px solid var(--aegen-glass-border)",
            flexShrink: 0,
            display: "flex", gap: 8,
          }}>
            <UnstyledButton
              onClick={() => {
                if (action?.usePlanAgent) {
                  // Planning — needs repo selection for agent tasks
                  if (isHumanTask(n.taskType)) {
                    // Human tasks: start preparing directly
                    window.deck?.updateNotificationById?.(n.id, { stage: cta.targetStage });
                    window.deck?.prepareWorkPlan?.({
                      id: n.id, title: n.title, summary: n.summary,
                      taskType: n.taskType, source: n.source, priority: n.priority,
                      links: n.links, actionNeeded: n.actionNeeded,
                    }).catch(() => {});
                  } else {
                    // Agent tasks: may need repo selection
                    handlePrepare();
                  }
                } else if (action?.skill) {
                  // Skill-based stage — run the skill
                  window.deck?.updateNotificationById?.(n.id, { stage: cta.targetStage });
                  window.deck?.runSkill?.({
                    skill: action.skill,
                    args: "",
                    repoPath: (n as unknown as { repoPath?: string }).repoPath ?? "",
                    sessionId: (n as unknown as { sessionId?: string }).sessionId ?? null,
                    notificationId: n.id,
                  }).catch((err: unknown) => console.error(`[${cta.targetStage}] runSkill failed:`, err));
                } else {
                  // No agent/skill — just advance the stage (e.g. ready → done)
                  window.deck?.updateNotificationById?.(n.id, { stage: cta.targetStage });
                  if (cta.targetStage === "done") onDismiss();
                }
              }}
              style={{
                padding: "6px 14px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600,
                backgroundColor: cta.targetStage === "done" ? "var(--mantine-color-green-filled)"
                  : cta.targetStage === "hack" ? "var(--mantine-color-green-filled)"
                  : "var(--mantine-color-blue-filled)",
                color: "white",
              }}
            >
              {cta.label}
            </UnstyledButton>
            {n.stage !== "ready" && (
              <UnstyledButton onClick={onDismiss} style={{ padding: "6px 12px", borderRadius: 6, fontSize: "0.75rem", color: "var(--mantine-color-dimmed)" }}>
                Dismiss
              </UnstyledButton>
            )}
          </div>
        );
      })()}

      {/* StartWorkModal fallback */}
      <StartWorkModal
        opened={startWorkOpen}
        onClose={() => setStartWorkOpen(false)}
        onConfirm={handleStartWork}
        notification={{ id: n.id, title: n.title, source: n.source, taskType: n.taskType, links: n.links }}
        detectedRepo={detectedRepo}
        suggestedBranch={suggestedBranch}
        repoOptions={(config?.repoMappings ?? []).map(m => ({ value: m.repoPath, label: m.repoPath.split("/").pop() ?? m.repoPath }))}
      />
    </div>
  );
}
