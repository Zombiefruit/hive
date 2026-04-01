/**
 * Shared poll status indicator — used by Inbox and Projects pages.
 * Shows fetching spinner with source progress, or green dot with item count + last updated.
 */

import { Text, Group } from "@mantine/core";
import type { PollStatus } from "../hooks/usePollStatus";

interface PollStatusIndicatorProps extends PollStatus {
  itemCount: number;
  itemLabel?: string; // "items" or "projects"
}

export function PollStatusIndicator({ fetching, pollProgress, lastRefreshed, itemCount, itemLabel = "items" }: PollStatusIndicatorProps) {
  if (fetching) {
    return (
      <>
        <div style={{ width: 14, height: 14, border: "2px solid var(--mantine-color-blue-5)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <Text size="xs" c="blue">
          {pollProgress
            ? `Fetching ${pollProgress.source} (${pollProgress.current}/${pollProgress.total})...`
            : "Fetching..."}
        </Text>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </>
    );
  }

  return (
    <>
      <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#22c55e" }} />
      <Text size="xs" c="dimmed">
        {itemCount} {itemLabel}{lastRefreshed ? ` · Updated ${formatTimeSince(lastRefreshed)}` : ""}
      </Text>
    </>
  );
}

function formatTimeSince(isoString: string): string {
  const seconds = Math.round((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
