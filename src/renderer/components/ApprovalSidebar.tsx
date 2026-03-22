import { Badge, Button, Card, Code, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconCheck, IconX, IconShieldCheck, IconAlertTriangle } from "@tabler/icons-react";
import { useAgentStore, usePendingApprovals } from "../stores/agent-store";

const riskConfig: Record<string, { color: string; icon: typeof IconShieldCheck }> = {
  low: { color: "green", icon: IconShieldCheck },
  medium: { color: "yellow", icon: IconShieldCheck },
  high: { color: "red", icon: IconAlertTriangle },
};

export function ApprovalSidebar() {
  const approvals = usePendingApprovals();
  const agents = useAgentStore((s) => s.agents);

  const agentNameMap = new Map(agents.map((a) => [a.id, a.task.slice(0, 25)]));

  if (approvals.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        No pending approvals
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      {approvals.map((approval) => {
        const config = riskConfig[approval.riskLevel] ?? riskConfig.medium;
        return (
          <Card key={approval.id} padding="sm" radius="sm" withBorder>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="xs" fw={500} truncate>
                  {agentNameMap.get(approval.agentId) ?? "Agent"}
                </Text>
                <Badge
                  variant="light"
                  color={config.color}
                  size="xs"
                  leftSection={
                    <ThemeIcon variant="transparent" color={config.color} size={12}>
                      <config.icon size={10} stroke={1.5} />
                    </ThemeIcon>
                  }
                >
                  {approval.riskLevel}
                </Badge>
              </Group>

              <Text size="xs" c="dimmed">
                {approval.description}
              </Text>

              {approval.toolInput && (
                <Code block style={{ fontSize: "0.7rem", maxHeight: 80, overflow: "auto" }}>
                  {(() => {
                    try {
                      const parsed = JSON.parse(approval.toolInput);
                      return parsed.command ?? JSON.stringify(parsed, null, 2);
                    } catch {
                      return approval.toolInput;
                    }
                  })()}
                </Code>
              )}

              <Group gap="xs">
                <Button
                  size="xs"
                  color="green"
                  variant="light"
                  leftSection={<IconCheck size={14} stroke={2} />}
                  onClick={() => window.deck.respondToApproval(approval.id, true)}
                  style={{ flex: 1 }}
                >
                  Approve
                </Button>
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  leftSection={<IconX size={14} stroke={2} />}
                  onClick={() => window.deck.respondToApproval(approval.id, false)}
                  style={{ flex: 1 }}
                >
                  Reject
                </Button>
              </Group>
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}
