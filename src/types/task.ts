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

export type ReminderAction = "extend_5" | "extend_15" | "extend_30" | "finish";

export type ReminderPayload = {
  sessionId: string;
  taskTitle: string;
  plannedMinutes: number;
  elapsedSeconds: number;
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
