import { Badge, Group, Stack, Text, UnstyledButton, Tooltip } from "@mantine/core";
import { IconFolder, IconChevronRight, IconChevronLeft, IconBrandGithub, IconHash, IconMail, IconFileText, IconExternalLink, IconCheck } from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { GlobalLoadingBanner } from "../components/GlobalLoadingBanner";
import { usePollStatus } from "../hooks/usePollStatus";
import type { Project } from "../../shared/project-model";
import { STAGE_ORDER } from "../../shared/task-utils";
import { STAGE_META, SOURCE_COLORS } from "../../shared/ui-constants";
import { formatTimeSince, EmptyState } from "../components/shared";

// --- Notification shape (matches poll-service output) ---
interface NotificationItem {
  id: string;
  source: string;
  title: string;
  priority?: string;
  summary?: string;
  url?: string;
  links?: Array<{ type: string; label: string; url: string }>;
  author?: string;
  confidence?: number;
  stage?: string;
  timeline?: Array<{ timestamp: string; event: string }>;
}

// --- Source icons + colors ---
const sourceIcons: Record<string, React.FC<{ size?: number; color?: string }>> = {
  linear: SiLinear as React.FC<{ size?: number; color?: string }>,
  slack: IconHash,
  github: IconBrandGithub,
  notion: SiNotion as React.FC<{ size?: number; color?: string }>,
  email: IconMail,
};

const sourceColors = SOURCE_COLORS;

// --- Stage display config (from shared ui-constants) ---
const STAGE_LABELS: Record<string, { label: string; color: string }> = Object.fromEntries(
  Object.entries(STAGE_META).map(([key, meta]) => [key, { label: meta.label, color: meta.color }]),
);

/** Find the most recent timeline event across a set of notifications. */
function latestActivity(notifications: NotificationItem[]): { timestamp: string; event: string } | null {
  let latest: { timestamp: string; event: string } | null = null;
  for (const n of notifications) {
    for (const entry of n.timeline ?? []) {
      if (!latest || entry.timestamp > latest.timestamp) {
        latest = entry;
      }
    }
  }
  return latest;
}


