import { Group, Text, UnstyledButton } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import { useNavigate, useLocation } from "react-router-dom";

const TABS = [
  { path: "/", label: "Agents" },
  { path: "/notifications", label: "Inbox" },
  { path: "/schedule", label: "Schedule" },
];

interface AppHeaderProps {
  /** Extra content to render on the right side of the header */
  rightContent?: React.ReactNode;
}

export function AppHeader({ rightContent }: AppHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 24px",
        paddingLeft: 90,
        gap: 12,
        borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--mantine-color-dark-8) 80%, transparent)",
        backdropFilter: "blur(8px)",
        WebkitAppRegion: "drag",
        flexShrink: 0,
      }}
    >
      <Group gap={6} style={{ WebkitAppRegion: "no-drag", minWidth: 120 }} wrap="nowrap">
        <Text size="md" fw={700}>Claude Deck</Text>
      </Group>

      {/* Centered tabs */}
      <Group gap={4} style={{ WebkitAppRegion: "no-drag", position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
        {TABS.map(tab => {
          const isActive = tab.path === "/" ? location.pathname === "/" : location.pathname.startsWith(tab.path);
          return (
            <UnstyledButton
              key={tab.path}
              onClick={() => navigate(tab.path)}
              style={{
                padding: "4px 14px",
                borderRadius: 6,
                fontSize: "0.8rem",
                fontWeight: 500,
                backgroundColor: isActive ? "var(--mantine-color-dark-6)" : "transparent",
                color: isActive ? "var(--mantine-color-text)" : "var(--mantine-color-dimmed)",
              }}
            >
              {tab.label}
            </UnstyledButton>
          );
        })}
      </Group>

      {/* Right side */}
      <Group gap={8} style={{ WebkitAppRegion: "no-drag", marginLeft: "auto" }}>
        {rightContent}
        <UnstyledButton
          onClick={() => navigate("/settings")}
          style={{ padding: 4, borderRadius: 4, color: location.pathname === "/settings" ? "var(--mantine-color-blue-4)" : "var(--mantine-color-dimmed)" }}
        >
          <IconSettings size={16} />
        </UnstyledButton>
      </Group>
    </div>
  );
}
