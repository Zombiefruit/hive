import {
  Badge,
  Group,
  ScrollArea,
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
  IconSettings,
  IconBell,
  IconHistory,
  IconRobotOff,
  IconShieldCheck,
  IconActivity,
} from "@tabler/icons-react";
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MetricsBar } from "../components/MetricsBar";
import { AgentCard } from "../components/AgentCard";
import { AgentFilterBar } from "../components/AgentFilterBar";
import { ActivityFeed } from "../components/ActivityFeed";
import { ApprovalSidebar } from "../components/ApprovalSidebar";
import { NewAgentModal } from "../components/NewAgentModal";
import { GlobalContextBar } from "../components/GlobalContextBar";
import { IntegrationPanel } from "../components/IntegrationPanel";
import { useAgentStore, usePendingApprovals } from "../stores/agent-store";

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
          backgroundColor: "var(--mantine-color-body)",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 24px",
            paddingLeft: 96,
            borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--mantine-color-dark-8) 80%, transparent)",
            backdropFilter: "blur(8px)",
            WebkitAppRegion: "drag",
          }}
        >
          <Group gap="sm" style={{ WebkitAppRegion: "no-drag" }}>
            <Title order={4}>Claude Deck</Title>
            <Text size="xs" c="dimmed">Agent fleet orchestration</Text>
          </Group>
          <Group gap="xs" style={{ WebkitAppRegion: "no-drag" }}>
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
                backgroundColor: "var(--mantine-color-blue-5)",
                color: "white",
              }}
            >
              <IconPlus size={14} stroke={2} />
              Spawn Agent
            </UnstyledButton>
            <UnstyledButton onClick={() => navigate("/history")} style={{ padding: 8, borderRadius: 8 }}>
              <IconHistory size={16} color="var(--mantine-color-dimmed)" />
            </UnstyledButton>
            <UnstyledButton style={{ padding: 8, borderRadius: 8 }}>
              <IconBell size={16} color="var(--mantine-color-dimmed)" />
            </UnstyledButton>
            <UnstyledButton style={{ padding: 8, borderRadius: 8 }}>
              <IconSettings size={16} color="var(--mantine-color-dimmed)" />
            </UnstyledButton>
          </Group>
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
                  border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)",
                  backgroundColor: "var(--mantine-color-dark-7)",
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
          </Stack>

          {/* Right: sidebar */}
          <Stack gap="lg">
            {/* Approvals */}
            <div
              style={{
                borderRadius: 8,
                border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)",
                backgroundColor: "var(--mantine-color-dark-7)",
                overflow: "hidden",
              }}
            >
              <Group
                justify="space-between"
                p="sm"
                style={{ borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)" }}
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
                border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)",
                backgroundColor: "var(--mantine-color-dark-7)",
                overflow: "hidden",
              }}
            >
              <Group
                p="sm"
                style={{ borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)" }}
              >
                <IconActivity size={14} stroke={1.5} />
                <Text size="sm" fw={600}>Activity</Text>
              </Group>
              <div style={{ padding: 0 }}>
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
