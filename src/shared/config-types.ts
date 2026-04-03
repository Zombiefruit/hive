/** Configuration types for Claude Deck onboarding and user preferences. */

export interface SlackChannel {
  id: string;
  name: string;
}

export type CoworkerRole = "manager" | "lead" | "pm" | "peer";

export interface Coworker {
  name: string;
  role: CoworkerRole;
  slackUserId?: string;
}

export type UserRole =
  | "frontend_dev"
  | "backend_dev"
  | "fullstack_dev"
  | "pm"
  | "designer"
  | "other";

export type FetchCadence = "manual" | "15min" | "30min" | "1hr";

export interface IntegrationToggles {
  slack: boolean;
  linear: boolean;
  gmail: boolean;
  calendar: boolean;
  notion: boolean;
  github: boolean;
  gong: boolean;
}

export interface DeckConfig {
  /** Step 1 — Identity */
  name: string;
  email: string;
  slackUserId?: string;
  slackWorkspace?: string; // e.g. "montecarloai" → montecarloai.slack.com
  linearUsername?: string;

  /** Step 2 — Role */
  role: UserRole;

  /** Step 3 — Team */
  managerName: string;
  teamName: string;
  coworkers?: Coworker[];

  /** Step 4 — Slack Channels */
  slackChannels: SlackChannel[];

  /** Step 5 — Integrations */
  integrations: IntegrationToggles;

  /** Step 6 — Preferences */
  fetchCadence: FetchCadence;
  timezone: string;
  workingHoursStart: string; // "HH:MM"
  workingHoursEnd: string; // "HH:MM"
  slackHookEnabled?: boolean; // Real-time Slack mention/DM monitoring
  repoMappings?: Array<{
    pattern: string;
    repoPath: string;
  }>;

  /** Metadata */
  createdAt: string;
  updatedAt: string;
}
