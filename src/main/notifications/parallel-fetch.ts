/**
 * Parallel source fetching — runs each source in its own MCP bridge call
 * concurrently via Promise.allSettled. Total fetch time = slowest source
 * instead of sum of all sources.
 */

import { loadSkillTemplate } from "../../shared/skill-loader";

// ── Types ──

export type SourceName = "slack" | "linear" | "calendar" | "gmail" | "notion";

export interface SourceFetchConfig {
  userName: string;
  userSlackId?: string;
  linearUser?: string;
  teamName?: string;
  slackBaseUrl: string;
  channels: Array<{ id: string; name: string }>;
  managerSlackId?: string;
  managerName?: string;
  hours: number;
  cutoffStr: string;
}

export interface SourceFetchResult {
  mergedData: string;
  succeeded: SourceName[];
  errors: Array<{ source: SourceName; error: string }>;
}

export interface SourceProgress {
  source: SourceName;
  status: "done" | "error";
  chars?: number;
  error?: string;
}

// ── Per-source prompt builder ──

const FETCH_WRAPPER = (section: string, cutoff: string) =>
  `Fetch data from this source. Execute all API calls — do not skip any.\n\n${section}\n\nRULES:\n- Only include data from after ${cutoff}\n- Return ALL results as plain text, organized with ## headers\n- Be thorough and complete — include everything relevant\n- NEVER add commentary like "Let me compile..." — return ONLY the data itself`;

export function buildSourcePrompt(source: SourceName, config: SourceFetchConfig): string {
  const { hours, cutoffStr } = config;
  const slackAfter = hours <= 24 ? "yesterday" : hours <= 48 ? "2 days ago" : "7 days ago";

  switch (source) {
    case "slack": {
      const slackLimit = 100;
      const channelList = config.channels
        .map(ch => `- slack_read_channel: channel_id "${ch.id}" (${ch.name}), limit ${slackLimit}`)
        .join("\n");
      const slackSearches = [
        `- slack_search_public_and_private: query "<@${config.userSlackId}> after:${slackAfter}"`,
        `- slack_search_public_and_private: query "to:${config.userSlackId} after:${slackAfter}"`,
        ...(config.managerSlackId
          ? [`- slack_search_public_and_private: query "from:<@${config.managerSlackId}> after:${slackAfter}" (messages from ${config.managerName || "manager"})`]
          : []),
      ].join("\n");
      const slackSkill = loadSkillTemplate("fetch-slack", {
        SLACK_LIMIT: String(slackLimit),
        USER_NAME: config.userName,
        USER_SLACK_ID: config.userSlackId ?? "",
        CHANNEL_LIST: channelList,
        SLACK_BASE_URL: config.slackBaseUrl,
      });
      return FETCH_WRAPPER(`## SLACK\n${slackSearches}\n${channelList}\n${slackSkill}`, cutoffStr);
    }

    case "linear": {
      const linearLimit = hours > 48 ? 250 : 100;
      const linearSkill = loadSkillTemplate("fetch-linear", {
        LINEAR_USER: config.linearUser ?? "",
        LINEAR_LIMIT: String(linearLimit),
        TEAM_NAME: config.teamName ?? "Vector",
        LINEAR_TEAM_LIMIT: String(Math.round(linearLimit / 2)),
      });
      return FETCH_WRAPPER(`## LINEAR\n${linearSkill}`, cutoffStr);
    }

    case "calendar": {
      const calSkill = loadSkillTemplate("fetch-calendar", {
        CURRENT_TIME: new Date().toISOString(),
      });
      return FETCH_WRAPPER(`## CALENDAR\n${calSkill}`, cutoffStr);
    }

    case "gmail": {
      const gmailLimit = hours > 48 ? 50 : 30;
      const gmailSkill = loadSkillTemplate("fetch-gmail", {
        GMAIL_NEWER: hours <= 24 ? "1d" : hours <= 48 ? "2d" : "7d",
        GMAIL_LIMIT: String(gmailLimit),
      });
      return FETCH_WRAPPER(`## GMAIL\n${gmailSkill}`, cutoffStr);
    }

    case "notion": {
      const notionSkill = loadSkillTemplate("fetch-notion", {
        USER_NAME: config.userName,
      });
      return FETCH_WRAPPER(`## NOTION\n${notionSkill}`, cutoffStr);
    }
  }
}

// ── Parallel orchestrator ──

/**
 * Fetch all enabled sources in parallel. Each source gets its own bridge call.
 * Uses Promise.allSettled so one failure doesn't block others.
 *
 * @param sources - enabled source names
 * @param askFn - function that sends a prompt to a bridge and returns text (injected for testability)
 * @param onProgress - called as each source completes
 */
export async function fetchSourcesParallel(
  sources: SourceName[],
  askFn: (prompt: string) => Promise<string>,
  onProgress?: (progress: SourceProgress) => void,
): Promise<SourceFetchResult> {
  if (sources.length === 0) {
    return { mergedData: "", succeeded: [], errors: [] };
  }

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      // Note: prompt building is done by the caller and passed via askFn closure,
      // or we build it here if askFn is a raw bridge call.
      // For testability, askFn receives the prompt and returns data.
      const data = await askFn(source);
      onProgress?.({ source, status: "done", chars: data.length });
      return { source, data };
    }),
  );

  const succeeded: SourceName[] = [];
  const errors: Array<{ source: SourceName; error: string }> = [];
  const dataParts: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const source = sources[i];
    if (result.status === "fulfilled") {
      succeeded.push(source);
      if (result.value.data) dataParts.push(result.value.data);
    } else {
      const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push({ source, error: errMsg });
      onProgress?.({ source, status: "error", error: errMsg });
    }
  }

  return {
    mergedData: dataParts.join("\n\n"),
    succeeded,
    errors,
  };
}
