import { Badge, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconUser, IconExternalLink } from "@tabler/icons-react";
import { ActionButton } from "./ActionButton";
import { parseMeetingPrepContext } from "../../shared/meeting-prep-parser";

interface MeetingPrepDetailViewProps {
  notification: {
    id: string;
    title: string;
    stage?: string;
  };
  fetchedContext: Array<{ type: string; content: string; timestamp: string }>;
  onMarkDone?: () => void;
}

export function MeetingPrepDetailView({ notification, fetchedContext, onMarkDone }: MeetingPrepDetailViewProps) {
  const data = parseMeetingPrepContext(fetchedContext);

  const isPreparing = notification.stage === "preparing";
  const isReady = notification.stage === "ready";

  if (isPreparing && fetchedContext.length === 0) {
    return (
      <Stack gap={8} py="md">
        <Text size="sm" c="dimmed">Gathering context from calendar, Slack, and Linear...</Text>
      </Stack>
    );
  }

  if (!isReady && !isPreparing && fetchedContext.length === 0) {
    return (
      <Stack gap={8} py="md">
        <Text size="xs" c="dimmed">Click "Analyze" above to gather context and generate talking points.</Text>
      </Stack>
    );
  }

  return (
    <Stack gap={12}>
      {/* Attendees */}
      {data.attendees.length > 0 && (
        <div>
          <Text size="xs" fw={600} c="dimmed" mb={4}>Attendees</Text>
          <Group gap={8}>
            {data.attendees.map((a, i) => (
              <Group key={i} gap={4} style={{
                padding: "4px 10px", borderRadius: 6,
                backgroundColor: "var(--mantine-color-dark-7)",
                border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
              }}>
                <IconUser size={12} color="var(--mantine-color-dimmed)" />
                <Text size="xs">{a.name}</Text>
                {a.role && <Badge size="xs" variant="light" color="gray">{a.role}</Badge>}
              </Group>
            ))}
          </Group>
        </div>
      )}

      {/* Talking points */}
      {data.talkingPoints.length > 0 && (
        <div>
          <Text size="xs" fw={600} c="yellow.4" mb={6}>Talking Points</Text>
          <Stack gap={6}>
            {data.talkingPoints.map((tp, i) => (
              <div key={i} style={{
                padding: "8px 12px", borderRadius: 6,
                backgroundColor: "var(--mantine-color-dark-7)",
                border: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 20%, transparent)",
              }}>
                <Text size="xs" fw={500}>{i + 1}. {tp.point}</Text>
                {tp.source && (
                  <Text size="xs" c="dimmed" mt={2} style={{ fontSize: "0.6rem" }}>
                    Source: {tp.source}
                  </Text>
                )}
              </div>
            ))}
          </Stack>
        </div>
      )}

      {/* Related docs */}
      {data.relatedDocs.length > 0 && (
        <div>
          <Text size="xs" fw={600} c="dimmed" mb={4}>Related Documents</Text>
          <Group gap={6}>
            {data.relatedDocs.map((doc, i) => (
              <UnstyledButton
                key={i}
                onClick={() => window.deck?.openExternal?.(doc.url)}
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.7rem" }}
              >
                <Badge size="xs" variant="light" color={doc.type === "linear" ? "violet" : doc.type === "slack" ? "blue" : "gray"}>
                  {doc.type}
                </Badge>
                <Text size="xs" c="blue.4">{doc.label}</Text>
                <IconExternalLink size={10} color="var(--mantine-color-dimmed)" />
              </UnstyledButton>
            ))}
          </Group>
        </div>
      )}

      {/* Actions */}
      {isReady && onMarkDone && (
        <ActionButton
          label="Mark Done"
          description="Meeting completed. No agent action — just marks this task as done."
          onClick={onMarkDone}
          variant="outline"
        />
      )}
    </Stack>
  );
}