export default function ProjectsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const pollStatus = usePollStatus();
  const navigate = useNavigate();

  // --- Fetch helper ---
  const fetchData = useCallback(async () => {
    try {
      const [projData, notifResult] = await Promise.all([
        window.deck.getAllProjects?.(),
        window.deck.getNotifications?.(),
      ]);
      setProjects(projData ?? []);
      if (notifResult) {
        const items: NotificationItem[] = Array.isArray(notifResult)
          ? notifResult
          : ((notifResult as { items?: NotificationItem[] }).items ?? []);
        setNotifications(items);
      }
    } catch {}
    setLoading(false);
  }, []);

  // --- Initial load + poll-driven refresh ---
  useEffect(() => {
    fetchData();
    // Re-fetch when poll finishes (via notifications:update IPC)
    const unsub = window.deck.onNotificationsUpdate?.(() => { fetchData(); });
    return () => { unsub?.(); };
  }, [fetchData]);

  // --- Per-project notification lookup ---
  const notifByTaskId = useMemo(() => {
    const map = new Map<string, NotificationItem>();
    for (const n of notifications) map.set(n.id, n);
    return map;
  }, [notifications]);

  const sourceColor = (s: string) => s === "linear" ? "violet" : s === "slack" ? "blue" : "gray";

  // --- Header right content ---
  const headerRight = (
    <Text size="xs" c="dimmed">{projects.length} {projects.length === 1 ? "project" : "projects"}</Text>
  );

  // --- Detail view: find project + tasks grouped by stage ---
  const selectedProject = projectId ? projects.find(p => p.id === projectId) : undefined;

  const projectTasks = useMemo(() => {
    if (!selectedProject) return [];
    return selectedProject.tasks
      .map(id => notifByTaskId.get(id))
      .filter((n): n is NotificationItem => !!n);
  }, [selectedProject, notifByTaskId]);

  const tasksByStage = useMemo(() => {
    const grouped = new Map<string, NotificationItem[]>();
    for (const n of projectTasks) {
      const stage = n.stage ?? "new";
      if (!grouped.has(stage)) grouped.set(stage, []);
      grouped.get(stage)!.push(n);
    }
    return grouped;
  }, [projectTasks]);

  // --- Detail view renderer ---
  const renderDetail = (proj: Project) => {
    const ctx = proj.context;
    const hasContext = ctx.linearTickets.length > 0 || ctx.slackChannels.length > 0 || ctx.prs.length > 0 || ctx.notionDocs.length > 0;
    const taskCount = proj.tasks.length;

    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        {/* Header: back button + project name + source badge + task count */}
        <Group gap={8} mb={20}>
          <UnstyledButton
            onClick={() => navigate("/projects")}
            aria-label="Back to projects list"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              color: "var(--mantine-color-blue-4)", fontSize: "0.8rem",
            }}
          >
            <IconChevronLeft size={14} />
            Projects
          </UnstyledButton>
        </Group>
        <Group gap={10} mb={8}>
          <Text size="lg" fw={700}>{proj.name}</Text>
          <Badge size="sm" variant="light" color={sourceColor(proj.source)}>{proj.source}</Badge>
          <Badge size="sm" variant="outline" color="gray">{taskCount} task{taskCount !== 1 ? "s" : ""}</Badge>
          {taskCount > 0 && (() => {
            const doneCount = projectTasks.filter(n => n.stage === "done" || n.stage === "skipped").length;
            return doneCount === taskCount
              ? <Badge size="sm" color="green" variant="filled" leftSection={<IconCheck size={10} />}>All done</Badge>
              : <Badge size="sm" variant="light" color="gray">{doneCount}/{taskCount} done</Badge>;
          })()}
        </Group>
        <Text size="xs" c="dimmed" mb={proj.reasoning ? 8 : 20}>
          Created {new Date(proj.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {" \u00b7 "}
          Updated {new Date(proj.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </Text>
        {proj.reasoning && (
          <Text size="xs" c="dimmed" mb={20} style={{
            padding: "8px 12px", borderRadius: 6,
            backgroundColor: "rgba(74, 125, 255, 0.08)",
            borderLeft: "3px solid var(--mantine-color-blue-5)",
          }}>
            {proj.reasoning}
          </Text>
        )}

        {/* Context section */}
        {hasContext && (
          <div style={{
            padding: "14px 16px", borderRadius: 8, marginBottom: 20,
            border: "1px solid rgba(68, 73, 85, 0.2)",
            background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)",
          }}>
            <Text size="sm" fw={600} mb={10}>Context</Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ctx.linearTickets.map((url, i) => (
                <UnstyledButton
                  key={`lt-${i}`}
                  onClick={() => window.deck.openExternal(url)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 10px", borderRadius: 6,
                    background: "rgba(74, 125, 255, 0.08)",
                    color: "var(--mantine-color-blue-4)", fontSize: "0.75rem",
                  }}
                >
                  <SiLinear size={12} color="#5E6AD2" />
                  <span>Linear ticket</span>
                  <IconExternalLink size={10} />
                </UnstyledButton>
              ))}
              {ctx.slackChannels.map((url, i) => (
                <UnstyledButton
                  key={`sc-${i}`}
                  onClick={() => window.deck.openExternal(url)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 10px", borderRadius: 6,
                    background: "rgba(74, 125, 255, 0.08)",
                    color: "var(--mantine-color-blue-4)", fontSize: "0.75rem",
                  }}
                >
                  <IconHash size={12} color="#E01E5A" />
                  <span>Slack channel</span>
                  <IconExternalLink size={10} />
                </UnstyledButton>
              ))}
              {ctx.prs.map((url, i) => (
                <UnstyledButton
                  key={`pr-${i}`}
                  onClick={() => window.deck.openExternal(url)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 10px", borderRadius: 6,
                    background: "rgba(74, 125, 255, 0.08)",
                    color: "var(--mantine-color-blue-4)", fontSize: "0.75rem",
                  }}
                >
                  <IconBrandGithub size={12} />
                  <span>Pull request</span>
                  <IconExternalLink size={10} />
                </UnstyledButton>
              ))}
              {ctx.notionDocs.map((url, i) => (
                <UnstyledButton
                  key={`nd-${i}`}
                  onClick={() => window.deck.openExternal(url)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 10px", borderRadius: 6,
                    background: "rgba(74, 125, 255, 0.08)",
                    color: "var(--mantine-color-blue-4)", fontSize: "0.75rem",
                  }}
                >
                  <SiNotion size={12} />
                  <span>Notion doc</span>
                  <IconExternalLink size={10} />
                </UnstyledButton>
              ))}
            </div>
          </div>
        )}

        {/* Task list grouped by stage */}
        {taskCount === 0 || projectTasks.length === 0 ? (
          <EmptyState icon={IconFolder} message="No tasks in this project yet" />
        ) : (
          <Stack gap={16}>
            {[...tasksByStage.entries()].map(([stage, items]) => {
              const cfg = STAGE_LABELS[stage] ?? { label: stage, color: "var(--mantine-color-gray-6)" };
              return (
                <div key={stage}>
                  <Group gap={8} mb={8}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: cfg.color }} />
                    <Text size="sm" fw={600}>{cfg.label}</Text>
                    <Badge size="xs" variant="light" color="gray">{items.length}</Badge>
                  </Group>
                  <Stack gap={6}>
                    {items.map(n => {
                      const SrcIcon = sourceIcons[n.source] ?? IconFileText;
                      const srcColor = sourceColors[n.source] ?? "var(--mantine-color-gray-6)";
                      const stageCfg = STAGE_LABELS[n.stage ?? "new"] ?? { label: n.stage ?? "new", color: "var(--mantine-color-gray-6)" };
                      return (
                        <UnstyledButton
                          key={n.id}
                          onClick={() => navigate(`/notifications?select=${n.id}`)}
                          className="notif-card"
                          style={{
                            padding: "10px 14px", borderRadius: 6,
                            border: "1px solid rgba(68, 73, 85, 0.2)",
                            background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)",
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            transition: "background-color 0.15s",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Group gap={6} mb={4}>
                              <SrcIcon size={12} color={srcColor} />
                              <Text size="sm" fw={500} truncate>{n.title}</Text>
                            </Group>
                            <Group gap={6}>
                              {n.priority && (
                                <Badge
                                  size="xs"
                                  variant="dot"
                                  color={
                                    n.priority === "critical" ? "red" : n.priority === "high" ? "yellow" : n.priority === "medium" ? "blue" : "gray"
                                  }
                                  style={{ fontSize: "0.5rem" }}
                                >
                                  {n.priority}
                                </Badge>
                              )}
                              <Badge size="xs" variant="light" color="gray" style={{ fontSize: "0.5rem" }}>
                                {stageCfg.label}
                              </Badge>
                              {n.author && <Text size="xs" c="dimmed" truncate style={{ maxWidth: 120, fontSize: "0.6rem" }}>{n.author}</Text>}
                            </Group>
                          </div>
                          <IconChevronRight size={14} color="var(--aegen-dust-gray)" style={{ flexShrink: 0 }} />
                        </UnstyledButton>
                      );
                    })}
                  </Stack>
                </div>
              );
            })}
          </Stack>
        )}
      </div>
    );
  };

  // --- Determine if showing detail or list ---
  const showDetail = projectId && selectedProject;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--aegen-void)" }}>
      <AppHeader rightContent={headerRight} />
      <GlobalLoadingBanner />

      {showDetail ? renderDetail(selectedProject) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <Group justify="space-between" mb={16}>
            <Text size="lg" fw={600}>Projects</Text>
          </Group>

          {(() => {
            const visibleProjects = projects.filter(proj => {
              const relevantTasks = proj.tasks.filter(id => {
                const n = notifByTaskId.get(id);
                return n && n.stage !== "skipped";
              });
              return relevantTasks.length > 0;
            });
            if (visibleProjects.length === 0) {
              return <EmptyState icon={IconFolder} message="No projects yet." detail="Projects are auto-created when the triage agent groups related tasks. Hit the refresh button to fetch your data." />;
            }
            return (
            <Stack gap={8}>
              {visibleProjects.map(proj => {
                // Count all non-skipped tasks (including done)
                const projNotifs = proj.tasks.map(id => notifByTaskId.get(id)).filter((n): n is NotificationItem => !!n && n.stage !== "skipped");
                const taskCount = projNotifs.length;
                const contextCount = proj.context.linearTickets.length + proj.context.slackChannels.length + proj.context.prs.length + proj.context.notionDocs.length;

                // Stage breakdown (excluding skipped)
                const stageCounts = new Map<string, number>();
                for (const n of projNotifs) {
                  const stage = n.stage ?? "new";
                  stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
                }

                // Latest activity across all tasks
                const latest = latestActivity(projNotifs);

                return (
                  <UnstyledButton
                    key={proj.id}
                    onClick={() => navigate(`/projects/${proj.id}`)}
                    aria-label={proj.name}
                    style={{
                      padding: "14px 16px", borderRadius: 8,
                      border: "1px solid rgba(68, 73, 85, 0.2)",
                      background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      transition: "background-color 0.15s",
                    }}
                    className="notif-card"
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Group gap={8} mb={4}>
                        <Text size="sm" fw={600}>{proj.name}</Text>
                        <Badge size="xs" variant="light" color={sourceColor(proj.source)}>{proj.source}</Badge>
                      </Group>
                      <Group gap={12} mb={stageCounts.size > 0 ? 6 : 0}>
                        <Text size="xs" c="dimmed">{taskCount} task{taskCount !== 1 ? "s" : ""}</Text>
                        {contextCount > 0 && <Text size="xs" c="dimmed">{contextCount} context item{contextCount !== 1 ? "s" : ""}</Text>}
                        <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem" }}>
                          Updated {new Date(proj.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </Text>
                      </Group>

                      {/* Creation reasoning */}
                      {proj.reasoning && (
                        <Text size="xs" c="dimmed" mb={4} style={{ fontSize: "0.6rem", fontStyle: "italic" }}>
                          {proj.reasoning}
                        </Text>
                      )}

                      {/* Stage progress bar */}
                      {taskCount > 0 && stageCounts.size > 0 && (() => {
                        const doneCount = (stageCounts.get("done") ?? 0) + (stageCounts.get("skipped") ?? 0);
                        const allDone = doneCount === taskCount;
                        const activeStages = [...stageCounts.entries()]
                          .filter(([s]) => s !== "done" && s !== "skipped")
                          .sort((a, b) => (STAGE_ORDER[b[0]] ?? 0) - (STAGE_ORDER[a[0]] ?? 0));
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                              position: "relative", flex: 1, height: 6, borderRadius: 3,
                              overflow: "hidden",
                              backgroundColor: "rgba(68, 73, 85, 0.3)",
                            }}>
                              <div style={{ display: "flex", height: "100%", width: `${(doneCount / taskCount) * 100}%`, minWidth: doneCount > 0 ? 4 : 0 }}>
                                <Tooltip label={`Done: ${doneCount}`} withArrow position="top">
                                  <div style={{ width: "100%", backgroundColor: "var(--mantine-color-green-filled)" }} />
                                </Tooltip>
                              </div>
                              {activeStages.length > 0 && (
                                <div style={{
                                  position: "absolute", top: 0, left: `${(doneCount / taskCount) * 100}%`,
                                  display: "flex", height: "100%",
                                  width: `${((taskCount - doneCount) / taskCount) * 100}%`,
                                }}>
                                  {activeStages.map(([stage, count]) => {
                                    const cfg = STAGE_LABELS[stage] ?? { label: stage, color: "var(--mantine-color-gray-6)" };
                                    const pct = (count / (taskCount - doneCount)) * 100;
                                    return (
                                      <Tooltip key={stage} label={`${cfg.label}: ${count}`} withArrow position="top">
                                        <div style={{
                                          width: `${pct}%`, minWidth: 4,
                                          backgroundColor: cfg.color, opacity: 0.5,
                                        }} />
                                      </Tooltip>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            {allDone ? (
                              <Group gap={4} style={{ flexShrink: 0 }}>
                                <IconCheck size={12} color="var(--mantine-color-green-filled)" />
                                <Text size="xs" c="green" fw={600} style={{ fontSize: "0.65rem" }}>Done</Text>
                              </Group>
                            ) : (
                              <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem", whiteSpace: "nowrap", flexShrink: 0 }}>
                                {doneCount}/{taskCount} done
                              </Text>
                            )}
                          </div>
                        );
                      })()}

                      {/* Latest activity */}
                      {latest && (
                        <Text size="xs" c="dimmed" mt={4} style={{ fontSize: "0.6rem" }}>
                          Latest: {latest.event} \u00b7 {formatTimeSince(latest.timestamp)}
                        </Text>
                      )}
                    </div>
                    <IconChevronRight size={16} color="var(--aegen-dust-gray)" style={{ flexShrink: 0 }} />
                  </UnstyledButton>
                );
              })}
            </Stack>
            );
          })()}
        </div>
      )}
    </div>
  );
}
