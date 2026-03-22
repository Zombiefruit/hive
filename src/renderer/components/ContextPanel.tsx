import {
  Accordion,
  Anchor,
  Badge,
  Group,
  Stack,
  Text,
} from "@mantine/core";
import { useAgentContextRefs } from "../stores/agent-store";
import type { ContextRefType } from "../../shared/types";

const typeLabels: Record<ContextRefType, string> = {
  linear: "Linear",
  slack: "Slack",
  notion: "Notion",
  github: "GitHub",
};

const typeColors: Record<ContextRefType, string> = {
  linear: "violet",
  slack: "green",
  notion: "gray",
  github: "dark",
};

interface ContextPanelProps {
  agentId: string;
}

export function ContextPanel({ agentId }: ContextPanelProps) {
  const contextRefs = useAgentContextRefs(agentId);

  // Group by type
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
          {"\n"}Resources will appear as the agent accesses them.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="sm" p="xs">
      <Text size="sm" fw={600}>Context</Text>
      <Accordion variant="separated" radius="sm">
        {types.map((type) => (
          <Accordion.Item key={type} value={type}>
            <Accordion.Control>
              <Group gap="xs">
                <Badge variant="light" color={typeColors[type]} size="xs">
                  {typeLabels[type]}
                </Badge>
                <Text size="sm">{grouped[type].length} items</Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                {grouped[type].map((ref) => (
                  <Group key={ref.id} gap="xs" wrap="nowrap">
                    {ref.url ? (
                      <Anchor
                        href={ref.url}
                        target="_blank"
                        size="xs"
                        truncate
                        style={{ minWidth: 0 }}
                      >
                        {ref.title || ref.resourceId}
                      </Anchor>
                    ) : (
                      <Text size="xs" truncate style={{ minWidth: 0 }}>
                        {ref.title || ref.resourceId}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      {new Date(ref.detectedAt).toLocaleTimeString()}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  );
}
