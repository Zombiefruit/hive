/**
 * Shared poll status indicator — used by Inbox and Projects pages.
 * Shows fetching spinner with source progress, or green dot with item count + last updated.
 */

import { Text, Group, Loader } from "@mantine/core";
import type { PollStatus } from "../hooks/usePollStatus";

interface PollStatusIndicatorProps extends PollStatus {
  itemCount: number;
  itemLabel?: string; // "items" or "projects"
}

export function PollStatusIndicator({ fetching, pollProgress, lastRefreshed, itemCount, itemLabel = "items" }: PollStatusIndicatorProps) {
  if (fetching) {
    return (
      <>
        <Loader size={12} color="blue" />
        <Text size="xs" c="blue">
          {pollProgress
            ? pollProgress.source
            : "Fetching..."}
        </Text>
      </>
    );
  }

  return (
    <>
      <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "var(--mantine-color-green-filled)" }} />
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
