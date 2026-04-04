import { Group, Stack, Text } from "@mantine/core";
import { SiLinear, SiNotion, SiGmail, SiGithub, SiGooglecalendar } from "@icons-pack/react-simple-icons";
import { IconBrandSlack } from "@tabler/icons-react";
import { StatusDot } from "./StatusDot";

const integrations = [
  { name: "Linear", Icon: SiLinear, color: "#5E6AD2", description: "Issues & project tracking" },
  { name: "Slack", Icon: IconBrandSlack, color: "#E01E5A", description: "Channels, threads & messages" },
  { name: "Notion", Icon: SiNotion, color: "var(--aegen-star-white)", description: "Pages, docs & databases" },
  { name: "Gmail", Icon: SiGmail, color: "#EA4335", description: "Email inbox" },
  { name: "GitHub", Icon: SiGithub, color: "var(--aegen-star-white)", description: "Repos, PRs & issues" },
  { name: "Google Calendar", Icon: SiGooglecalendar, color: "#4285F4", description: "Events & scheduling" },
];

export function IntegrationPanel() {
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid var(--aegen-glass-border)",
        background: "var(--aegen-glass-bg)", backdropFilter: "var(--aegen-glass-blur)",
        overflow: "hidden",
      }}
    >
      <Group
        p="sm"
        style={{ borderBottom: "1px solid var(--aegen-glass-border)" }}
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
              gap: 10,
              padding: "8px 12px",
              borderBottom: i < integrations.length - 1
                ? "1px solid rgba(68, 73, 85, 0.12)"
                : undefined,
            }}
          >
            <integration.Icon size={16} color={integration.color} />
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
