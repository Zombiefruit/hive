import { Badge, Card, Group, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { IconArrowLeft, IconBell, IconCheck, IconPlayerPlay, IconX, IconBrandGithub, IconHash, IconMail, IconFileText } from "@tabler/icons-react";
import { SiLinear, SiNotion } from "@icons-pack/react-simple-icons";
import { useNavigate } from "react-router-dom";
import type { NotificationSource, NotificationPriority } from "../../shared/notification-types";

// Mock notifications until the polling service is built
const MOCK_NOTIFICATIONS = [
  {
    id: "n1",
    source: "linear" as NotificationSource,
    priority: "actionable" as NotificationPriority,
    status: "new" as const,
    title: "VEC-501: Add data quality scoring to pipeline output",
    summary: "New ticket assigned to you. The pipeline output needs a quality score (0-100) computed from completeness, freshness, and schema conformance metrics.",
    url: "https://linear.app/issue/VEC-501",
    createdAt: new Date(Date.now() - 300000).toISOString(),
    updatedAt: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: "n2",
    source: "github" as NotificationSource,
    priority: "actionable" as NotificationPriority,
    status: "new" as const,
    title: "PR #4587: Review requested — Refactor auth middleware",
    summary: "Sarah requested your review on a refactoring of the authentication middleware. 12 files changed, focuses on token validation flow.",
    url: "https://github.com/monte-carlo-data/monolith-django/pull/4587",
    createdAt: new Date(Date.now() - 900000).toISOString(),
    updatedAt: new Date(Date.now() - 900000).toISOString(),
  },
  {
    id: "n3",
    source: "slack" as NotificationSource,
    priority: "fyi" as NotificationPriority,
    status: "new" as const,
    title: "#team-vector: Yael mentioned you in deployment thread",
    summary: "Yael asked about the status of the retry logic implementation in the deployment planning thread.",
    url: "https://montecarlodata.slack.com/archives/C0AMSV2SK4Z",
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: "n4",
    source: "notion" as NotificationSource,
    priority: "fyi" as NotificationPriority,
    status: "new" as const,
    title: "RFC: Pipeline v3 Architecture updated",
    summary: "The architecture spec was updated with new sections on error handling and retry strategies. Relevant to your current work.",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "n5",
    source: "email" as NotificationSource,
    priority: "fyi" as NotificationPriority,
    status: "new" as const,
    title: "Weekly engineering sync — agenda shared",
    summary: "Calendar invite updated with agenda. Your topic: pipeline retry logic demo.",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

const sourceIcons: Record<NotificationSource, React.FC<{ size?: number; color?: string }>> = {
  linear: SiLinear as React.FC<{ size?: number; color?: string }>,
  slack: IconHash as React.FC<{ size?: number; color?: string }>,
  github: IconBrandGithub as React.FC<{ size?: number; color?: string }>,
  notion: SiNotion as React.FC<{ size?: number; color?: string }>,
  email: IconMail as React.FC<{ size?: number; color?: string }>,
};

const sourceColors: Record<NotificationSource, string> = {
  linear: "#5E6AD2",
  slack: "#E01E5A",
  github: "#FFFFFF",
  notion: "#FFFFFF",
  email: "#EA4335",
};

const priorityConfig: Record<NotificationPriority, { label: string; color: string }> = {
  actionable: { label: "Action needed", color: "blue" },
  fyi: { label: "FYI", color: "gray" },
  noise: { label: "Low", color: "dark" },
};

function formatAge(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function Notifications() {
  const navigate = useNavigate();
  const actionable = MOCK_NOTIFICATIONS.filter(n => n.priority === "actionable");
  const fyi = MOCK_NOTIFICATIONS.filter(n => n.priority === "fyi");

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--mantine-color-body)" }}>
      {/* Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          padding: "12px 24px",
          paddingLeft: 96,
          gap: 12,
          borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
          backgroundColor: "color-mix(in srgb, var(--mantine-color-dark-8) 80%, transparent)",
          backdropFilter: "blur(8px)",
          WebkitAppRegion: "drag",
        }}
      >
        <UnstyledButton onClick={() => navigate("/")} style={{ WebkitAppRegion: "no-drag", padding: 4 }}>
          <IconArrowLeft size={16} />
        </UnstyledButton>
        <IconBell size={18} />
        <Title order={4}>Notification Center</Title>
        <Badge variant="filled" color="blue" size="sm">{actionable.length} actionable</Badge>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
        <Stack gap="lg">
          {/* Actionable section */}
          {actionable.length > 0 && (
            <Stack gap="sm">
              <Text size="xs" fw={600} tt="uppercase" c="blue" style={{ letterSpacing: "0.05em" }}>
                Action needed
              </Text>
              {actionable.map((n) => (
                <NotificationCard key={n.id} notification={n} />
              ))}
            </Stack>
          )}

          {/* FYI section */}
          {fyi.length > 0 && (
            <Stack gap="sm">
              <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.05em" }}>
                For your information
              </Text>
              {fyi.map((n) => (
                <NotificationCard key={n.id} notification={n} />
              ))}
            </Stack>
          )}
        </Stack>
      </div>
    </div>
  );
}

function NotificationCard({ notification: n }: { notification: typeof MOCK_NOTIFICATIONS[0] }) {
  const Icon = sourceIcons[n.source];
  const color = sourceColors[n.source];
  const isActionable = n.priority === "actionable";

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 8,
        border: `1px solid color-mix(in srgb, ${isActionable ? "var(--mantine-color-blue-5)" : "var(--mantine-color-default-border)"} ${isActionable ? "40%" : "60%"}, transparent)`,
        backgroundColor: "var(--mantine-color-dark-7)",
      }}
    >
      <Icon size={18} color={color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Group justify="space-between" mb={4}>
          <Text size="sm" fw={500}>{n.title}</Text>
          <Text size="xs" c="dimmed">{formatAge(n.createdAt)}</Text>
        </Group>
        <Text size="xs" c="dimmed" lineClamp={2} mb={8}>
          {n.summary}
        </Text>
        <Group gap="xs">
          {isActionable && (
            <>
              <UnstyledButton
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  backgroundColor: "var(--mantine-color-blue-5)",
                  color: "white",
                }}
              >
                <IconPlayerPlay size={12} />
                Start work
              </UnstyledButton>
              <UnstyledButton
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: "0.7rem",
                  fontWeight: 500,
                  backgroundColor: "var(--mantine-color-dark-6)",
                  color: "var(--mantine-color-dimmed)",
                }}
              >
                <IconCheck size={12} />
                Dismiss
              </UnstyledButton>
            </>
          )}
          {n.url && (
            <UnstyledButton
              onClick={() => window.deck.openExternal(n.url!)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: "0.7rem",
                fontWeight: 500,
                color: "var(--mantine-color-blue-4)",
              }}
            >
              Open
            </UnstyledButton>
          )}
        </Group>
      </div>
    </div>
  );
}
