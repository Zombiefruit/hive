import { BrowserWindow, ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/types";
import type { StoreState } from "../../shared/types";

type StoreGetter = () => StoreState;
type AgentSpawnHandler = (config: unknown) => Promise<unknown>;
type AgentActionHandler = (data: unknown) => Promise<void>;
type ApprovalResponseHandler = (data: { approvalId: string; approved: boolean }) => Promise<void>;

interface BridgeHandlers {
  onSpawn: AgentSpawnHandler;
  onKill: AgentActionHandler;
  onMessage: AgentActionHandler;
  onInterrupt: AgentActionHandler;
  onApprovalResponse: ApprovalResponseHandler;
}

let syncTimer: ReturnType<typeof setInterval> | null = null;
let getStore: StoreGetter | null = null;

export function registerIpcHandlers(handlers: BridgeHandlers): void {
  ipcMain.handle(IPC_CHANNELS.AGENT_SPAWN, (_event, config) =>
    handlers.onSpawn(config)
  );
  ipcMain.handle(IPC_CHANNELS.AGENT_KILL, (_event, agentId) =>
    handlers.onKill(agentId)
  );
  ipcMain.handle(IPC_CHANNELS.AGENT_MESSAGE, (_event, data) =>
    handlers.onMessage(data)
  );
  ipcMain.handle(IPC_CHANNELS.AGENT_INTERRUPT, (_event, agentId) =>
    handlers.onInterrupt(agentId)
  );
  ipcMain.handle(IPC_CHANNELS.APPROVAL_RESPONSE, (_event, data) =>
    handlers.onApprovalResponse(data)
  );
}

/** Start syncing store state to all renderer windows at a throttled rate. */
export function startStoreSync(getter: StoreGetter, intervalMs = 500): void {
  getStore = getter;
  if (syncTimer) clearInterval(syncTimer);
  let lastHash = "";
  syncTimer = setInterval(() => {
    if (!getStore) return;
    const state = getStore();
    // Dirty-check: only broadcast if state actually changed
    const hash = JSON.stringify(state);
    if (hash === lastHash) return;
    lastHash = hash;
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.STORE_SYNC, state);
      } catch {}
    }
  }, intervalMs);
}

/** Send a store update to all open windows immediately (bypasses dirty-check). */
export function broadcastStoreUpdate(): void {
  if (!getStore) return;
  const state = getStore();
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.STORE_SYNC, state);
    } catch {}
  }
}

/** Send a stream event for a specific agent to all windows. */
export function broadcastAgentStream(agentId: string, message: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.AGENT_STREAM, { agentId, message });
    }
  }
}

/** Send an approval request to all windows. */
export function broadcastApprovalRequest(approval: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.APPROVAL_REQUEST, approval);
    }
  }
}

export function stopStoreSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
