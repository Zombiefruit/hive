import { Loader, Text, Tooltip, UnstyledButton, useMantineColorScheme } from "@mantine/core";
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
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useGlobalRefresh } from "../hooks/useGlobalRefresh";
import { useIsFullscreen } from "./AppHeader";

const SIDEBAR_WIDTH_EXPANDED = 220;
const SIDEBAR_WIDTH_COLLAPSED = 60;

const NAV_ITEMS = [
  { path: "/", label: "Agents", icon: IconSparkles },
  { path: "/notifications", label: "Inbox", icon: IconInbox },
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
  const { isRefreshing, refresh } = useGlobalRefresh();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const topPadding = isFullscreen ? 8 : 38;

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
      {/* Brand / drag region for macOS title bar */}
      <div
        style={{
          paddingTop: topPadding,
          paddingBottom: 4,
          paddingLeft: collapsed ? 0 : 16,
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          WebkitAppRegion: "drag",
          transition: "padding-top 0.2s ease, padding-left 0.2s ease",
          flexShrink: 0,
        }}
      >
        <Text
          size="md"
          fw={700}
          style={{
            color: "var(--aegen-star-white)",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {collapsed ? "H" : "Hive"}
        </Text>
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
            label={`Switch to ${colorScheme === "dark" ? "light" : "dark"} mode`}
            position="right"
            withArrow
          >
            <UnstyledButton
              onClick={() =>
                setColorScheme(colorScheme === "dark" ? "light" : "dark")
              }
              aria-label={`Switch to ${colorScheme === "dark" ? "light" : "dark"} mode`}
              style={{
                padding: 6,
                borderRadius: 6,
                color: "var(--aegen-dust-gray)",
                transition: "color 0.15s ease",
              }}
            >
              {colorScheme === "dark" ? (
                <IconSun size={16} />
              ) : (
                <IconMoon size={16} />
              )}
            </UnstyledButton>
          </Tooltip>

          <Tooltip label="Refresh all data sources" position="right" withArrow>
            <UnstyledButton
              onClick={refresh}
              disabled={isRefreshing}
              aria-label="Refresh all data sources"
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
