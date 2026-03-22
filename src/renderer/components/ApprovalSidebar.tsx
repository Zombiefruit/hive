import { Badge, Button, Card, Code, Group, Stack, Text } from "@mantine/core";
import { useAgentStore, usePendingApprovals } from "../stores/agent-store";

const riskColors: Record<string, string> = {
  low: "green",
  medium: "yellow",
  high: "red",
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
      {approvals.map((approval) => (
        <Card key={approval.id} padding="sm" radius="sm" withBorder>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="xs" fw={500} truncate>
                {agentNameMap.get(approval.agentId) ?? "Agent"}
              </Text>
              <Badge
                variant="light"
                color={riskColors[approval.riskLevel] ?? "gray"}
                size="xs"
              >
                {approval.riskLevel} risk
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
                onClick={() => window.deck.respondToApproval(approval.id, true)}
                style={{ flex: 1 }}
              >
                Approve
              </Button>
              <Button
                size="xs"
                color="red"
                variant="light"
                onClick={() => window.deck.respondToApproval(approval.id, false)}
                style={{ flex: 1 }}
              >
                Reject
              </Button>
            </Group>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
