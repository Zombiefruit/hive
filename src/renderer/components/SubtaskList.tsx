/**
 * SubtaskList — renders a list of subtasks with stage dots, titles, and progress summary.
 * Used in both the kanban parent card (expanded) and the DetailDrawer.
 */

import { Badge, Group, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { STAGE_META } from "../../shared/ui-constants";

export interface SubtaskListProps {
  subtasks: Array<{ id: string; title: string; stage?: string }>;
  onSelect: (id: string) => void;
}

export function SubtaskList({ subtasks, onSelect }: SubtaskListProps) {
  if (subtasks.length === 0) {
    return (
      <Text size="xs" c="dimmed" ta="center" py={8}>
        No subtasks
      </Text>
    );
  }

  const doneCount = subtasks.filter(s => s.stage === "done").length;
  const total = subtasks.length;
  const pct = total > 0 ? (doneCount / total) * 100 : 0;

  return (
    <div style={{ padding: "4px 0" }}>
      {/* Progress summary */}
      <Group gap={8} mb={6} align="center">
        <div
          data-testid="subtask-progress-bar"
          style={{
            display: "flex",
            height: 4,
            borderRadius: 2,
            overflow: "hidden",
            flex: 1,
            backgroundColor: "rgba(74, 125, 255, 0.08)",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              backgroundColor: STAGE_META.done.color,
              borderRadius: 2,
              transition: "width 0.2s ease",
            }}
          />
        </div>
        <Text size="xs" c="dimmed" style={{ fontSize: "0.6rem", whiteSpace: "nowrap" }}>
          {doneCount} of {total} done
        </Text>
      </Group>

      {/* Subtask rows */}
      {subtasks.map(sub => {
        const stage = sub.stage ?? "new";
        const meta = STAGE_META[stage as keyof typeof STAGE_META] ?? { label: stage, color: "#6b7280" };

        return (
          <UnstyledButton
            key={sub.id}
            onClick={() => onSelect(sub.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 6px",
              borderRadius: 4,
              width: "100%",
              transition: "background-color 0.1s ease",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(74, 125, 255, 0.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
          >
            <Tooltip label={meta.label} withArrow position="left" fz="xs">
              <div
                data-testid="stage-dot"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: meta.color,
                  flexShrink: 0,
                }}
              />
            </Tooltip>
            <Text size="xs" lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
              {sub.title}
            </Text>
            <Badge
              size="xs"
              variant="light"
              style={{
                backgroundColor: `color-mix(in srgb, ${meta.color} 15%, transparent)`,
                color: meta.color,
                flexShrink: 0,
                fontSize: "0.5rem",
              }}
            >
              {meta.label}
            </Badge>
          </UnstyledButton>
        );
      })}
    </div>
  );
}
