import { Accordion, Group, Stack, Text } from "@mantine/core";
import { IconBrandGithub, IconHash } from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { useAgentContextRefs } from "../stores/agent-store";
import type { ContextRefType } from "../../shared/types";

const typeConfig: Record<ContextRefType, { label: string; Icon: React.FC<{ size?: number; color?: string; stroke?: number }>; color: string }> = {
  linear: { label: "Linear", Icon: SiLinear as React.FC<{ size?: number; color?: string }>, color: "#5E6AD2" },
  slack: { label: "Slack", Icon: IconHash as React.FC<{ size?: number; color?: string; stroke?: number }>, color: "#E01E5A" },
  notion: { label: "Notion", Icon: SiNotion as React.FC<{ size?: number; color?: string }>, color: "#FFFFFF" },
  github: { label: "GitHub", Icon: IconBrandGithub as React.FC<{ size?: number; color?: string; stroke?: number }>, color: "#FFFFFF" },
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
      <Accordion variant="separated" radius="sm">
        {types.map((type) => {
          const cfg = typeConfig[type];
          const Icon = cfg?.Icon;
          return (
            <Accordion.Item key={type} value={type}>
              <Accordion.Control>
                <Group gap="xs">
                  {Icon && <Icon size={14} color={cfg.color} />}
                  <Text size="sm">{cfg?.label ?? type}</Text>
                  <Text size="xs" c="dimmed">{grouped[type].length} items</Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  {grouped[type].map((ref) => (
                    <Group
                      key={ref.id}
                      gap="xs"
                      wrap="nowrap"
                      style={{ cursor: ref.url ? "pointer" : undefined }}
                      onClick={() => { if (ref.url) window.deck.openExternal(ref.url); }}
                    >
                      <Text
                        size="xs"
                        truncate
                        style={{ minWidth: 0, color: ref.url ? "var(--mantine-color-blue-4)" : undefined }}
                      >
                        {ref.title || ref.resourceId}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    </Stack>
  );
}
