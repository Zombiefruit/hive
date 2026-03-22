import { app, BrowserWindow } from "electron";
import path from "node:path";
import { initDatabase, closeDatabase, getAllAgents, getMessages, getPendingApprovals, getAllContextRefs, getRecentEvents } from "./db/database";
import { registerIpcHandlers, startStoreSync, stopStoreSync } from "./ipc/bridge";
import { spawnAgent, sendMessage, interruptAgent, killAgent } from "./agents/agent-manager";
import { handleApprovalResponse } from "./agents/approval-handler";
import { watchSessions } from "./agents/session-discovery";
import { addContextFromUrl } from "./agents/context-tracker";
import {
  initManager,
  setManagerStreamCallback,
  sendManagerMessage,
  getManagerConversations,
  switchManagerConversation,
  newManagerConversation,
  deleteManagerConversation,
  getActiveManagerMessages,
  stopManager,
} from "./manager/manager-ai";
import type { StoreState, FleetMetrics, SpawnAgentConfig } from "../shared/types";
import { ipcMain } from "electron";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

function buildStoreState(): StoreState {
  const agents = getAllAgents();
  const approvals = getPendingApprovals();
  const events = getRecentEvents(100);
  const allContextRefs = getAllContextRefs();

  // Build per-agent message and context maps
  const messages: Record<string, ReturnType<typeof getMessages>> = {};
  const contextRefs: Record<string, typeof allContextRefs> = {};

  for (const agent of agents) {
    messages[agent.id] = getMessages(agent.id);
    contextRefs[agent.id] = allContextRefs.filter((r) => r.agentId === agent.id);
  }

  const metrics: FleetMetrics = {
    active: agents.filter((a) => a.status === "active").length,
    idle: agents.filter((a) => a.status === "idle").length,
    errored: agents.filter((a) => a.status === "errored").length,
    completed: agents.filter((a) => a.status === "completed").length,
    totalTokens: agents.reduce((sum, a) => sum + a.inputTokens + a.outputTokens, 0),
    totalCostUsd: agents.reduce((sum, a) => sum + a.costUsd, 0),
  };

  return { agents, messages, approvals, contextRefs, events, metrics };
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }
};

app.whenReady().then(() => {
  // Initialize database
  initDatabase();

  // Register IPC handlers with real agent logic
  registerIpcHandlers({
    onSpawn: async (config) => {
      const agentId = await spawnAgent(config as SpawnAgentConfig);
      return { agentId };
    },
    onKill: async (agentId) => {
      killAgent(agentId as string);
    },
    onMessage: async (data) => {
      const { agentId, message } = data as { agentId: string; message: string };
      sendMessage(agentId, message);
    },
    onInterrupt: async (agentId) => {
      await interruptAgent(agentId as string);
    },
    onApprovalResponse: async (data) => {
      handleApprovalResponse(data.approvalId, data.approved);
    },
  });

  // Register context URL handler
  ipcMain.handle("context:add-url", (_event, data: { agentId: string; url: string }) => {
    return addContextFromUrl(data.agentId, data.url);
  });

  // Initialize Manager AI
  initManager();
  setManagerStreamCallback((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("manager:stream", event);
      }
    }
  });

  // Manager IPC handlers
  ipcMain.handle("manager:send-message", async (_event, message: string) => {
    return await sendManagerMessage(message);
  });
  ipcMain.handle("manager:list-conversations", () => {
    return getManagerConversations();
  });
  ipcMain.handle("manager:switch-conversation", (_event, id: string) => {
    switchManagerConversation(id);
  });
  ipcMain.handle("manager:new-conversation", () => {
    return newManagerConversation();
  });
  ipcMain.handle("manager:delete-conversation", (_event, id: string) => {
    deleteManagerConversation(id);
  });
  ipcMain.handle("manager:get-messages", () => {
    return getActiveManagerMessages();
  });

  // Watch for external Claude sessions
  const stopWatching = watchSessions((sessions) => {
    console.log(`[SessionDiscovery] Found ${sessions.length} sessions, ${sessions.filter(s => s.isAlive).length} alive`);
  });

  // Start periodic store sync to renderer (every 100ms)
  startStoreSync(buildStoreState, 100);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopStoreSync();
  stopManager();
  closeDatabase();
});

// Keep TypeScript happy — stopWatching is used in before-quit via closure
void 0;
