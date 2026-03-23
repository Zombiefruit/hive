import { Collapse, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconTicket, IconBrandGithub, IconMessage, IconFileText, IconChevronDown, IconChevronRight, IconRobot } from "@tabler/icons-react";
import { useState } from "react";
import { useAgentStore } from "../stores/agent-store";
import type { ContextRef } from "../../shared/types";

const typeConfig: Record<string, { icon: typeof IconTicket; color: string }> = {
  linear: { icon: IconTicket, color: "#818cf8" },
  github: { icon: IconBrandGithub, color: "#a78bfa" },
  slack: { icon: IconMessage, color: "#f472b6" },
  notion: { icon: IconFileText, color: "#94a3b8" },
};

export function GlobalContextBar() {
  const agents = useAgentStore((s) => s.agents);
  const allContextRefs = useAgentStore((s) => s.contextRefs);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Only show context for running agents
  const activeAgents = agents.filter(a => a.status === "active");

  // Group context by agent
  const agentContexts: Array<{ agentId: string; agentName: string; refs: ContextRef[] }> = [];
  for (const agent of activeAgents) {
    const refs = allContextRefs[agent.id] ?? [];
    if (refs.length > 0) {
      agentContexts.push({
        agentId: agent.id,
        agentName: agent.cwd.split("/").pop() ?? "agent",
        refs,
      });
    }
  }

  const totalRefs = agentContexts.reduce((sum, a) => sum + a.refs.length, 0);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)",
        backgroundColor: "var(--mantine-color-dark-7)",
        overflow: "hidden",
      }}
    >
      <Group
        gap="xs"
        p="sm"
        style={{ borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)" }}
      >
        <div>
          <Text size="sm" fw={600}>Active Context</Text>
          <Text size="xs" c="dimmed">{totalRefs} resources across {agentContexts.length} agents</Text>
        </div>
      </Group>

      {agentContexts.length === 0 ? (
        <Text size="xs" c="dimmed" ta="center" py="lg">
          No linked resources for running agents
        </Text>
      ) : (
        <Stack gap={0}>
          {agentContexts.map(({ agentId, agentName, refs }) => {
            const isOpen = expanded.has(agentId);
            return (
              <div key={agentId}>
                <UnstyledButton
                  onClick={() => toggle(agentId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "8px 12px",
                    borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 20%, transparent)",
                  }}
                >
                  {isOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                  <IconRobot size={12} color="var(--mantine-color-blue-4)" />
                  <Text size="xs" fw={500} ff="monospace">{agentName}</Text>
                  <Text size="xs" c="dimmed">{refs.length}</Text>
                </UnstyledButton>
                <Collapse in={isOpen}>
                  <Stack gap={0} pl={32}>
                    {refs.map(ref => {
                      const cfg = typeConfig[ref.type];
                      const Icon = cfg?.icon ?? IconFileText;
                      return (
                        <Group
                          key={ref.id}
                          gap="xs"
                          px={8}
                          py={5}
                          wrap="nowrap"
                          style={{ cursor: ref.url ? "pointer" : undefined }}
                          onClick={() => { if (ref.url) window.deck.openExternal(ref.url); }}
                        >
                          <Icon size={11} color={cfg?.color ?? "#6b7280"} style={{ flexShrink: 0 }} />
                          <Text size="xs" truncate style={{ color: ref.url ? "var(--mantine-color-blue-4)" : undefined }}>
                            {ref.title}
                          </Text>
                        </Group>
                      );
                    })}
                  </Stack>
                </Collapse>
              </div>
            );
          })}
        </Stack>
      )}
    </div>
  );
}
