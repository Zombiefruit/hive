import {
  Badge,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconPlus,
  IconRobotOff,
  IconShieldCheck,
  IconActivity,
} from "@tabler/icons-react";
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { MetricsBar } from "../components/MetricsBar";
import { AgentCard } from "../components/AgentCard";
import { AgentFilterBar } from "../components/AgentFilterBar";
import { StatusDot } from "../components/StatusDot";
import { ActivityFeed } from "../components/ActivityFeed";
import { ApprovalSidebar } from "../components/ApprovalSidebar";
import { NewAgentModal } from "../components/NewAgentModal";
import { GlobalContextBar } from "../components/GlobalContextBar";
import { IntegrationPanel } from "../components/IntegrationPanel";
import { useAgentStore, usePendingApprovals } from "../stores/agent-store";

function RecentHistory() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Array<{ sessionId: string; firstPrompt: string; lastModified: number; cwd: string; messageCount: number }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.deck.listAllSessions();
        if (result) setSessions(result.slice(0, 6)); // Show last 6
      } catch {}
    })();
  }, []);

  if (sessions.length === 0) return null;

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Title order={5}>Recent Sessions</Title>
        <UnstyledButton onClick={() => navigate("/history")} style={{ fontSize: "0.75rem", color: "var(--mantine-color-blue-4)" }}>
          View all →
        </UnstyledButton>
      </Group>
      <SimpleGrid cols={2}>
        {sessions.map(s => {
          const age = Math.round((Date.now() - s.lastModified) / 60000);
          const ageStr = age < 60 ? `${age}m ago` : age < 1440 ? `${Math.round(age / 60)}h ago` : `${Math.round(age / 1440)}d ago`;
          return (
            <UnstyledButton
              key={s.sessionId}
              onClick={() => navigate("/history")}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid rgba(68, 73, 85, 0.2)",
                background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)",
                opacity: 0.7,
              }}
            >
              <Group gap={6} mb={4}>
                <StatusDot status="completed" size={6} pulse={false} />
                <Text size="xs" c="dimmed">{ageStr}</Text>
              </Group>
              <Text size="xs" fw={500} lineClamp={1}>{s.firstPrompt}</Text>
              <Text size="xs" c="dimmed" ff="monospace" mt={2}>{s.cwd.replace(/^\/Users\/\w+\//, "~/")}</Text>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const agents = useAgentStore((s) => s.agents);
  const pendingCount = usePendingApprovals().length;
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Show loading until we get first store sync with agents
  useEffect(() => {
    if (agents.length > 0) setLoading(false);
    const timer = setTimeout(() => setLoading(false), 5000); // Max 5s wait
    return () => clearTimeout(timer);
  }, [agents.length]);

  const filteredAgents = useMemo(() => {
    if (activeFilters.size === 0) return agents;
    return agents.filter((a) => activeFilters.has(a.status));
  }, [agents, activeFilters]);

  const toggleFilter = (filter: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  };

  return (
    <>
      <div
        style={{
          minHeight: "100vh",
          background: "var(--aegen-void)",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ position: "sticky", top: 0, zIndex: 10 }}>
          <AppHeader
            rightContent={
              <UnstyledButton
                onClick={openModal}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  backgroundColor: "var(--mantine-color-blue-filled)",
                  color: "var(--mantine-color-white)",
                }}
              >
                <IconPlus size={14} stroke={2} />
                Spawn Agent
              </UnstyledButton>
            }
          />
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
            <Stack align="center" gap="sm">
              <div style={{ width: 24, height: 24, border: "2px solid var(--mantine-color-blue-5)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <Text size="sm" c="dimmed">Discovering agents...</Text>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </Stack>
          </div>
        )}

        {/* Content: two-column grid */}
        {!loading && <div
          style={{
            maxWidth: 1440,
            margin: "0 auto",
            padding: 24,
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: 24,
          }}
        >
          {/* Left: main content */}
          <Stack gap="lg">
            <MetricsBar />

            {/* Agent section header + filter */}
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={5}>Agents ({filteredAgents.length})</Title>
              </Group>
              <AgentFilterBar
                activeFilters={activeFilters}
                onToggle={toggleFilter}
                totalCount={agents.length}
              />
            </Stack>

            {/* Agent grid */}
            {filteredAgents.length === 0 ? (
              <div
                style={{
                  padding: 48,
                  textAlign: "center",
                  borderRadius: 8,
                  border: "1px solid rgba(68, 73, 85, 0.3)",
                  background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)",
                }}
              >
                <ThemeIcon variant="light" color="gray" size="xl" radius="xl" mx="auto" mb="sm">
                  <IconRobotOff size={24} stroke={1.5} />
                </ThemeIcon>
                <Text size="lg" fw={500} c="dimmed">No agents running</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  Click Spawn Agent to start your first Claude Code agent
                </Text>
              </div>
            ) : (
              <SimpleGrid cols={2}>
                {filteredAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </SimpleGrid>
            )}
            {/* Recent history */}
            <RecentHistory />
          </Stack>

          {/* Right: sidebar */}
          <Stack gap="lg">
            {/* Approvals */}
            <div
              style={{
                borderRadius: 8,
                border: "1px solid rgba(68, 73, 85, 0.3)",
                background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)",
                overflow: "hidden",
              }}
            >
              <Group
                justify="space-between"
                p="sm"
                style={{ borderBottom: "1px solid rgba(68, 73, 85, 0.2)" }}
              >
                <Group gap="xs">
                  <IconShieldCheck size={14} stroke={1.5} />
                  <Text size="sm" fw={600}>Pending Approvals</Text>
                </Group>
                {pendingCount > 0 && (
                  <Badge variant="filled" color="red" size="sm" circle>
                    {pendingCount}
                  </Badge>
                )}
              </Group>
              <div style={{ padding: 12 }}>
                <ApprovalSidebar />
              </div>
            </div>

            {/* Context */}
            <GlobalContextBar />

            {/* Integrations */}
            <IntegrationPanel />

            {/* Activity */}
            <div
              style={{
                borderRadius: 8,
                border: "1px solid rgba(68, 73, 85, 0.3)",
                background: "rgba(16, 21, 32, 0.65)", backdropFilter: "blur(16px) saturate(1.2)",
                overflow: "hidden",
              }}
            >
              <Group
                p="sm"
                style={{ borderBottom: "1px solid rgba(68, 73, 85, 0.2)" }}
              >
                <IconActivity size={14} stroke={1.5} />
                <Text size="sm" fw={600}>Activity</Text>
              </Group>
              <div style={{ padding: 0, maxHeight: 400, overflowY: "auto" }}>
                <ActivityFeed />
              </div>
            </div>
          </Stack>
        </div>}
      </div>

      <NewAgentModal opened={modalOpened} onClose={closeModal} />
    </>
  );
}
