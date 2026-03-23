import { Badge, Group, Stack, Text } from "@mantine/core";
import {
  IconTicket,
  IconBrandGithub,
  IconMessage,
  IconFileText,
  IconGitPullRequest,
} from "@tabler/icons-react";
import { useAgentStore } from "../stores/agent-store";
import type { ContextRef } from "../../shared/types";

const typeConfig: Record<string, { icon: typeof IconTicket; color: string; label: string }> = {
  linear: { icon: IconTicket, color: "#818cf8", label: "Tickets" },
  github: { icon: IconBrandGithub, color: "#a78bfa", label: "Repos" },
  slack: { icon: IconMessage, color: "#f472b6", label: "Threads" },
  notion: { icon: IconFileText, color: "#94a3b8", label: "Pages" },
};

export function GlobalContextBar() {
  const agents = useAgentStore((s) => s.agents);
  const allContextRefs = useAgentStore((s) => s.contextRefs);

  // Flatten all context refs with agent attribution
  const flatRefs: Array<ContextRef & { agentName: string }> = [];
  for (const agent of agents) {
    const refs = allContextRefs[agent.id] ?? [];
    for (const ref of refs) {
      flatRefs.push({ ...ref, agentName: agent.cwd.split("/").pop() ?? "agent" });
    }
  }

  // Count by type
  const counts: Record<string, number> = {};
  for (const ref of flatRefs) {
    counts[ref.type] = (counts[ref.type] ?? 0) + 1;
  }

  if (flatRefs.length === 0) {
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
          <Text size="sm" fw={600}>Active Context</Text>
        </Group>
        <Text size="xs" c="dimmed" ta="center" py="lg">
          No linked resources yet
        </Text>
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)",
        backgroundColor: "var(--mantine-color-dark-7)",
        overflow: "hidden",
      }}
    >
      <Stack gap={0}>
        <Group
          gap="xs"
          p="sm"
          style={{ borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)" }}
        >
          <div>
            <Text size="sm" fw={600}>Active Context</Text>
            <Text size="xs" c="dimmed">Resources being accessed across all agents</Text>
          </div>
        </Group>

        {/* Type counts */}
        <Group gap={6} px="sm" py="xs" wrap="wrap">
          {Object.entries(counts).map(([type, count]) => {
            const cfg = typeConfig[type];
            if (!cfg) return null;
            const Icon = cfg.icon;
            return (
              <Badge
                key={type}
                variant="outline"
                color="gray"
                size="sm"
                radius="sm"
                leftSection={<Icon size={11} color={cfg.color} />}
              >
                {count} {cfg.label}
              </Badge>
            );
          })}
        </Group>

        {/* Resource list */}
        <Stack gap={0}>
          {flatRefs.slice(0, 8).map((ref, i) => {
            const cfg = typeConfig[ref.type];
            const Icon = cfg?.icon ?? IconFileText;
            return (
              <Group
                key={ref.id}
                gap="xs"
                px="sm"
                py={6}
                wrap="nowrap"
                style={{
                  borderTop: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 20%, transparent)",
                  cursor: ref.url ? "pointer" : undefined,
                }}
                onClick={() => { if (ref.url) window.deck.openExternal(ref.url); }}
              >
                <Icon size={13} color={cfg?.color ?? "#6b7280"} style={{ flexShrink: 0 }} />
                <Text size="xs" fw={500} truncate style={{ flex: 1, minWidth: 0, color: ref.url ? "var(--mantine-color-blue-4)" : undefined }}>
                  {ref.title}
                </Text>
                {ref.resourceId !== ref.title && (
                  <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: "0.65rem", flexShrink: 0 }}>
                    {ref.resourceId.slice(0, 12)}
                  </Text>
                )}
                <Text size="xs" c="blue.4" ff="monospace" style={{ fontSize: "0.65rem", flexShrink: 0 }}>
                  {ref.agentName}
                </Text>
              </Group>
            );
          })}
          {flatRefs.length > 8 && (
            <Text size="xs" c="dimmed" px="sm" py="xs">
              +{flatRefs.length - 8} more
            </Text>
          )}
        </Stack>
      </Stack>
    </div>
  );
}
