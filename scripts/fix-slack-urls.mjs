#!/usr/bin/env node
/**
 * One-time script to fix broken Slack URLs in the notification cache.
 * Run: node scripts/fix-slack-urls.mjs
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CACHE_PATH = path.join(os.homedir(), "Library", "Application Support", "claude-deck", "notifications-cache.json");

if (!fs.existsSync(CACHE_PATH)) {
  console.log("No cache file found");
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
let fixed = 0;

function fixSlackUrl(url) {
  if (!url || typeof url !== "string") return url;

  // Fix "https://app.slack.com/client/T/CHANNEL" → proper archive URL
  const clientMatch = url.match(/^https?:\/\/app\.slack\.com\/client\/[A-Z0-9]+\/([A-Z0-9]+)/i);
  if (clientMatch && clientMatch[1].startsWith("C") && !clientMatch[1].includes("_")) {
    fixed++;
    return `https://montecarlodata.slack.com/archives/${clientMatch[1]}`;
  }

  // Fix "slack://channel/CHANNEL" → proper archive URL
  const protocolMatch = url.match(/^slack:\/\/channel\/([A-Z0-9]+)/i);
  if (protocolMatch) {
    fixed++;
    return `https://montecarlodata.slack.com/archives/${protocolMatch[1]}`;
  }

  // Fix "https://slack//channel/CHANNEL" → proper archive URL
  const brokenMatch = url.match(/^https?:\/\/slack\/\/channel\/([A-Z0-9]+)/i);
  if (brokenMatch) {
    fixed++;
    return `https://montecarlodata.slack.com/archives/${brokenMatch[1]}`;
  }

  // Remove URLs with fake channel IDs (contain underscores like C_ui_ux_prs)
  if (url.includes("slack") && url.match(/\/C_[a-z_]+/)) {
    fixed++;
    return undefined; // Remove fake URLs
  }

  return url;
}

for (const n of data) {
  if (n.url) {
    const newUrl = fixSlackUrl(n.url);
    if (newUrl !== n.url) n.url = newUrl;
  }
  if (n.links) {
    n.links = n.links.map(l => {
      const newUrl = fixSlackUrl(l.url);
      if (newUrl === undefined) return null; // Remove fake
      return { ...l, url: newUrl ?? l.url };
    }).filter(Boolean);
  }
}

// Backup original
fs.writeFileSync(CACHE_PATH + ".bak", fs.readFileSync(CACHE_PATH));
// Write fixed
fs.writeFileSync(CACHE_PATH, JSON.stringify(data));

console.log(`Fixed ${fixed} Slack URLs in ${data.length} notifications`);
console.log(`Backup saved to ${CACHE_PATH}.bak`);
