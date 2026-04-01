/**
 * Poll cache format + smart lookback calculation.
 *
 * Cache format v2: { notifications: PollNotification[], meta: { lastPollTimestamp } }
 * Backward compatible with v1 (bare array).
 */

/**
 * Compute lookback hours based on when we last polled.
 * - null (first poll) → 168 hours (7 days)
 * - recent → hoursSinceLastPoll + 1hr buffer, clamped to [1, 168]
 */
export function computeLookbackHours(lastPollTimestamp: string | null): number {
  if (!lastPollTimestamp) return 168;

  const msSince = Date.now() - new Date(lastPollTimestamp).getTime();
  const hoursSince = msSince / 3600000;
  return Math.max(1, Math.min(168, Math.ceil(hoursSince + 1)));
}

interface CacheParsed {
  notifications: unknown[];
  lastPollTimestamp: string | null;
}

/**
 * Parse raw cache JSON, handling both legacy (bare array) and new format.
 */
export function migrateCacheFormat(raw: string): CacheParsed {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { notifications: parsed, lastPollTimestamp: null };
    }
    if (parsed && Array.isArray(parsed.notifications)) {
      return {
        notifications: parsed.notifications,
        lastPollTimestamp: parsed.meta?.lastPollTimestamp ?? null,
      };
    }
    return { notifications: [], lastPollTimestamp: null };
  } catch {
    return { notifications: [], lastPollTimestamp: null };
  }
}

/**
 * Build the cache payload in the new format.
 */
export function buildCachePayload(notifications: unknown[], lastPollTimestamp: string | null): string {
  return JSON.stringify({ notifications, meta: { lastPollTimestamp } });
}
