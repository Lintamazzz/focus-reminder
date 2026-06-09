export type TaskSession = {
  id: string;
  title: string;
  plannedMinutes: number;
  startedAt: number;
  nextReminderAt: number;
  endedAt: number | null;
  status: "running" | "completed" | "cancelled";
  note: string | null;
  recordSkipped: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ReminderAction = `extend_${number}` | "finish";

export type ReminderPayload = {
  sessionId: string;
  taskTitle: string;
  plannedMinutes: number;
  elapsedSeconds: number;
  reminderOptions: number[];
  theme: ThemePreference;
};

export type ReminderActionPayload = {
  action: ReminderAction;
  nextReminderAt: number | null;
};

export type CompletionDraft = {
  session: TaskSession;
  endedAt: number;
  elapsedSeconds: number;
};

export type ThemePreference = "system" | "light" | "dark";

export type AppSettings = {
  defaultPlannedMinutes: number;
  reminderOptions: number[];
  alwaysOnTop: boolean;
  theme: ThemePreference;
};

export type DailySummary = {
  completedCount: number;
  totalFocusSeconds: number;
  overtimeCount: number;
  averageOvertimeSeconds: number;
};
