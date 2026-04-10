import { Loader, Menu, Text, Tooltip, UnstyledButton, useMantineColorScheme, useComputedColorScheme } from "@mantine/core";
import {
  IconSparkles,
  IconInbox,
  IconFolder,
  IconCalendar,
  IconTrendingUp,
  IconBulb,
  IconBrain,
  IconBuilding,
  IconCurrencyDollar,
  IconSettings,
  IconSun,
  IconMoon,
  IconDeviceDesktop,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconHexagon,
} from "@tabler/icons-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useGlobalRefresh } from "../hooks/useGlobalRefresh";
import { useIsFullscreen } from "./AppHeader";

const SIDEBAR_WIDTH_EXPANDED = 220;
const SIDEBAR_WIDTH_COLLAPSED = 60;

const NAV_ITEMS = [
  { path: "/", label: "Inbox", icon: IconInbox },
  { path: "/agents", label: "Agents", icon: IconSparkles },
  { path: "/projects", label: "Projects", icon: IconFolder },
  { path: "/schedule", label: "Schedule", icon: IconCalendar },
  { path: "/reflect", label: "Reflect", icon: IconTrendingUp },
  { path: "/insights", label: "Insights", icon: IconBulb },
  { path: "/memories", label: "Memories", icon: IconBrain },
  { path: "/context", label: "Context", icon: IconBuilding },
  { path: "/usage", label: "Usage", icon: IconCurrencyDollar },
];

export { SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED };

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isFullscreen = useIsFullscreen();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const computedScheme = useComputedColorScheme("dark");
  const { isRefreshing, refresh } = useGlobalRefresh();

  // Three-state cycle: auto → light → dark → auto
  const cycleTheme = () => {
    if (colorScheme === "auto") setColorScheme("light");
    else if (colorScheme === "light") setColorScheme("dark");
    else setColorScheme("auto");
  };
  const themeLabel = colorScheme === "auto" ? "Auto (system)" : colorScheme === "light" ? "Light" : "Dark";
  const ThemeIcon = colorScheme === "auto" ? IconDeviceDesktop : computedScheme === "dark" ? IconSun : IconMoon;

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const topPadding = 20;

  return (
    <nav
      style={{
        width,
        minWidth: width,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--aegen-glass-bg)",
        backdropFilter: "var(--aegen-glass-blur)",
        WebkitBackdropFilter: "var(--aegen-glass-blur)",
        borderRight: "1px solid var(--aegen-glass-border)",
        transition: "width 0.2s ease, min-width 0.2s ease",
        overflow: "hidden",
        flexShrink: 0,
        position: "relative",
        zIndex: 20,
      }}
    >
      {/* Brand / drag region for macOS title bar — fixed height prevents layout shift */}
      <div
        style={{
          paddingTop: topPadding,
          paddingBottom: 2,
          paddingLeft: collapsed ? 0 : 12,
          minHeight: 44,
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: collapsed ? "center" : "flex-start",
          WebkitAppRegion: "drag",
          transition: "padding-top 0.2s ease, padding-left 0.2s ease",
          flexShrink: 0,
        }}
      >
        <IconHexagon
          size={collapsed ? 20 : 18}
          stroke={1.8}
          style={{
            color: "var(--aegen-cosmic-blue)",
            flexShrink: 0,
          }}
        />
        {!collapsed && (
          <Text
            size="xs"
            fw={600}
            style={{
              color: "var(--aegen-star-white)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "var(--aegen-font-mono)",
              opacity: 0.85,
            }}
          >
            Relay
          </Text>
        )}
      </div>

      {/* Navigation items */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "8px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.path);
          const Icon = item.icon;

          const button = (
            <UnstyledButton
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: collapsed ? "8px 0" : "8px 12px",
                justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: 8,
                fontSize: "0.85rem",
                fontWeight: 500,
                color: isActive
                  ? "var(--aegen-cosmic-blue)"
                  : "var(--aegen-dust-gray)",
                backgroundColor: isActive
                  ? "rgba(74, 125, 255, 0.12)"
                  : "transparent",
                boxShadow: "none",
                transition:
                  "background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
                whiteSpace: "nowrap",
                overflow: "hidden",
                WebkitAppRegion: "no-drag",
                width: "100%",
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                if (!isActive) {
                  e.currentTarget.style.boxShadow =
                    "0 0 8px rgba(74, 125, 255, 0.08)";
                  e.currentTarget.style.backgroundColor =
                    "rgba(74, 125, 255, 0.06)";
                }
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                if (!isActive) {
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <Icon size={18} stroke={1.5} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{item.label}</span>}
            </UnstyledButton>
          );

          return collapsed ? (
            <Tooltip key={item.path} label={item.label} position="right" withArrow>
              {button}
            </Tooltip>
          ) : (
            button
          );
        })}
      </div>

      {/* Bottom section — Settings, Theme, Refresh, Collapse */}
      <div
        style={{
          padding: "8px 8px 12px",
          borderTop: "1px solid var(--aegen-glass-border)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          flexShrink: 0,
        }}
      >
        {/* Settings */}
        {(() => {
          const isSettingsActive = location.pathname === "/settings";
          const settingsBtn = (
            <UnstyledButton
              onClick={() => navigate("/settings")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: collapsed ? "8px 0" : "8px 12px",
                justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: 8,
                fontSize: "0.85rem",
                fontWeight: 500,
                color: isSettingsActive
                  ? "var(--aegen-cosmic-blue)"
                  : "var(--aegen-dust-gray)",
                backgroundColor: isSettingsActive
                  ? "rgba(74, 125, 255, 0.12)"
                  : "transparent",
                transition: "background-color 0.15s ease, color 0.15s ease",
                whiteSpace: "nowrap",
                overflow: "hidden",
                WebkitAppRegion: "no-drag",
                width: "100%",
              }}
            >
              <IconSettings size={18} stroke={1.5} style={{ flexShrink: 0 }} />
              {!collapsed && <span>Settings</span>}
            </UnstyledButton>
          );
          return collapsed ? (
            <Tooltip label="Settings" position="right" withArrow>
              {settingsBtn}
            </Tooltip>
          ) : (
            settingsBtn
          );
        })()}

        {/* Theme + Refresh + Collapse */}
        <div
          style={{
            display: "flex",
            flexDirection: collapsed ? "column" : "row",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: collapsed ? 2 : 4,
            padding: collapsed ? "4px 0" : "4px 8px",
            WebkitAppRegion: "no-drag",
          }}
        >
          <Tooltip
            label={`Theme: ${themeLabel}`}
            position="right"
            withArrow
          >
            <UnstyledButton
              onClick={cycleTheme}
              aria-label={`Theme: ${themeLabel}`}
              style={{
                padding: 6,
                borderRadius: 6,
                color: "var(--aegen-dust-gray)",
                transition: "color 0.15s ease",
              }}
            >
              <ThemeIcon size={16} />
            </UnstyledButton>
          </Tooltip>

          <Menu shadow="md" width={160} position="right-end">
            <Menu.Target>
              <Tooltip label={isRefreshing ? "Refreshing..." : "Refresh data sources"} position="right" withArrow>
                <UnstyledButton
                  aria-label="Refresh data sources"
                  style={{
                    padding: 6,
                    borderRadius: 6,
                    color: isRefreshing
                      ? "var(--aegen-cosmic-blue)"
                      : "var(--aegen-dust-gray)",
                    transition: "color 0.15s ease",
                  }}
                >
                  {isRefreshing ? <Loader size={14} /> : <IconRefresh size={16} />}
                </UnstyledButton>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => refresh()} disabled={isRefreshing} style={{ fontSize: "0.8rem" }}>Refresh (since last fetch)</Menu.Item>
              <Menu.Divider />
              <Menu.Label style={{ fontSize: "0.7rem" }}>{isRefreshing ? "Queue catch-up (runs next)" : "Catch-up"}</Menu.Label>
              <Menu.Item onClick={() => refresh(24)} style={{ fontSize: "0.8rem" }}>Last 24 hours</Menu.Item>
              <Menu.Item onClick={() => refresh(72)} style={{ fontSize: "0.8rem" }}>Last 3 days</Menu.Item>
              <Menu.Item onClick={() => refresh(168)} style={{ fontSize: "0.8rem" }}>Last 7 days</Menu.Item>
            </Menu.Dropdown>
          </Menu>

          <Tooltip
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            position="right"
            withArrow
          >
            <UnstyledButton
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{
                padding: 6,
                borderRadius: 6,
                color: "var(--aegen-dust-gray)",
                marginLeft: collapsed ? 0 : "auto",
                transition: "color 0.15s ease",
              }}
            >
              {collapsed ? (
                <IconChevronRight size={16} />
              ) : (
                <IconChevronLeft size={16} />
              )}
            </UnstyledButton>
          </Tooltip>
        </div>
      </div>
    </nav>
  );
}
