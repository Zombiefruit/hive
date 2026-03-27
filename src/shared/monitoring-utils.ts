/** Proactive monitoring utilities — notification batching and stale item detection. */

interface NotificationItem {
  title: string;
  priority: string;
  taskType?: string;
  startTime?: string;
}

/** Batch multiple new items into a single desktop notification message. */
export function batchNotificationMessage(items: NotificationItem[]): string {
  if (items.length === 0) return "";

  const critical = items.filter(i => i.priority === "critical");
  const rest = items.filter(i => i.priority !== "critical");

  if (critical.length > 0) {
    return rest.length > 0
      ? `${critical[0].title} (+${rest.length} more)`
      : critical[0].title;
  }

  return `${items.length} new items`;
}

/** Find stale items that should be auto-dismissed (e.g., past meetings). */
export function findStaleItems(
  items: Array<{ id: string; title: string; taskType?: string; startTime?: string }>,
  now: Date,
): string[] {
  return items
    .filter(i => {
      if (i.taskType === "meeting_prep" && i.startTime) {
        return new Date(i.startTime) < now;
      }
      return false;
    })
    .map(i => i.id);
}
