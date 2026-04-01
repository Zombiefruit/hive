import { Text } from "@mantine/core";
import { IconTimeline } from "@tabler/icons-react";
import { EmptyState, formatTimeSince } from "./shared";

interface TimelineEntry {
  timestamp: string;
  event: string;
}

interface TimelineTabProps {
  entries: TimelineEntry[];
}

export function TimelineTab({ entries }: TimelineTabProps) {
  if (entries.length === 0) {
    return <EmptyState icon={IconTimeline} message="No timeline events." />;
  }

  return (
    <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
      <div style={{ borderLeft: "2px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)", paddingLeft: 12 }}>
        {[...entries].reverse().map((entry, i) => {
          const isCreation = entry.event.toLowerCase().includes("created") || entry.event.toLowerCase().includes("new");
          const isStage = entry.event.toLowerCase().includes("moved") || entry.event.toLowerCase().includes("stage");
          const dotColor = isCreation ? "var(--mantine-color-green-5)" : isStage ? "var(--mantine-color-blue-5)" : "var(--mantine-color-dimmed)";

          return (
            <div key={i} style={{ position: "relative", paddingBottom: 12, paddingLeft: 8 }}>
              <div style={{
                position: "absolute", left: -17, top: 4,
                width: 8, height: 8, borderRadius: "50%",
                backgroundColor: dotColor,
              }} />
              <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem" }}>
                {formatTimeSince(entry.timestamp)}
              </Text>
              <Text size="xs">{entry.event}</Text>
            </div>
          );
        })}
      </div>
    </div>
  );
}
