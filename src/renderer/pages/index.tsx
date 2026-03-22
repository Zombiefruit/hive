import {
  AppShell,
  Badge,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";

export function Dashboard() {
  const theme = useMantineTheme();

  return (
    <AppShell header={{ height: 52 }} padding="md">
      <AppShell.Header
        style={{
          display: "flex",
          alignItems: "center",
          paddingInline: theme.spacing.md,
          gap: theme.spacing.sm,
          // Allow window drag on macOS
          WebkitAppRegion: "drag" as unknown as string,
        }}
      >
        <Title order={3} style={{ WebkitAppRegion: "no-drag" as unknown as string }}>
          Claude Deck
        </Title>
        <Badge variant="light" color="blue" size="sm">
          v0.1.0
        </Badge>
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="md">
          {/* Metrics bar */}
          <SimpleGrid cols={5}>
            {[
              { label: "Active", value: 0, color: "blue" },
              { label: "Idle", value: 0, color: "gray" },
              { label: "Errored", value: 0, color: "red" },
              { label: "Completed", value: 0, color: "ok" },
              { label: "Tokens", value: "0", color: "violet" },
            ].map((metric) => (
              <Card key={metric.label} padding="sm" radius="sm" withBorder>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  {metric.label}
                </Text>
                <Group gap="xs" mt={4}>
                  <Text size="xl" fw={700}>
                    {metric.value}
                  </Text>
                  <Badge variant="light" color={metric.color} size="xs">
                    {metric.label}
                  </Badge>
                </Group>
              </Card>
            ))}
          </SimpleGrid>

          {/* Agent grid placeholder */}
          <Card padding="xl" radius="sm" withBorder>
            <Stack align="center" gap="sm" py="xl">
              <Text size="lg" fw={500} c="dimmed">
                No agents running
              </Text>
              <Text size="sm" c="dimmed">
                Click + New Agent to spawn your first Claude Code agent
              </Text>
            </Stack>
          </Card>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
