import { Group, Stack, Text } from "@mantine/core";
import { IconBrandSlack, IconBrandGithub } from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { useAgentContextRefs } from "../stores/agent-store";
import type { ContextRefType } from "../../shared/types";

const typeConfig: Record<ContextRefType, { label: string; Icon: React.FC<{ size?: number; color?: string }>; color: string }> = {
  linear: { label: "Linear", Icon: SiLinear as React.FC<{ size?: number; color?: string }>, color: "#5E6AD2" },
  slack: { label: "Slack", Icon: IconBrandSlack as React.FC<{ size?: number; color?: string }>, color: "#E01E5A" },
  notion: { label: "Notion", Icon: SiNotion as React.FC<{ size?: number; color?: string }>, color: "#FFFFFF" },
  github: { label: "GitHub", Icon: IconBrandGithub as React.FC<{ size?: number; color?: string }>, color: "#FFFFFF" },
};

interface ContextPanelProps {
  agentId: string;
}

export function ContextPanel({ agentId }: ContextPanelProps) {
  const contextRefs = useAgentContextRefs(agentId);

  const grouped = contextRefs.reduce(
    (acc, ref) => {
      if (!acc[ref.type]) acc[ref.type] = [];
      acc[ref.type].push(ref);
      return acc;
    },
    {} as Record<string, typeof contextRefs>
  );

  const types = Object.keys(grouped) as ContextRefType[];

  if (types.length === 0) {
    return (
      <Stack gap="sm" p="xs">
        <Text size="sm" fw={600}>Context</Text>
        <Text size="xs" c="dimmed" ta="center" py="md">
          No linked resources detected yet.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="sm" p="xs">
      <Text size="sm" fw={600}>Context</Text>
      {types.map((type) => {
        const cfg = typeConfig[type];
        const Icon = cfg?.Icon;
        return (
          <Stack key={type} gap={4}>
            <Group gap={6}>
              {Icon && <Icon size={14} color={cfg.color} />}
              <Text size="xs" fw={600}>{cfg?.label ?? type}</Text>
              <Text size="xs" c="dimmed">{grouped[type].length}</Text>
            </Group>
            <Stack gap={2} pl={20}>
              {grouped[type].map((ref) => (
                <Text
                  key={ref.id}
                  size="xs"
                  truncate
                  style={{
                    cursor: ref.url ? "pointer" : undefined,
                    color: ref.url ? "var(--mantine-color-blue-4)" : undefined,
                  }}
                  onClick={() => { if (ref.url) window.deck.openExternal(ref.url); }}
                >
                  {ref.title || ref.resourceId}
                </Text>
              ))}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}
