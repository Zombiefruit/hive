import { Group, Text, UnstyledButton } from "@mantine/core";
import { IconFilter } from "@tabler/icons-react";
import { StatusDot } from "./StatusDot";
import { useState } from "react";

const filters = [
  { value: "active", label: "Running", status: "active" },
  { value: "completed", label: "Completed", status: "completed" },
] as const;

interface AgentFilterBarProps {
  activeFilters: Set<string>;
  onToggle: (filter: string) => void;
  totalCount: number;
}

export function AgentFilterBar({ activeFilters, onToggle, totalCount }: AgentFilterBarProps) {
  return (
    <Group gap="xs" align="center">
      <IconFilter size={14} color="var(--mantine-color-dimmed)" />
      {filters.map((f) => {
        const isActive = activeFilters.has(f.value);
        return (
          <UnstyledButton
            key={f.value}
            onClick={() => onToggle(f.value)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: "0.75rem",
              fontWeight: 500,
              border: isActive
                ? "1px solid rgba(68, 73, 85, 0.2)"
                : "1px solid transparent",
              backgroundColor: isActive ? "var(--mantine-color-default-hover)" : "transparent",
              color: isActive ? "var(--mantine-color-text)" : "var(--mantine-color-dimmed)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <StatusDot status={f.status} size={6} pulse={false} />
            {f.label}
          </UnstyledButton>
        );
      })}
    </Group>
  );
}
