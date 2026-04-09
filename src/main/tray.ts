/**
 * System Tray — shows Relay in the macOS menu bar with active agent count.
 */

import { Tray, Menu, nativeImage, BrowserWindow, app } from "electron";

let tray: Tray | null = null;

// 16x16 white circle icon as a data URL (works well on macOS dark menu bar)
const TRAY_ICON_DATA_URL =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA" +
  "gElEQVQ4T2NkoBAwUqifYdAb8P////8MDAwMjMguxcTE9J+R" +
  "kZGBgYGB4T8DA8N/BgYGRkZGRgYmJiYGJiYmBkZGRgYGBgYG" +
  "RkZGBiYmJoaBbwATKhcNegOYULlo0BvAhMpFg94AJlQuGvQG" +
  "MKFy0aA3gAmViwa9AUyoXDToDQAAVr0QEQPGOAAAAABJRU5E" +
  "rkJggg==";

function createTrayIcon(): Electron.NativeImage {
  const img = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
  // Mark as template image so macOS adapts it to menu bar appearance
  img.setTemplateImage(true);
  return img.resize({ width: 16, height: 16 });
}

function buildMenu(activeCount: number): Electron.Menu {
  return Menu.buildFromTemplate([
    {
      label: "Show Relay",
      click: () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.show();
          win.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: `Active Agents: ${activeCount}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);
}

/**
 * Initialize the system tray. Call once after createWindow().
 */
export function initTray(): void {
  if (tray) return;
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("Relay");
  tray.setContextMenu(buildMenu(0));

  // Click on the tray icon shows the window
  tray.on("click", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.show();
      win.focus();
    }
  });
}

/**
 * Update the tray badge with the current active agent count.
 */
export function updateTrayBadge(count: number): void {
  if (!tray) return;
  tray.setTitle(count > 0 ? ` ${count}` : "");
  tray.setContextMenu(buildMenu(count));
}
