import {
  ActionIcon,
  AppShell,
  Badge,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus, IconShieldCheck } from "@tabler/icons-react";
import { MetricsBar } from "../components/MetricsBar";
import { AgentGrid } from "../components/AgentGrid";
import { ActivityFeed } from "../components/ActivityFeed";
import { ApprovalSidebar } from "../components/ApprovalSidebar";
import { NewAgentModal } from "../components/NewAgentModal";
import { usePendingApprovals } from "../stores/agent-store";

export function Dashboard() {
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const pendingCount = usePendingApprovals().length;

  return (
    <>
      <AppShell
        header={{ height: 52 }}
        aside={{ width: 280, breakpoint: "lg", collapsed: { desktop: false, mobile: true } }}
        padding="md"
      >
        <AppShell.Header
          style={{
            display: "flex",
            alignItems: "center",
            paddingInline: "var(--mantine-spacing-md)",
            // Leave space for macOS traffic lights (hiddenInset titlebar)
            paddingLeft: 96,
            gap: "var(--mantine-spacing-sm)",
            WebkitAppRegion: "drag",
          }}
        >
          <Title order={3} style={{ WebkitAppRegion: "no-drag" }}>
            Claude Deck
          </Title>
          <Badge variant="light" color="blue" size="sm">
            v0.1.0
          </Badge>
          <div style={{ flex: 1 }} />
          <ActionIcon
            variant="filled"
            color="blue"
            size="lg"
            onClick={openModal}
            style={{ WebkitAppRegion: "no-drag" }}
            aria-label="New Agent"
          >
            <IconPlus size={18} stroke={2} />
          </ActionIcon>
        </AppShell.Header>

        <AppShell.Main>
          <Stack gap="md">
            <MetricsBar />
            <AgentGrid />
            <Divider label="Activity" labelPosition="left" />
            <ActivityFeed />
          </Stack>
        </AppShell.Main>

        <AppShell.Aside p="md">
          <ScrollArea h="100%">
            <Stack gap="md">
              <Group justify="space-between">
                <Group gap="xs">
                  <IconShieldCheck size={16} stroke={1.5} />
                  <Text size="sm" fw={600}>Approvals</Text>
                </Group>
                {pendingCount > 0 && (
                  <Badge variant="filled" color="red" size="sm">
                    {pendingCount}
                  </Badge>
                )}
              </Group>
              <ApprovalSidebar />
            </Stack>
          </ScrollArea>
        </AppShell.Aside>
      </AppShell>

      <NewAgentModal opened={modalOpened} onClose={closeModal} />
    </>
  );
}
