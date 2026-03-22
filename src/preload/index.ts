import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Agent lifecycle
  spawnAgent: (config: unknown) => ipcRenderer.invoke("agent:spawn", config),
  killAgent: (agentId: string) => ipcRenderer.invoke("agent:kill", agentId),
  sendMessage: (agentId: string, message: string) =>
    ipcRenderer.invoke("agent:message", { agentId, message }),
  interruptAgent: (agentId: string) =>
    ipcRenderer.invoke("agent:interrupt", agentId),

  // Approval
  respondToApproval: (approvalId: string, approved: boolean) =>
    ipcRenderer.invoke("agent:approval-response", { approvalId, approved }),

  // Store sync — renderer subscribes to state updates from main
  onStoreUpdate: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) =>
      callback(state);
    ipcRenderer.on("store:sync", listener);
    return () => ipcRenderer.removeListener("store:sync", listener);
  },

  // Stream events — renderer subscribes to agent message stream
  onAgentStream: (
    callback: (agentId: string, message: unknown) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { agentId: string; message: unknown }
    ) => callback(data.agentId, data.message);
    ipcRenderer.on("agent:stream", listener);
    return () => ipcRenderer.removeListener("agent:stream", listener);
  },

  // Approval requests from agents
  onApprovalRequest: (callback: (approval: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, approval: unknown) =>
      callback(approval);
    ipcRenderer.on("agent:approval-request", listener);
    return () =>
      ipcRenderer.removeListener("agent:approval-request", listener);
  },
} as const;

export type DeckAPI = typeof api;

contextBridge.exposeInMainWorld("deck", api);
