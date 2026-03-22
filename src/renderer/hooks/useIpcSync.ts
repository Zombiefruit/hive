import { useEffect } from "react";
import { useAgentStore } from "../stores/agent-store";
import type { StoreState } from "../../shared/types";

/**
 * Subscribes to IPC store sync and agent stream events from the main process.
 * Call once at the app root.
 */
export function useIpcSync(): void {
  const syncFromMain = useAgentStore((s) => s.syncFromMain);

  useEffect(() => {
    const unsub = window.deck.onStoreUpdate((state) => {
      const s = state as StoreState;
      if (s.agents?.length > 0) {
        console.log(`[IPC Sync] Received ${s.agents.length} agents, ${s.events?.length ?? 0} events`);
      }
      syncFromMain(s);
    });
    return unsub;
  }, [syncFromMain]);
}
