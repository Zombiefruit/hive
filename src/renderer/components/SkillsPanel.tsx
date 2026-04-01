import { Badge, Group, Stack, Text } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";

// Mock skills data — in production this would come from the Agent SDK's supportedAgents/skills
const SKILLS = [
  { name: "code-review", category: "coding", agents: ["agent-1", "agent-2"], source: "built-in" },
  { name: "test-writer", category: "testing", agents: ["agent-2"], source: "built-in" },
  { name: "brainstorming", category: "coding", agents: ["agent-1"], source: "built-in" },
  { name: "systematic-debugging", category: "coding", agents: ["agent-3"], source: "built-in" },
  { name: "writing-plans", category: "docs", agents: ["agent-1", "agent-4"], source: "built-in" },
  { name: "commit-push-pr", category: "devops", agents: ["agent-4"], source: "built-in" },
];

const categoryColors: Record<string, string> = {
  coding: "blue",
  testing: "green",
  docs: "gray",
  devops: "orange",
  data: "violet",
  infra: "red",
};

export function SkillsPanel() {
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 60%, transparent)",
        backgroundColor: "var(--mantine-color-default)",
        overflow: "hidden",
      }}
    >
      <Group
        gap="xs"
        p="sm"
        style={{ borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)" }}
      >
        <IconSparkles size={14} stroke={1.5} />
        <Text size="sm" fw={600}>Active Skills</Text>
        <Badge variant="light" color="gray" size="xs" circle>
          {SKILLS.length}
        </Badge>
      </Group>
      <Stack gap={0}>
        {SKILLS.map((skill, i) => (
          <Group
            key={skill.name}
            justify="space-between"
            px="sm"
            py={8}
            style={{
              borderBottom: i < SKILLS.length - 1
                ? "1px solid color-mix(in srgb, var(--mantine-color-default-border) 20%, transparent)"
                : undefined,
            }}
          >
            <Group gap="xs">
              <Badge
                variant="light"
                color={categoryColors[skill.category] ?? "gray"}
                size="xs"
                radius="sm"
                tt="uppercase"
                fw={700}
                style={{ fontSize: "0.6rem", letterSpacing: "0.05em" }}
              >
                {skill.category}
              </Badge>
              <div>
                <Text size="xs" fw={500}>{skill.name}</Text>
                <Text size="xs" c="dimmed" style={{ fontSize: "0.65rem" }}>
                  {skill.agents.length} agent{skill.agents.length !== 1 ? "s" : ""}
                </Text>
              </div>
            </Group>
            <Text size="xs" c="dimmed" style={{ fontSize: "0.65rem" }}>
              {skill.source}
            </Text>
          </Group>
        ))}
      </Stack>
    </div>
  );
}
