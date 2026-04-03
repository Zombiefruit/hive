import { Group, Loader, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconSettings, IconRefresh } from "@tabler/icons-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useGlobalRefresh } from "../hooks/useGlobalRefresh";

// Shared constants — match HEADER_HEIGHT in src/main/index.ts
export const TITLEBAR_HEIGHT = 44;
export const TITLEBAR_PADDING_LEFT = 90; // Clears traffic lights in windowed mode
export const TITLEBAR_PADDING_LEFT_FULLSCREEN = 16;

const TABS = [
  { path: "/", label: "Agents" },
  { path: "/notifications", label: "Inbox" },
  { path: "/projects", label: "Projects" },
  { path: "/schedule", label: "Schedule" },
  { path: "/coach", label: "Coach" },
  { path: "/insights", label: "Insights" },
  { path: "/memories", label: "Memories" },
  { path: "/context", label: "Context" },
];

interface AppHeaderProps {
  /** Extra content to render on the right side of the header */
  rightContent?: React.ReactNode;
}

// ThemeToggle removed — Aegen is dark-only

export function useIsFullscreen(): boolean {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const unsub = window.deck?.onFullscreenChange?.((isFullscreen: boolean) => setFs(isFullscreen));
    return () => { unsub?.(); };
  }, []);
  return fs;
}

export function AppHeader({ rightContent }: AppHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isFullscreen = useIsFullscreen();
  const { isRefreshing: refreshing, refresh: handleGlobalRefresh } = useGlobalRefresh();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: TITLEBAR_HEIGHT,
        padding: "0 24px",
        paddingLeft: isFullscreen ? TITLEBAR_PADDING_LEFT_FULLSCREEN : TITLEBAR_PADDING_LEFT,
        transition: "padding-left 0.2s ease",
        gap: 12,
        borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-default-border) 40%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--mantine-color-body) 80%, transparent)",
        backdropFilter: "blur(8px)",
        WebkitAppRegion: "drag",
        flexShrink: 0,
      }}
    >
      <Group gap={6} style={{ WebkitAppRegion: "no-drag", minWidth: 120 }} wrap="nowrap">
        <Text size="md" fw={700}>Hive</Text>
      </Group>

      {/* Centered tabs — fixed position so they don't jump when right content changes */}
      <Group gap={4} style={{ WebkitAppRegion: "no-drag", position: "absolute", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
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
                backgroundColor: isActive ? "var(--mantine-color-default-hover)" : "transparent",
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
        <Tooltip label="Refresh all data sources" withArrow>
          <UnstyledButton
            onClick={handleGlobalRefresh}
            disabled={refreshing}
            style={{
              padding: 4, borderRadius: 4,
              color: refreshing ? "var(--mantine-color-blue-4)" : "var(--mantine-color-dimmed)",
            }}
          >
            {refreshing ? <Loader size={14} /> : <IconRefresh size={16} />}
          </UnstyledButton>
        </Tooltip>
        {/* Dark mode only — no theme toggle */}
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
