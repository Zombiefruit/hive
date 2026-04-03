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
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 16px",
        backgroundColor: "color-mix(in srgb, var(--mantine-color-blue-light) 40%, transparent)",
        borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-blue-4) 20%, transparent)",
        flexShrink: 0,
      }}
    >
      <Group gap={8}>
        <Loader size={12} color="var(--mantine-color-blue-5)" />
        <Text size="xs" c="blue.5" fw={500}>
          Refreshing...
        </Text>
      </Group>
    </div>
  );
}
