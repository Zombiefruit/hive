/**
 * Shared hook for poll lifecycle state.
 * Both Inbox and Projects pages subscribe to the same poll events.
 */

import { useState, useRef, useEffect } from "react";

export interface PollStatus {
  fetching: boolean;
  lastRefreshed: string | null;
  pollProgress: { source: string; current: number; total: number } | null;
}

export function usePollStatus(): PollStatus {
  const [fetching, setFetching] = useState(true);
  const fetchingRef = useRef(true);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [pollProgress, setPollProgress] = useState<{ source: string; current: number; total: number } | null>(null);

  useEffect(() => {
    const unsubStarted = window.deck.onPollingStarted?.(() => {
      setFetching(true);
      fetchingRef.current = true;
      setPollProgress(null);
    });
    const unsubFinished = window.deck.onPollingFinished?.(() => {
      setFetching(false);
      fetchingRef.current = false;
      setPollProgress(null);
      setLastRefreshed(new Date().toISOString());
    });
    const unsubProgress = window.deck.onPollingProgress?.((data: { source: string; current: number; total: number }) => {
      setPollProgress(data);
    });

    return () => {
      unsubStarted?.();
      unsubFinished?.();
      unsubProgress?.();
    };
  }, []);

  return { fetching, lastRefreshed, pollProgress };
}
