import { Group, Loader, Text, Tooltip, UnstyledButton, useMantineColorScheme } from "@mantine/core";
import { IconSettings, IconRefresh, IconSun, IconMoon } from "@tabler/icons-react";
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

function ThemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const next = colorScheme === "dark" ? "light" : "dark";
  const Icon = colorScheme === "dark" ? IconMoon : IconSun;
  return (
    <UnstyledButton
      onClick={() => setColorScheme(next)}
      aria-label={`Switch to ${next} mode`}
      style={{ padding: 4, borderRadius: 4, color: "var(--aegen-dust-gray, var(--mantine-color-dimmed))" }}
    >
      <Icon size={16} />
    </UnstyledButton>
  );
}

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
        borderBottom: "1px solid rgba(68, 73, 85, 0.2)",
        background: "rgba(16, 21, 32, 0.8)",
        backdropFilter: "blur(16px) saturate(1.2)",
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
                backgroundColor: isActive ? "rgba(74, 125, 255, 0.08)" : "transparent",
                color: isActive ? "var(--aegen-star-white)" : "var(--aegen-dust-gray)",
                boxShadow: isActive ? "0 0 12px rgba(74, 125, 255, 0.15)" : "none",
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
              color: refreshing ? "var(--aegen-cosmic-blue)" : "var(--aegen-dust-gray)",
            }}
          >
            {refreshing ? <Loader size={14} /> : <IconRefresh size={16} />}
          </UnstyledButton>
        </Tooltip>
        <ThemeToggle />
        <UnstyledButton
          onClick={() => navigate("/settings")}
          style={{ padding: 4, borderRadius: 4, color: location.pathname === "/settings" ? "var(--aegen-cosmic-blue)" : "var(--aegen-dust-gray)" }}
        >
          <IconSettings size={16} />
        </UnstyledButton>
      </Group>
    </div>
  );
}
