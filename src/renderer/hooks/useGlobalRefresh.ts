/**
 * Shared global refresh state — single source of truth for whether
 * any data refresh is in progress. All pages import this hook.
 */

import { useState, useEffect, useCallback } from "react";

// Module-level state so all hook instances share it
// Default to true — the app always starts by fetching data.
// Set to false only when polling-finished fires.
let _isRefreshing = true;
const listeners = new Set<(v: boolean) => void>();

function setGlobalRefreshing(v: boolean) {
  _isRefreshing = v;
  for (const fn of listeners) fn(v);
}

// Wire up IPC listeners once (on first import in renderer)
let wired = false;
function wireIpc() {
  if (wired) return;
  wired = true;
  // Both manual global refresh AND automatic poll-on-startup trigger the loading state
  window.deck?.onGlobalRefreshStart?.(() => setGlobalRefreshing(true));
  window.deck?.onPollingStarted?.(() => setGlobalRefreshing(true));
  window.deck?.onPollingFinished?.(() => setGlobalRefreshing(false));

  // Safety: if polling-finished never fires within 10 min, clear the banner
  // (24h catch-up polls can take 5+ minutes for fetch + triage)
  setTimeout(() => {
    if (_isRefreshing) setGlobalRefreshing(false);
  }, 600_000);
}

export function useGlobalRefresh() {
  const [isRefreshing, setLocal] = useState(_isRefreshing);

  useEffect(() => {
    wireIpc();
    listeners.add(setLocal);
    // Sync in case state changed before mount
    setLocal(_isRefreshing);
    return () => { listeners.delete(setLocal); };
  }, []);

  const refresh = useCallback(async (lookbackHours?: number) => {
    setGlobalRefreshing(true);
    try { await window.deck?.globalRefresh?.(lookbackHours); } catch {}
    // Don't set false here — polling-finished event handles it
  }, []);

  return { isRefreshing, refresh };
}
