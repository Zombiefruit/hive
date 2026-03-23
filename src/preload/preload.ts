import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Open URL in default browser (via IPC to main process)
  openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),

  // Agent lifecycle
  spawnAgent: (config: unknown) => ipcRenderer.invoke("agent:spawn", config),
  killAgent: (agentId: string) => ipcRenderer.invoke("agent:kill", agentId),
  sendMessage: (agentId: string, message: string) =>
    ipcRenderer.invoke("agent:message", { agentId, message }),
  interruptAgent: (agentId: string) =>
    ipcRenderer.invoke("agent:interrupt", agentId),
  resumeSession: (agentId: string, sessionId: string, cwd: string) =>
    ipcRenderer.invoke("agent:resume", { agentId, sessionId, cwd }),

  // Approval
  respondToApproval: (approvalId: string, approved: boolean) =>
    ipcRenderer.invoke("agent:approval-response", { approvalId, approved }),

  // Work dispatcher
  prepareWorkPlan: (notification: { id: string; source: string; title: string; summary: string; url?: string }) =>
    ipcRenderer.invoke("work:prepare-plan", notification),
  iteratePlan: (notificationId: string, feedback: string) =>
    ipcRenderer.invoke("work:iterate-plan", { notificationId, feedback }),
  getPlan: (notificationId: string) =>
    ipcRenderer.invoke("work:get-plan", notificationId),
  startWorkAgent: (notificationId: string) =>
    ipcRenderer.invoke("work:start-agent", notificationId),

  // Task events (work agent stream)
  onTaskEvent: (callback: (data: { agentId: string; event: unknown }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { agentId: string; event: unknown }) => callback(data);
    ipcRenderer.on("task:event", listener);
    return () => ipcRenderer.removeListener("task:event", listener);
  },

  // Session history
  listAllSessions: () => ipcRenderer.invoke("sessions:list-all"),

  // Notifications
  getNotifications: () => ipcRenderer.invoke("notifications:get"),
  dismissNotification: (id: string) => ipcRenderer.invoke("notifications:dismiss", id),
  startWorkOnNotification: (id: string) => ipcRenderer.invoke("notifications:start-work", id),
  clearNotifications: () => ipcRenderer.invoke("notifications:clear"),
  updateNotificationByTitle: (titleSubstring: string, changes: Record<string, unknown>) =>
    ipcRenderer.invoke("notifications:update-by-title", { titleSubstring, changes }),
  updateNotificationById: (id: string, changes: Record<string, unknown>) =>
    ipcRenderer.invoke("notifications:update-by-id", { id, changes }),
  refreshNotifications: (lookbackHours?: number) => ipcRenderer.invoke("notifications:refresh", lookbackHours),
  onNotificationsUpdate: (callback: (notifications: unknown[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown[]) => callback(data);
    ipcRenderer.on("notifications:update", listener);
    return () => ipcRenderer.removeListener("notifications:update", listener);
  },
  onPollingStarted: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("notifications:polling-started", listener);
    return () => ipcRenderer.removeListener("notifications:polling-started", listener);
  },
  onPollingFinished: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("notifications:polling-finished", listener);
    return () => ipcRenderer.removeListener("notifications:polling-finished", listener);
  },
  onPollingProgress: (callback: (data: { source: string; current: number; total: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { source: string; current: number; total: number }) => callback(data);
    ipcRenderer.on("notifications:polling-progress", listener);
    return () => ipcRenderer.removeListener("notifications:polling-progress", listener);
  },

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

  // Context management
  addContextUrl: (agentId: string, url: string) =>
    ipcRenderer.invoke("context:add-url", { agentId, url }),

  // Manager AI
  sendManagerMessage: (message: string) =>
    ipcRenderer.invoke("manager:send-message", message),
  getManagerConversations: () =>
    ipcRenderer.invoke("manager:list-conversations"),
  switchManagerConversation: (conversationId: string) =>
    ipcRenderer.invoke("manager:switch-conversation", conversationId),
  newManagerConversation: () =>
    ipcRenderer.invoke("manager:new-conversation"),
  deleteManagerConversation: (conversationId: string) =>
    ipcRenderer.invoke("manager:delete-conversation", conversationId),
  getManagerMessages: () =>
    ipcRenderer.invoke("manager:get-messages"),

  onManagerStream: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) =>
      callback(data);
    ipcRenderer.on("manager:stream", listener);
    return () => ipcRenderer.removeListener("manager:stream", listener);
  },

  // Approval requests from agents
  onApprovalRequest: (callback: (approval: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, approval: unknown) =>
      callback(approval);
    ipcRenderer.on("agent:approval-request", listener);
    return () =>
      ipcRenderer.removeListener("agent:approval-request", listener);
  },

  // Auth check
  checkAuth: () =>
    ipcRenderer.invoke("auth:check") as Promise<{
      installed: boolean;
      version: string | null;
      authenticated: boolean;
    }>,
} as const;

export type DeckAPI = typeof api;

contextBridge.exposeInMainWorld("deck", api);
