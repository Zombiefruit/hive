/**
 * Shared UI components — reusable patterns extracted from pages.
 *
 * EmptyState, SectionHeader, SourceIcon, formatTimeSince.
 */

import { Badge, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconFileText } from "@tabler/icons-react";
import type { FC, ReactNode } from "react";

// ── Utilities ──

const KNOWN_SOURCES = new Set(["linear", "slack", "github", "notion", "email", "manual"]);

export function formatTimeSince(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function getSourceIconName(source: string): string {
  return KNOWN_SOURCES.has(source) ? source : "unknown";
}

// ── EmptyState ──

interface EmptyStateProps {
  icon: FC<{ size?: number; color?: string; stroke?: number }>;
  message: string;
  detail?: string;
}

export function EmptyState({ icon: Icon, message, detail }: EmptyStateProps) {
  return (
    <Stack align="center" py="xl" gap="sm">
      <ThemeIcon variant="light" color="gray" size="xl" radius="xl">
        <Icon size={24} stroke={1.5} />
      </ThemeIcon>
      <Text size="sm" c="dimmed">{message}</Text>
      {detail && <Text size="xs" c="dimmed">{detail}</Text>}
    </Stack>
  );
}

// ── SectionHeader ──

interface SectionHeaderProps {
  label: string;
  count?: number;
  color?: string;
  children?: ReactNode;
}

export function SectionHeader({ label, count, color, children }: SectionHeaderProps) {
  return (
    <Group justify="space-between" mb="xs">
      <Group gap={8}>
        {color && <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color }} />}
        <Text size="sm" fw={600}>{label}</Text>
        {count != null && (
          <Badge size="xs" variant="light" color="gray">{count}</Badge>
        )}
      </Group>
      {children}
    </Group>
  );
}

// ── Card wrapper ──

interface CardProps {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  "aria-label"?: string;
}

export function Card({ children, onClick, active, "aria-label": ariaLabel }: CardProps) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      onClick={onClick}
      aria-label={ariaLabel}
      className="deck-card"
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        border: `1px solid ${active
          ? "var(--mantine-color-blue-7)"
          : "color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)"}`,
        backgroundColor: active ? "color-mix(in srgb, var(--mantine-color-blue-9) 20%, var(--mantine-color-dark-7))" : "var(--mantine-color-dark-7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        transition: "background-color 0.15s, border-color 0.15s",
        cursor: onClick ? "pointer" : "default",
        width: "100%",
        textAlign: "left",
        // Reset button defaults
        ...(onClick ? { font: "inherit", color: "inherit" } : {}),
      }}
    >
      {children}
    </Component>
  );
}
