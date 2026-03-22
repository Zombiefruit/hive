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
import { MetricsBar } from "../components/MetricsBar";
import { AgentGrid } from "../components/AgentGrid";
import { ActivityFeed } from "../components/ActivityFeed";
import { ApprovalSidebar } from "../components/ApprovalSidebar";
import { NewAgentModal } from "../components/NewAgentModal";
import { PinnedPanel } from "../components/ManagerChat";
import { useAgentStore, selectPendingApprovals } from "../stores/agent-store";
import { useManagerStore } from "../stores/manager-store";

export function Dashboard() {
  const isPinned = useManagerStore((s) => s.isPinned);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const pendingCount = useAgentStore(selectPendingApprovals()).length;

  return (
    <>
      <AppShell
        header={{ height: 52 }}
        aside={{ width: isPinned ? 560 : 320, breakpoint: "md" }}
        padding="md"
      >
        <AppShell.Header
          style={{
            display: "flex",
            alignItems: "center",
            paddingInline: "var(--mantine-spacing-md)",
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
            <Text size="lg" fw={700}>+</Text>
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

        <AppShell.Aside p={isPinned ? 0 : "md"}>
          {isPinned ? (
            <PinnedPanel />
          ) : (
            <ScrollArea h="100%">
              <Stack gap="md">
                <Group justify="space-between">
                  <Text size="sm" fw={600}>
                    Approvals
                  </Text>
                  {pendingCount > 0 && (
                    <Badge variant="filled" color="red" size="sm">
                      {pendingCount}
                    </Badge>
                  )}
                </Group>
                <ApprovalSidebar />
              </Stack>
            </ScrollArea>
          )}
        </AppShell.Aside>
      </AppShell>

      <NewAgentModal opened={modalOpened} onClose={closeModal} />
    </>
  );
}
