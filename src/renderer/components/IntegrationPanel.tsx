import { Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { StatusDot } from "./StatusDot";

interface Integration {
  name: string;
  icon: string;
  description: string;
  connected: boolean;
}

const integrations: Integration[] = [
  { name: "Linear", icon: "◆", description: "Syncing issues & project status", connected: true },
  { name: "Notion", icon: "◻", description: "Reading task specs & docs", connected: true },
  { name: "Slack", icon: "#", description: "Not connected", connected: false },
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
        <Text size="sm" fw={600}>Integrations</Text>
      </Group>
      <Stack gap={0}>
        {integrations.map((integration, i) => (
          <UnstyledButton
            key={integration.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderBottom: i < integrations.length - 1
                ? "1px solid color-mix(in srgb, var(--mantine-color-default-border) 20%, transparent)"
                : undefined,
              cursor: "pointer",
              transition: "background-color 0.1s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--mantine-color-dark-6)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <Text size="lg" style={{ width: 24, textAlign: "center", opacity: 0.6 }}>
              {integration.icon}
            </Text>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500}>{integration.name}</Text>
              <Text size="xs" c="dimmed">{integration.description}</Text>
            </div>
            <Group gap={6}>
              {integration.connected ? (
                <>
                  <StatusDot status="active" size={6} pulse={false} />
                  <Text size="xs" c="green" fw={500}>Connected</Text>
                </>
              ) : (
                <Text size="xs" c="dimmed">Connect</Text>
              )}
              <IconChevronRight size={14} color="var(--mantine-color-dimmed)" />
            </Group>
          </UnstyledButton>
        ))}
      </Stack>
    </div>
  );
}
