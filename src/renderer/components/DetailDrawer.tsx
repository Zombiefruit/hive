/**
 * DetailDrawer — tabbed detail view for notifications.
 * Tabs: Agent | Plan | Context | Timeline
 * Replaces the monolithic DetailPane from notifications.tsx.
 */

import { Badge, Group, Loader, Menu, Tabs, Text, UnstyledButton } from "@mantine/core";
import { IconMessageCircle, IconFileText, IconDatabase, IconTimeline, IconExternalLink, IconBrandSlack, IconBrandGithub, IconMail, IconArrowUpRight, IconCode, IconChevronDown } from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentTab } from "./AgentTab";
import { PlanTab } from "./PlanTab";
import { ContextTab } from "./ContextTab";
import { TimelineTab } from "./TimelineTab";
import { WorkTab } from "./WorkTab";
import { ReviewTab } from "./ReviewTab";
import { RepoDetectionBanner, deriveBranch } from "./RepoDetectionBanner";
import { StartWorkModal } from "./StartWorkModal";
import { SubtaskList } from "./SubtaskList";
import { WorktreePanel } from "./WorktreePanel";
import { STAGE_META } from "../../shared/ui-constants";
import { getStageCTA, getStageAction, isHumanTask, isTerminalStage, skillToStage } from "../../shared/stage-machine";
import { detectRepo } from "../../shared/repo-detection";
import type { NextStepsCardProps } from "./NextStepsCard";

// ── Exported helpers (tested) ──

