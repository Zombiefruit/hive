import { Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { StatusDot } from "./StatusDot";

// These reflect Claude Code's MCP connectors (claude.ai integrations)
const integrations = [
  { name: "Linear", icon: "◆", description: "Issues & project tracking", connected: true },
  { name: "Slack", icon: "#", description: "Channels, threads & messages", connected: true },
  { name: "Notion", icon: "◻", description: "Pages, docs & databases", connected: true },
  { name: "Gmail", icon: "✉", description: "Email inbox", connected: true },
  { name: "GitHub", icon: "⑉", description: "Repos, PRs & issues", connected: true },
  { name: "Google Calendar", icon: "◫", description: "Events & scheduling", connected: true },
];

export function IntegrationPanel() {
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
        p="sm"
        style={{ borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)" }}
      >
        <Text size="sm" fw={600}>Connectors</Text>
        <Text size="xs" c="dimmed">via Claude Code MCP</Text>
      </Group>
      <Stack gap={0}>
        {integrations.map((integration, i) => (
          <div
            key={integration.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 12px",
              borderBottom: i < integrations.length - 1
                ? "1px solid color-mix(in srgb, var(--mantine-color-default-border) 20%, transparent)"
                : undefined,
            }}
          >
            <Text size="sm" style={{ width: 20, textAlign: "center", opacity: 0.5 }}>
              {integration.icon}
            </Text>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" fw={500}>{integration.name}</Text>
              <Text size="xs" c="dimmed" style={{ fontSize: "0.65rem" }}>{integration.description}</Text>
            </div>
            <Group gap={4}>
              <StatusDot status="active" size={5} pulse={false} />
              <Text size="xs" c="green" style={{ fontSize: "0.65rem" }}>Active</Text>
            </Group>
          </div>
        ))}
      </Stack>
    </div>
  );
}
