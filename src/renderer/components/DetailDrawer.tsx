/**
 * DetailDrawer — tabbed detail view for notifications.
 * Tabs: Agent | Plan | Context | Timeline
 * Replaces the monolithic DetailPane from notifications.tsx.
 */

import { Badge, Group, Loader, Tabs, Text, UnstyledButton } from "@mantine/core";
import { IconMessageCircle, IconFileText, IconDatabase, IconTimeline } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentTab } from "./AgentTab";
import { PlanTab } from "./PlanTab";
import { ContextTab } from "./ContextTab";
import { TimelineTab } from "./TimelineTab";
import { RepoDetectionBanner, deriveBranch } from "./RepoDetectionBanner";
import { StartWorkModal } from "./StartWorkModal";
import { STAGE_META } from "../../shared/ui-constants";
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
}

interface DetailDrawerProps {
  notification: NotificationItem;
  onClose: () => void;
  onDismiss: () => void;
  onPlanReady?: () => void;
  onPlanCleared?: () => void;
  config: { repoMappings?: Array<{ pattern: string; repoPath: string }>; name?: string; linearUsername?: string } | null;
}

// ── Component ──

export function DetailDrawer({
  notification: n,
  onClose,
  onDismiss,
  onPlanReady,
  onPlanCleared,
  config,
}: DetailDrawerProps) {
  // ── State ──
  const [activeTab, setActiveTab] = useState<TabId>("agent");
  const [conversation, setConversation] = useState<Array<{ role: string; content: string }>>([]);
  const [activity, setActivity] = useState<Array<{ type: string; content: string; timestamp: string }>>([]);
  const [fetchedContext, setFetchedContext] = useState<Array<{ type: string; content: string; timestamp: string }>>([]);
  const [planText, setPlanText] = useState<string | null>(null);
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
          const p = plan as { conversationHistory?: Array<{ role: string; content: string }>; plan?: string; fetchedContext?: typeof fetchedContext };
          if (p.conversationHistory) setConversation(p.conversationHistory);
          if (p.plan) setPlanText(p.plan);
          if (p.fetchedContext) setFetchedContext(p.fetchedContext);
          onPlanReady?.();
        }
      } catch {}
      try {
        const events = await window.deck.getPlanningEvents?.(n.id);
        if (!cancelled && Array.isArray(events)) setActivity(events);
      } catch {}
      try {
        const running = await window.deck.isSkillRunning?.(n.id);
        if (!cancelled) setSkillRunning(!!running);
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
    const isHuman = n.taskType === "response" || n.taskType === "meeting_prep";
    if (!isHuman) {
      if (detectedRepo) {
        handleStartWork(detectedRepo, suggestedBranch);
        return;
      }
      setStartWorkOpen(true);
      return;
    }
    setLoading(true);
    setActiveTab("agent");
    window.deck?.updateNotificationById?.(n.id, { stage: "preparing" });
    (async () => {
      try {
        const result = await window.deck.prepareWorkPlan({
          id: n.id, source: n.source, title: n.title, summary: n.summary, url: n.url,
          taskType: n.taskType, links: n.links,
        });
        const plan = result as { conversationHistory?: typeof conversation; fetchedContext?: typeof fetchedContext };
        if (plan?.conversationHistory) setConversation(plan.conversationHistory);
        if (plan?.fetchedContext) setFetchedContext(plan.fetchedContext);
        window.deck?.updateNotificationById?.(n.id, { stage: "ready" });
      } catch {}
      setLoading(false);
    })();
  }, [n.id, n.taskType, detectedRepo, suggestedBranch]);

  // ── Action handlers for NextStepsCard ──
  const actionHandlers: Omit<NextStepsCardProps, "actions"> = {
    onRunSkill: async (skill, params) => {
      const nextStage = skill === "/hack" ? "hack" : skill === "/ship" ? "ship" : skill === "/code-review" ? "code_review" : undefined;
      if (nextStage) window.deck?.updateNotificationById?.(n.id, { stage: nextStage });
      setLoading(true);
      setSkillRunning(true);
      try {
        await window.deck.runSkill({
          skill, args: params?.phase ? `phase ${params.phase}` : "",
          repoPath: n.repoPath ?? "", sessionId: n.sessionId ?? null, notificationId: n.id,
        });
      } catch (err) { console.error(`Skill ${skill} failed:`, err); }
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--mantine-color-body)" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}>
        <Group justify="space-between" mb={4}>
          <Group gap="xs">
            <Badge size="xs" style={{ backgroundColor: stageConfig.color, color: "white" }}>{stageConfig.label}</Badge>
            {n.priority && <Badge size="xs" variant="dot" color={n.priority === "critical" ? "red" : n.priority === "high" ? "yellow" : n.priority === "medium" ? "blue" : "gray"}>{n.priority}</Badge>}
          </Group>
          <UnstyledButton onClick={onClose} aria-label="Close detail pane">
            <Text size="xs" c="dimmed">Close</Text>
          </UnstyledButton>
        </Group>
        <Text size="sm" fw={600} mb={4}>{n.title}</Text>
        {n.summary && <Text size="xs" c="dimmed" mb={4} lineClamp={2}>{n.summary}</Text>}

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

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(v) => v && setActiveTab(v as TabId)} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <Tabs.List style={{ flexShrink: 0 }}>
          <Tabs.Tab value="agent" leftSection={<IconMessageCircle size={14} />} rightSection={loading ? <Loader size={8} /> : undefined}>
            Agent
          </Tabs.Tab>
          <Tabs.Tab value="plan" leftSection={<IconFileText size={14} />} rightSection={planText ? <Badge size="xs" color="green" variant="filled" circle>✓</Badge> : undefined}>
            Plan
          </Tabs.Tab>
          <Tabs.Tab value="context" leftSection={<IconDatabase size={14} />} rightSection={fetchedContext.length > 0 ? <Badge size="xs" variant="light" color="gray">{fetchedContext.length}</Badge> : undefined}>
            Context
          </Tabs.Tab>
          <Tabs.Tab value="timeline" leftSection={<IconTimeline size={14} />}>
            Timeline
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="agent" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <AgentTab
            notificationId={n.id}
            conversation={conversation}
            activity={activity}
            loading={loading}
            skillRunning={skillRunning}
            onSendMessage={handleSendMessage}
            actionHandlers={actionHandlers}
          />
        </Tabs.Panel>

        <Tabs.Panel value="plan" style={{ flex: 1, overflow: "auto" }}>
          <PlanTab planText={planText} />
        </Tabs.Panel>

        <Tabs.Panel value="context" style={{ flex: 1, overflow: "auto" }}>
          <ContextTab items={fetchedContext} onOpenUrl={(url) => window.deck.openExternal(url)} />
        </Tabs.Panel>

        <Tabs.Panel value="timeline" style={{ flex: 1, overflow: "auto" }}>
          <TimelineTab entries={n.timeline ?? []} />
        </Tabs.Panel>
      </Tabs>

      {/* Action bar — Start Work / Rerun / Dismiss */}
      {!loading && (n.stage === "new" || n.stage === "skipped") && conversation.length === 0 && (
        <div style={{
          padding: "8px 20px",
          borderTop: "1px solid var(--mantine-color-default-border)",
          flexShrink: 0,
          display: "flex", gap: 8,
        }}>
          <UnstyledButton
            onClick={handlePrepare}
            style={{
              padding: "6px 12px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600,
              backgroundColor: "var(--mantine-color-blue-5)", color: "white",
            }}
          >
            Start Work
          </UnstyledButton>
          <UnstyledButton onClick={onDismiss} style={{ padding: "6px 12px", borderRadius: 6, fontSize: "0.75rem", color: "var(--mantine-color-dimmed)" }}>
            Dismiss
          </UnstyledButton>
        </div>
      )}

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
