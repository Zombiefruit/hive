import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { initDatabase, closeDatabase, getAllAgents, getMessages, getPendingApprovals, getAllContextRefs, getRecentEvents, upsertExternalAgent, cleanupStaleExternalAgents } from "./db/database";
import { registerIpcHandlers, startStoreSync, stopStoreSync } from "./ipc/bridge";
import { spawnAgent, sendMessage, interruptAgent, killAgent, resumeSession } from "./agents/agent-manager";
import { handleApprovalResponse } from "./agents/approval-handler";
import { watchSessions } from "./agents/session-discovery";
import { enrichExternalAgents } from "./agents/session-enricher";
import { startSessionTailing, stopSessionTailing } from "./agents/session-tailer";
import { addContextFromUrl } from "./agents/context-tracker";
import { listAllSessions } from "./agents/session-history";
import { startPolling, stopPolling, getNotifications, dismissNotification, startWorkOnNotification, clearAllNotifications, forcePoll, hasPolledOnce, getSkippedItems, updateNotificationByTitle, updateNotificationById, upsertNotification, createManualNotification } from "./notifications/poll-service";
import { startBridge, stopBridge, restartBridge, getBridgeDebugLog, clearBridgeDebugLog, getBridgeStatus } from "./mcp-bridge";
import { getProcessStats, startProcessSampling, stopProcessSampling } from "./process-monitor";
import { prepareWorkPlan, iteratePlan, startWorkAgent, getPlan, clearPlan, getAllPlans, getActiveWorkAgents } from "./notifications/work-dispatcher";
import { startMonitoring, stopMonitoring } from "./notifications/agent-monitor";
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
import { runSkill, checkRequiredSkills, type SkillInvocation } from "./skill-runner";
import type { PlanningEvent } from "./mcp-bridge";
import { getAllProjects, getProject } from "../shared/project-model";
import { startSlackHook, stopSlackHook } from "./notifications/slack-hook-service";
import type { StoreState, FleetMetrics, SpawnAgentConfig } from "../shared/types";
import type { DeckConfig } from "../shared/config-types";
import { ipcMain } from "electron";
import { initTray, updateTrayBadge } from "./tray";
import { checkClaudeAuth } from "./auth-check";
import { hasConfig, getConfig, saveConfig } from "./config";

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

  // Update tray badge with active agent count
  updateTrayBadge(metrics.active);

  return { agents, messages, approvals, contextRefs, events, metrics };
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 12 },
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

  // Run auth check (non-blocking — logs result, renderer queries via IPC)
  checkClaudeAuth()
    .then((status) => console.log("[auth-check]", status))
    .catch((err) => console.error("[auth-check] failed:", err));

  // Auth IPC handler
  ipcMain.handle("auth:check", () => checkClaudeAuth());

  // Diagnostic: test spawn behavior
  ipcMain.handle("debug:test-spawn", async () => {
    const { testSpawn } = await import("./test-spawn");
    return testSpawn();
  });

  // Bridge status & re-auth IPC handlers
  ipcMain.handle("bridge:status", () => getBridgeStatus());
  ipcMain.handle("bridge:restart", () => {
    restartBridge();
    return { ok: true };
  });
  // User search via MCP bridge (direct)
  ipcMain.handle("mcp:search-users", async (_event, source: string, query: string) => {
    try {
      const { askBridge: bridge } = await import("./mcp-bridge");
      const prompt = source === "slack"
        ? `Use mcp__claude_ai_Slack__slack_search_users with query "${query}". Return each user's name, display_name, and ID. Plain text only.`
        : `Use mcp__claude_ai_Linear__list_users. Return each user's name, email, and ID. Plain text only.`;
      const data = await bridge(prompt, 30000);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: String(err).slice(0, 200) };
    }
  });

  ipcMain.handle("bridge:open-auth-terminal", () => {
    const { exec } = require("node:child_process");
    // Open Terminal.app with claude running — user can type /mcp to fix auth
    exec(`osascript -e 'tell application "Terminal" to do script "claude"' -e 'tell application "Terminal" to activate'`);
    return { ok: true };
  });

  // Process monitor IPC handler
  ipcMain.handle("process:stats", () => getProcessStats());

  // Config IPC handlers
  ipcMain.handle("config:has", () => hasConfig());
  ipcMain.handle("config:get", () => getConfig());
  ipcMain.handle("config:save", (_event, config: DeckConfig) => {
    saveConfig(config);
    return { ok: true };
  });

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

  // Open URL in default browser — sanitize before opening
  ipcMain.handle("shell:open-external", (_event, url: string) => {
    if (!url || typeof url !== "string") return;
    // Only fix truly broken URLs. Valid Slack archive URLs (xxx.slack.com/archives/...)
    // should be left as-is — the browser opens them and Slack redirects to the native app
    // with full thread context. The slack:// protocol loses thread navigation.
    let safeUrl = url;
    const slackBroken = safeUrl.match(/^https?:\/\/slack\/\/channel\/([A-Z0-9]+)/i);
    if (slackBroken) {
      safeUrl = `https://app.slack.com/client/T/${slackBroken[1]}`;
    }
    if (!safeUrl.startsWith("http")) safeUrl = `https://${safeUrl}`;
    // Debug log for Slack URL troubleshooting
    if (safeUrl.includes("slack")) {
      console.log(`[open-external] Slack URL: ${safeUrl}`);
    }
    return shell.openExternal(safeUrl);
  });

  // Session history
  ipcMain.handle("sessions:list-all", () => {
    return listAllSessions();
  });

  // Notifications
  ipcMain.handle("notifications:get", () => {
    return { items: getNotifications(), skipped: getSkippedItems(), hasPolled: hasPolledOnce() };
  });
  ipcMain.handle("notifications:dismiss", (_event, id: string) => {
    dismissNotification(id);
  });
  ipcMain.handle("notifications:start-work", (_event, id: string) => {
    startWorkOnNotification(id);
  });
  ipcMain.handle("notifications:clear", () => {
    clearAllNotifications();
  });
  ipcMain.handle("notifications:refresh", (_event, lookbackHours?: number) => {
    forcePoll(lookbackHours);
  });
  ipcMain.handle("notifications:update-by-title", (_event, data: { titleSubstring: string; changes: Record<string, unknown> }) => {
    return updateNotificationByTitle(data.titleSubstring, data.changes);
  });
  ipcMain.handle("notifications:update-by-id", (_event, data: { id: string; changes: Record<string, unknown> }) => {
    return updateNotificationById(data.id, data.changes);
  });
  ipcMain.handle("notifications:upsert", (_event, data: Record<string, unknown>) => {
    return upsertNotification(data);
  });
  ipcMain.handle("notifications:create-manual", (_event, data: { title: string; summary: string; taskType: string; priority: string; estimatedMinutes?: number }) => {
    return createManualNotification(data);
  });

  // Work dispatcher
  ipcMain.handle("work:prepare-plan", async (_event, notification: { id: string; source: string; title: string; summary: string; url?: string }) => {
    return await prepareWorkPlan(notification);
  });

  ipcMain.handle("work:iterate-plan", async (_event, data: { notificationId: string; feedback: string }) => {
    return await iteratePlan(data.notificationId, data.feedback);
  });

  ipcMain.handle("work:get-plan", (_event, notificationId: string) => {
    return getPlan(notificationId);
  });
  ipcMain.handle("work:clear-plan", (_event, notificationId: string) => {
    clearPlan(notificationId);
  });

  ipcMain.handle("work:get-all-plans", () => {
    return getAllPlans();
  });

  ipcMain.handle("work:start-agent", async (_event, notificationId: string) => {
    return await startWorkAgent(notificationId);
  });

  // Start poll bridge (persistent — used by poll-service for fetch + triage)
  // Planning agents spawn their own MCP-enabled processes on demand.
  try { startBridge(); } catch (err) { console.error("Poll bridge start failed:", err); }

  // Start notification polling (uses bridge for MCP access)
  startPolling();

  // Start agent monitoring loop
  startMonitoring();

  // Start process monitor sampling (RSS tracking for spawned processes)
  startProcessSampling();

  // Start Slack hook if configured (real-time mention/DM monitoring)
  try {
    const cfg = hasConfig() ? getConfig() : null;
    if (cfg?.slackHookEnabled && cfg.slackUserId) {
      const managerCoworker = cfg.coworkers?.find(c => c.role === "manager");
      startSlackHook({
        userSlackId: cfg.slackUserId,
        channels: cfg.slackChannels.map(c => c.id),
        slackConfig: {
          managerSlackId: managerCoworker?.slackUserId ?? "",
          coworkerIds: new Set((cfg.coworkers ?? []).filter(c => c.slackUserId).map(c => c.slackUserId!)),
          workStart: cfg.workingHoursStart,
          workEnd: cfg.workingHoursEnd,
          timezone: cfg.timezone,
        },
      });
    }
  } catch (err) {
    console.error("Slack hook start failed:", err);
  }

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

  // Watch for external Claude sessions and sync them into the agent grid
  const stopWatching = watchSessions((sessions) => {
    const activeSessionIds = new Set<string>();
    for (const session of sessions) {
      activeSessionIds.add(session.sessionId);
      upsertExternalAgent(
        session.sessionId,
        session.pid,
        session.cwd,
        session.startedAt,
        session.isAlive
      );
    }
    cleanupStaleExternalAgents(activeSessionIds);
    // Enrich history + start live tailing for active sessions
    try { enrichExternalAgents(); } catch {}
    try { startSessionTailing(); } catch {}
  });

  // Resume session IPC handler
  ipcMain.handle("agent:resume", async (_event, data: { agentId: string; sessionId: string; cwd: string }) => {
    await resumeSession(data.agentId, data.sessionId, data.cwd);
    return { ok: true };
  });

  // Skill runner
  ipcMain.handle("skill:run", async (_event, invocation: SkillInvocation) => {
    const onEvent = (event: PlanningEvent) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send("planning:event", { notificationId: invocation.notificationId, event });
        }
      }
    };
    return runSkill(invocation, onEvent);
  });

  ipcMain.handle("skill:check", () => checkRequiredSkills());

  // Discover git repos in common locations
  ipcMain.handle("repos:discover", async () => {
    const os = require("node:os");
    const fs = require("node:fs");
    const path = require("node:path");
    const repos: Array<{ value: string; label: string }> = [];
    const searchDirs = [
      path.join(os.homedir(), "Documents", "GitHub"),
      path.join(os.homedir(), "repos"),
      path.join(os.homedir(), "src"),
      path.join(os.homedir(), "code"),
      path.join(os.homedir(), "projects"),
      path.join(os.homedir(), "dev"),
      path.join(os.homedir(), "workspace"),
    ];
    for (const dir of searchDirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const repoPath = path.join(dir, entry.name);
            const gitDir = path.join(repoPath, ".git");
            if (fs.existsSync(gitDir)) {
              repos.push({ value: repoPath, label: entry.name });
            }
          }
        }
      } catch {}
    }
    return repos;
  });

  // Send a Slack message via the poll bridge (for response tasks)
  ipcMain.handle("slack:send-message", async (_event, channel: string, threadTs: string, text: string) => {
    try {
      const { askBridge } = require("./mcp-bridge");
      const result = await askBridge(
        `Use mcp__claude_ai_Slack__slack_send_message with channel_id "${channel}", thread_ts "${threadTs}", and text "${text.replace(/"/g, '\\"')}". Return "sent" on success.`,
        60000
      );
      return { ok: true, data: result };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("linear:update", async (_event, data: { ticket: string; field: string; value: string }) => {
    try {
      const { askBridge } = require("./mcp-bridge");
      const result = await askBridge(
        `Use mcp__claude_ai_Linear__save_issue to update issue ${data.ticket}: set ${data.field} to "${data.value}". Return "updated" on success.`,
        30000,
      );
      return { ok: true, data: result };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Load persisted planning events for a notification (survives page navigation)
  ipcMain.handle("planning:get-events", (_event, notificationId: string) => {
    try {
      const cachePath = path.join(app.getPath("userData"), "planning-events-cache.json");
      const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      return cache[notificationId] ?? [];
    } catch { return []; }
  });

  ipcMain.handle("skill:read-plan", async (_event, repoPath: string, workSlug: string) => {
    try {
      const planPath = path.join(repoPath, ".work", workSlug, "plan.md");
      return fs.readFileSync(planPath, "utf-8");
    } catch { return null; }
  });

  ipcMain.handle("skill:read-review", async (_event, repoPath: string, workSlug: string) => {
    try {
      const reviewDir = path.join(repoPath, ".work", workSlug, "reviews");
      if (!fs.existsSync(reviewDir)) return [];
      const files = fs.readdirSync(reviewDir).filter(f => f.endsWith(".md")).sort();
      return files.map(f => ({
        filename: f,
        content: fs.readFileSync(path.join(reviewDir, f), "utf-8"),
      }));
    } catch { return []; }
  });

  // Projects
  ipcMain.handle("projects:get-all", () => getAllProjects());
  ipcMain.handle("projects:get", (_event, id: string) => getProject(id));

  // Start periodic store sync to renderer (every 100ms)
  startStoreSync(buildStoreState, 100);

  // Debug HTTP API — lets browser/Playwright access real data
  const debugServer = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    // Handle CORS preflight for POST requests
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    // GET endpoints
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    if (req.url === "/api/store") {
      res.end(JSON.stringify(buildStoreState()));
    } else if (req.url === "/api/notifications") {
      res.end(JSON.stringify(getNotifications()));
    } else if (req.url === "/api/sessions") {
      res.end(JSON.stringify(listAllSessions()));
    } else if (req.url === "/api/tasks") {
      res.end(JSON.stringify(getActiveWorkAgents()));
    } else if (req.url === "/api/processes") {
      res.end(JSON.stringify(getProcessStats()));
    } else if (req.url === "/api/debug") {
      res.end(JSON.stringify(getBridgeDebugLog()));
    } else if (req.url === "/api/debug/clear") {
      clearBridgeDebugLog();
      res.end(JSON.stringify({ ok: true }));
    } else if (req.url === "/api/test-spawn") {
      import("./test-spawn").then(({ testSpawn }) => {
        testSpawn().then(result => {
          res.end(JSON.stringify({ result }));
        });
      });
      return; // async — don't end twice
    } else {
      res.end(JSON.stringify({ endpoints: ["/api/store", "/api/notifications", "/api/sessions", "/api/processes", "/api/debug", "/api/test-spawn"] }));
    }
  });
  debugServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn("Debug server port 9876 in use, skipping");
    } else {
      console.error("Debug server error:", err);
    }
  });
  debugServer.listen(9876, () => {});

  createWindow();

  // Initialize system tray after window is created
  initTray();

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
  stopSlackHook();
  stopProcessSampling();
  stopMonitoring();
  stopBridge();
  stopPolling();
  stopSessionTailing();
  stopStoreSync();
  stopManager();
  closeDatabase();
});

// Keep TypeScript happy — stopWatching is used in before-quit via closure
void 0;
