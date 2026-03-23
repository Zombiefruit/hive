/**
 * Native macOS Notifications — surfaces agent events when the app window is not focused.
 * Uses Electron's built-in Notification class (no external dependencies).
 */

import { Notification, BrowserWindow } from "electron";

/** Focus the first available app window. */
function focusAppWindow(): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.show();
    win.focus();
  }
}

/** Returns true when no app window is currently focused (user is in another app). */
function isAppUnfocused(): boolean {
  return BrowserWindow.getFocusedWindow() === null;
}

/**
 * Show a native notification. Only fires when the app is not focused.
 * Clicking the notification brings the app window to front.
 */
function showNotification(title: string, body: string): void {
  if (!isAppUnfocused()) return;
  if (!Notification.isSupported()) return;

  const notification = new Notification({ title, body });
  notification.on("click", () => {
    focusAppWindow();
  });
  notification.show();
}

/**
 * Notify that an agent has completed its work.
 */
export function notifyAgentCompleted(title: string): void {
  showNotification("Agent Completed", `Agent completed: ${title}`);
}

/**
 * Notify that an agent encountered an error.
 */
export function notifyAgentError(agentId: string, title: string, error: string): void {
  showNotification(`Agent Error: ${title}`, error.slice(0, 200));
}

/**
 * Notify that an approval is needed for a tool call.
 */
export function notifyApprovalNeeded(description: string): void {
  showNotification("Approval Needed", description);
}
