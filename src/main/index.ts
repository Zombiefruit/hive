import { app, BrowserWindow } from "electron";
import path from "node:path";
import { initDatabase, closeDatabase, getAllAgents, getMessages, getPendingApprovals, getAllContextRefs, getRecentEvents } from "./db/database";
import { registerIpcHandlers, startStoreSync, stopStoreSync } from "./ipc/bridge";
import type { StoreState, FleetMetrics } from "../shared/types";

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
      preload: path.join(__dirname, `../preload/index.js`),
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

  // Register IPC handlers (stubs for now — Phase 3 will implement real agent logic)
  registerIpcHandlers({
    onSpawn: async (config) => {
      console.log("[IPC] agent:spawn", config);
      return { ok: true };
    },
    onKill: async (agentId) => {
      console.log("[IPC] agent:kill", agentId);
    },
    onMessage: async (data) => {
      console.log("[IPC] agent:message", data);
    },
    onInterrupt: async (agentId) => {
      console.log("[IPC] agent:interrupt", agentId);
    },
    onApprovalResponse: async (data) => {
      console.log("[IPC] agent:approval-response", data);
    },
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
  closeDatabase();
});
