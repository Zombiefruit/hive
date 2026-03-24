/**
 * User configuration persistence for Claude Deck.
 * Reads/writes config.json in the Electron userData directory.
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { DeckConfig } from "../shared/config-types";

function getConfigPath(): string {
  return path.join(app.getPath("userData"), "config.json");
}

/** Check whether a config file exists on disk. */
export function hasConfig(): boolean {
  return fs.existsSync(getConfigPath());
}

/** Load the config from disk. Returns null if no config exists or it's invalid. */
export function loadConfig(): DeckConfig | null {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    return JSON.parse(raw) as DeckConfig;
  } catch {
    return null;
  }
}

/** Save a config object to disk. */
export function saveConfig(config: DeckConfig): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/** Convenience alias — loads or returns null. */
export function getConfig(): DeckConfig | null {
  return loadConfig();
}
