/**
 * GlobalLoadingBanner — thin horizontal strip shown at the top of page content
 * when a global data refresh is in progress. All pages render this immediately
 * after <AppHeader /> so users see a single, consistent loading indicator.
 */

import { Group, Loader, Text } from "@mantine/core";
import { useGlobalRefresh } from "../hooks/useGlobalRefresh";

export function GlobalLoadingBanner() {
  const { isRefreshing } = useGlobalRefresh();

  if (!isRefreshing) return null;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 16px",
        background: "rgba(74, 125, 255, 0.06)",
        borderBottom: "1px solid rgba(74, 125, 255, 0.12)",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Cosmic strip animation */}
      <div className="aegen-loading-strip" style={{ position: "absolute", bottom: 0, left: 0, right: 0 }} />
      <Group gap={8}>
        <Loader size={12} color="var(--aegen-cosmic-blue)" />
        <Text size="xs" c="blue.5" fw={500}>
          Refreshing...
        </Text>
      </Group>
    </div>
  );
}
