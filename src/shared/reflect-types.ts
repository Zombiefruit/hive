/** Reflect page types — work habits analysis signals. */

export interface ResponseCadence {
  medianReplyMinutes: number;
  unansweredOver24h: number;
  unansweredTitles: string[];
  totalResponseTasks: number;
  respondedWithin1h: number;
}

export interface FocusScore {
  avgConcurrentWip: number;
  maxConcurrentWip: number;
  contextSwitchCount: number;
  score: number; // 0-100
}

export interface MeetingLoad {
  meetingHoursThisWeek: number;
  longestDeepWorkBlock: number; // minutes
  meetingFocusRatio: number;
  meetingCount: number;
}

export interface Throughput {
  completedThisWeek: number;
  rollingFourWeekAvg: number;
  weekOverWeekDelta: number; // % change
  cycleTimeByType: Record<string, number>; // avg hours per taskType
}

export interface WeeklySnapshot {
  weekLabel: string; // "Mar 24"
  weekStartISO: string;
  completed: number;
  avgCycleHours: number;
  meetingHours: number;
  focusScore: number;
  responseCadenceMinutes: number;
}

export interface ReflectSignals {
  responseCadence: ResponseCadence;
  focus: FocusScore;
  meetingLoad: MeetingLoad;
  throughput: Throughput;
  weekLabel: string;
}

export interface ManagerTake {
  summary: string;
  callouts: string[];
  rating: string; // "Strong week", "Needs attention", etc.
  generatedAt: string;
}

export interface ReflectData {
  signals: ReflectSignals;
  managerTake: ManagerTake | null;
  history: WeeklySnapshot[];
}