export type TabId = "agent" | "plan" | "work" | "review" | "context" | "timeline";

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
  const [initialLoading, setInitialLoading] = useState(true);
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
        if (!cancelled && Array.isArray(events)) {
          setActivity(events);
          // Extract conversation from cached text events
          const textEvents = events.filter((e: { type: string; content: string }) => e.type === "text" && e.content?.trim());
          if (textEvents.length > 0) {
            const combined = textEvents.map((e: { content: string }) => e.content).join("\n");
            setConversation(prev => {
              if (prev.length > 0) return prev;
              return [{ role: "assistant", content: combined }];
            });
            // If no plan was loaded but we have text output, use it as the plan
            setPlanText(prev => {
              if (prev) return prev;
              // Use the last substantive text event as the plan
              const lastText = textEvents[textEvents.length - 1]?.content ?? "";
              if (lastText.length > 100) {
                // Also persist it so it's available next time
                window.deck?.setPlan?.(n.id, {
                  plan: combined,
                  conversationHistory: [{ role: "assistant", content: combined }],
                  fetchedContext: [],
                });
                onPlanReady?.();
                return combined;
              }
              return prev;
            });
          }
        }
      } catch {}
      try {
        const running = await window.deck.isSkillRunning?.(n.id);
        if (!cancelled && running) {
          setSkillRunning(true);
          setLoading(true);
        }
      } catch {}
      // Auto-discover PR if task has a branch but no PR link
      const hasPrLink = (n.links ?? []).some(l => l.type === "github_pr");
      if (n.branch && !hasPrLink) {
        try {
          const prUrl = await window.deck.findPrForBranch?.(n.branch);
          if (!cancelled && prUrl) {
            window.deck?.updateNotificationById?.(n.id, {
              links: [...(n.links ?? []), { type: "github_pr", label: `PR ${prUrl.split("/").pop()}`, url: prUrl }],
            });
          }
        } catch (err) {
          console.error(`[DetailDrawer] findPrForBranch error:`, err);
        }
      }
      if (!cancelled) setInitialLoading(false);
    })();
    return () => { cancelled = true; };
  }, [n.id]);

  // ── Listen to live planning events ──
  useEffect(() => {
    const unsub = window.deck.onPlanningEvent?.((data: { notificationId: string; event: { type: string; content: string; timestamp: string } }) => {
      if (data.notificationId !== n.id) return;
      const evt = data.event;
      setActivity(prev => [...prev, evt]);

      // Agent initialized — mark as running so input becomes active
      if (evt.type === "init") {
        setSkillRunning(true);
        setLoading(true);
      }

      // Don't stream raw text during planning — it shows confusing partial results.
      // The final plan will be loaded when planning completes.
      // Only show text for non-planning events (e.g., user conversations with the agent).
      if (evt.type === "text" && !loading) {
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
        // Re-fetch the plan now that planning is complete
        window.deck.getPlan?.(n.id).then((plan: unknown) => {
          const p = plan as { plan?: string; conversationHistory?: Array<{ role: string; content: string }>; fetchedContext?: typeof fetchedContext } | null;
          if (p?.plan) {
            setPlanText(p.plan);
            if (p.conversationHistory) setConversation(p.conversationHistory);
            if (p.fetchedContext) setFetchedContext(p.fetchedContext);
            setActiveTab("plan");
          }
        }).catch(() => {});
      }

      if (evt.type === "error") {
        setLoading(false);
        setSkillRunning(false);
      }
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

    // If task is already planned (plan_review), run /hack to start coding.
    // Otherwise run /start-work to create a plan.
    const isApproveAndStart = n.stage === "plan_review" || n.stage === "hack";
    const skill = isApproveAndStart ? "/hack" : "/start-work";
    const targetStage = isApproveAndStart ? "hack" : "start_work";

    const slug = branch.replace(/^[^/]+\//, "");
    window.deck?.updateNotificationById?.(n.id, { stage: targetStage, repoPath, branch, workSlug: slug });

    // Write the plan to disk (.work/{slug}/plan.md) so /hack can find it
    if (isApproveAndStart && planText) {
      await window.deck.writePlan?.(repoPath, slug, planText).catch(() => {});
    }

    const ticketMatch = n.title.match(/^([A-Z]+-\d+)/);
    const ticketId = ticketMatch ? ticketMatch[1] : n.title;

    try {
      const result = await window.deck.runSkill({
        skill,
        args: ticketId,
        repoPath,
        sessionId: (n as unknown as { sessionId?: string }).sessionId ?? null,
        notificationId: n.id,
      });
      if (result && typeof result === "object") {
        const skillResult = result as { success: boolean; sessionId: string | null; resultText: string; error: string | null };
        if (skillResult.sessionId) {
          window.deck?.updateNotificationById?.(n.id, { sessionId: skillResult.sessionId });
        }
        if (!skillResult.success && skillResult.error) {
          // Skill failed — show error in conversation so user can see and retry
          setConversation(prev => [...prev, {
            role: "assistant",
            content: `**Skill failed:**\n\n${skillResult.error}\n\nUse "Re-run" to try again, or "Re-plan" to create a new plan.`,
          }]);
        } else {
          const readPlan = await window.deck.readPlan?.(repoPath, slug);
          if (readPlan) {
            setPlanText(readPlan as string);
            onPlanReady?.();
          }
          if (skillResult.resultText && !readPlan) {
            setConversation(prev => [...prev, { role: "assistant", content: skillResult.resultText }]);
          }
        }
      }
    } catch (err) {
      console.error("Start work failed:", err);
    }
    setSkillRunning(false);
    setLoading(false);
  }, [n.id, n.title]);

  const handlePrepare = useCallback(() => {
    setLoading(true);
    setActiveTab("agent");

    if (isHumanTask(n.taskType)) {
      // Human tasks: use prepareWorkPlan (MCP fetch + ephemeral planning)
      window.deck?.updateNotificationById?.(n.id, { stage: "preparing" });
      (async () => {
        try {
          const result = await window.deck.prepareWorkPlan({
            id: n.id, source: n.source, title: n.title, summary: n.summary, url: n.url,
            taskType: n.taskType, links: n.links,
          });
          const plan = result as { conversationHistory?: typeof conversation; plan?: string; fetchedContext?: typeof fetchedContext };
          if (plan?.conversationHistory) setConversation(plan.conversationHistory);
          if (plan?.fetchedContext) setFetchedContext(plan.fetchedContext);
          if (plan?.plan) {
            setPlanText(plan.plan);
            onPlanReady?.();
          }
        } catch {}
        setLoading(false);
      })();
    } else {
      // Implementation tasks: run the /start-work SKILL from the repo.
      // This creates a proper structured plan in .work/{slug}/plan.md
      // that /hack knows how to follow.
      window.deck?.updateNotificationById?.(n.id, { stage: "start_work" });
      const links = (n.links ?? []).filter((l: { url?: string }) => l.url);
      const urlInLinks = links.some((l: { url: string }) => l.url === n.url);
      const taskContext = [
        n.title,
        n.summary ?? "",
        !urlInLinks && n.url ? n.url : "",
        ...links.map((l: { url: string }) => l.url),
      ].filter(Boolean).join("\n");

      window.deck?.runSkill?.({
        skill: "/start-work",
        args: taskContext,
        repoPath: (n as unknown as { repoPath?: string }).repoPath ?? detectedRepo ?? "",
        sessionId: (n as unknown as { sessionId?: string }).sessionId ?? null,
        notificationId: n.id,
      }).then((result: unknown) => {
        const r = result as { success?: boolean; resultText?: string; sessionId?: string; error?: string | null } | undefined;
        if (r?.sessionId) {
          window.deck?.updateNotificationById?.(n.id, { sessionId: r.sessionId });
        }
        if (r?.success && r?.resultText && r.resultText.length > 200) {
          setPlanText(r.resultText);
          window.deck?.setPlan?.(n.id, {
            plan: r.resultText,
            conversationHistory: [{ role: "assistant", content: r.resultText }],
            fetchedContext: [],
          });
          window.deck?.updateNotificationById?.(n.id, { stage: "plan_review" });
          onPlanReady?.();
        } else if (r?.error) {
          setConversation(prev => [...prev, {
            role: "assistant",
            content: `**Planning failed:**\n\n${r.error}\n\nUse "Re-run" to try again.`,
          }]);
        }
        setLoading(false);
        setSkillRunning(false);
      }).catch(() => {
        setLoading(false);
        setSkillRunning(false);
      });
      return; // Don't clear loading synchronously — skill callback handles it
    }
  }, [n.id, n.taskType, detectedRepo]);

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
    onUpdateLinear: async (ticket, field, value) => {
      const effectiveTicket = ticket || n.title.match(/^([A-Z]+-\d+)/)?.[1] || "";
      const effectiveField = field || "status";
      const effectiveValue = value || "In Progress";
      if (!effectiveTicket) return;
      try {
        await window.deck.updateLinear?.(effectiveTicket, effectiveField, effectiveValue);
      } catch {}
    },
    onSendSlack: async (ch, msg, ts) => { await window.deck.sendSlackMessage?.(ch, ts ?? "", msg); },
    onSendEmail: () => {},
    onOpenUrl: (url) => window.deck.openExternal(url),
    onDismiss: () => { onDismiss(); },
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
          {n.author && n.author !== "Unknown" && <Text size="xs" c="dimmed">{n.author}</Text>}
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
      <style>{`
        .detail-tabs .mantine-Tabs-tab {
          color: var(--aegen-dust-gray);
          font-weight: 500;
        }
        .detail-tabs .mantine-Tabs-tab[data-active] {
          color: var(--aegen-star-white);
          background-color: rgba(74, 125, 255, 0.2);
          font-weight: 600;
        }
      `}</style>
      <Tabs
        variant="pills"
        value={activeTab}
        onChange={(v) => v && setActiveTab(v as TabId)}
        className="detail-tabs"
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
      >
        <Tabs.List style={{ flexShrink: 0, padding: "4px 12px", gap: 4 }}>
          <Tabs.Tab value="agent" leftSection={<IconMessageCircle size={14} />} rightSection={loading ? <Loader size={8} /> : undefined}>
            Agent
          </Tabs.Tab>
          <Tabs.Tab value="plan" leftSection={<IconFileText size={14} />} rightSection={planText ? <Badge size="xs" color="green" variant="filled" circle>✓</Badge> : undefined}>
            Plan
          </Tabs.Tab>
          {(n as unknown as { repoPath?: string }).repoPath && (
            <Tabs.Tab value="work" leftSection={<IconCode size={14} />}>
              Work
            </Tabs.Tab>
          )}
          {(n.stage === "code_review" || n.stage === "pr_feedback" || n.stage === "done") && (n as unknown as { workSlug?: string }).workSlug && (
            <Tabs.Tab value="review" leftSection={<IconFileText size={14} />}>
              Review
            </Tabs.Tab>
          )}
          <Tabs.Tab value="context" leftSection={<IconDatabase size={14} />} rightSection={(n.links?.length ?? 0) > 0 ? <Badge size="xs" variant="light" color="gray">{n.links?.length ?? 0}</Badge> : undefined}>
            Context
          </Tabs.Tab>
          <Tabs.Tab value="timeline" leftSection={<IconTimeline size={14} />}>
            Timeline
          </Tabs.Tab>
        </Tabs.List>

        {initialLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, gap: 8 }}>
            <Loader size={16} />
            <Text size="xs" c="dimmed">Loading task state...</Text>
          </div>
        ) : (
          <>
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

            <Tabs.Panel value="work" style={{ flex: 1, overflow: "auto" }}>
              <WorkTab
                repoPath={(n as unknown as { repoPath?: string }).repoPath}
                branch={n.branch}
                sessionId={(n as unknown as { sessionId?: string }).sessionId}
                workSlug={(n as unknown as { workSlug?: string }).workSlug}
              />
            </Tabs.Panel>

            <Tabs.Panel value="review" style={{ flex: 1, overflow: "auto" }}>
              <ReviewTab
                repoPath={(n as unknown as { repoPath?: string }).repoPath}
                workSlug={(n as unknown as { workSlug?: string }).workSlug}
                branch={n.branch}
                prUrl={(n.links ?? []).find(l => l.type === "github_pr")?.url}
              />
            </Tabs.Panel>

            <Tabs.Panel value="context" style={{ flex: 1, overflow: "auto" }}>
              <ContextTab items={fetchedContext} notificationLinks={n.links} onOpenUrl={(url) => window.deck.openExternal(url)} />
            </Tabs.Panel>

            <Tabs.Panel value="timeline" style={{ flex: 1, overflow: "auto" }}>
              <TimelineTab entries={n.timeline ?? []} />
            </Tabs.Panel>
          </>
        )}
      </Tabs>

      {/* Unified action bar — CTA + stage dropdown on one line */}
      {!loading && !skillRunning && !(n.subtaskIds && n.subtaskIds.length > 0) && n.stage !== "new" && !isTerminalStage(n.stage ?? "new") && (() => {
        const cta = getStageCTA(n.stage ?? "new", n.taskType);
        const currentStage = n.stage ?? "new";

        // Helper: run a skill-based stage
        const runStage = (targetStage: string) => {
          const stageAction = getStageAction(targetStage);
          if (targetStage === "start_work" || targetStage === "preparing") {
            window.deck?.clearPlan?.(n.id);
            window.deck?.updateNotificationById?.(n.id, { stage: targetStage });
            onPlanCleared?.();
            handlePrepare();
          } else if (targetStage === "hack" && !(n as unknown as { repoPath?: string }).repoPath) {
            setStartWorkOpen(true);
          } else if (stageAction?.skill) {
            setLoading(true);
            setSkillRunning(true);
            setActiveTab("agent");
            window.deck?.updateNotificationById?.(n.id, { stage: targetStage });
            const ticketMatch = n.title.match(/^([A-Z]+-\d+)/);
            const ticketId = ticketMatch ? ticketMatch[1] : n.title;
            window.deck?.runSkill?.({
              skill: stageAction.skill,
              args: ticketId,
              repoPath: (n as unknown as { repoPath?: string }).repoPath ?? "",
              sessionId: (n as unknown as { sessionId?: string }).sessionId ?? null,
              notificationId: n.id,
            }).then((result: unknown) => {
              const r = result as { success?: boolean; resultText?: string; sessionId?: string; error?: string | null } | undefined;
              if (r?.sessionId) window.deck?.updateNotificationById?.(n.id, { sessionId: r.sessionId });
              if (r?.resultText) {
                const prMatch = r.resultText.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/);
                if (prMatch && !(n.links ?? []).some(l => l.url === prMatch[0])) {
                  window.deck?.updateNotificationById?.(n.id, { links: [...(n.links ?? []), { type: "github_pr", label: `PR ${prMatch[0].split("/").pop()}`, url: prMatch[0] }] });
                }
                if (!r.success && r.error) setConversation(prev => [...prev, { role: "assistant", content: `**${stageAction.skill} failed:**\n\n${r.error}` }]);
              }
              if (stageAction.skill === "/ship" && n.branch) {
                window.deck?.findPrForBranch?.(n.branch).then((prUrl: string | null) => {
                  if (prUrl && !(n.links ?? []).some(l => l.url === prUrl)) {
                    window.deck?.updateNotificationById?.(n.id, { links: [...(n.links ?? []), { type: "github_pr", label: `PR ${prUrl.split("/").pop()}`, url: prUrl }] });
                  }
                }).catch(() => {});
              }
              setLoading(false);
              setSkillRunning(false);
            }).catch(() => { setLoading(false); setSkillRunning(false); });
          } else {
            window.deck?.updateNotificationById?.(n.id, { stage: targetStage });
            if (targetStage === "done") onDismiss();
          }
        };

        // Only show stages the task has reached or is at — don't show re-review if never shipped
        const AGENT_STAGE_ORDER = ["start_work", "hack", "ship", "code_review"];
        const currentIdx = AGENT_STAGE_ORDER.indexOf(currentStage);
        const reachableStages = isHumanTask(n.taskType)
          ? [{ key: "preparing", label: "Re-plan" }, { key: "ready", label: "Mark Ready" }]
          : AGENT_STAGE_ORDER
              .filter((_, i) => i <= Math.max(currentIdx, 0))
              .map(key => ({
                key,
                label: key === "start_work" ? "Re-plan" : key === "hack" ? "Re-hack" : key === "ship" ? "Re-ship" : "Re-review",
              }));

        return (
          <div style={{
            padding: "8px 20px",
            borderTop: "1px solid var(--aegen-glass-border)",
            flexShrink: 0,
            display: "flex", gap: 8, alignItems: "center",
          }}>
            {/* Primary CTA */}
            {cta && (
              <UnstyledButton
                onClick={() => runStage(cta.targetStage)}
                style={{
                  padding: "6px 14px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600,
                  backgroundColor: cta.targetStage === "done" || cta.targetStage === "hack"
                    ? "var(--mantine-color-green-filled)" : "var(--mantine-color-blue-filled)",
                  color: "white",
                }}
              >
                {cta.label}
              </UnstyledButton>
            )}

            {/* Stage dropdown */}
            <Menu shadow="md" width={180} position="top-start">
              <Menu.Target>
                <UnstyledButton style={{
                  padding: "6px 10px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500,
                  border: "1px solid var(--aegen-glass-border)", color: "var(--aegen-dust-gray)",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <IconChevronDown size={12} />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                {reachableStages.map(s => (
                  <Menu.Item key={s.key} onClick={() => runStage(s.key)} style={{ fontSize: "0.8rem" }}>
                    {s.label}
                  </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item
                  onClick={() => { window.deck?.clearPlan?.(n.id); window.deck?.updateNotificationById?.(n.id, { stage: "new" }); onPlanCleared?.(); }}
                  style={{ fontSize: "0.8rem", color: "var(--mantine-color-dimmed)" }}
                >
                  Reset to Inbox
                </Menu.Item>
                <Menu.Item onClick={onDismiss} style={{ fontSize: "0.8rem", color: "var(--mantine-color-dimmed)" }}>
                  Archive
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        );
      })()}

      {/* CTA for new stage (no dropdown needed) */}
      {!loading && !skillRunning && n.stage === "new" && !(n.subtaskIds && n.subtaskIds.length > 0) && (() => {
        const cta = getStageCTA("new", n.taskType);
        if (!cta) return null;
        return (
          <div style={{ padding: "8px 20px", borderTop: "1px solid var(--aegen-glass-border)", flexShrink: 0 }}>
            <UnstyledButton
              onClick={() => handlePrepare()}
              style={{ padding: "6px 14px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600, backgroundColor: "var(--mantine-color-blue-filled)", color: "white" }}
            >
              {cta.label}
            </UnstyledButton>
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
