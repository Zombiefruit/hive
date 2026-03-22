import { useParams } from "react-router-dom";
import { AppShell, Text, Title, Stack } from "@mantine/core";

export function AgentDetail() {
  const { agentId } = useParams<{ agentId: string }>();

  return (
    <AppShell padding="md">
      <AppShell.Main>
        <Stack gap="md">
          <Title order={3}>Agent {agentId}</Title>
          <Text c="dimmed">Chat panel and agent details will go here.</Text>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
