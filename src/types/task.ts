export type TaskSession = {
  title: string;
  plannedMinutes: number;
  startedAt: number;
  nextReminderAt: number;
};

export type ReminderAction = "extend_5" | "extend_15" | "extend_30" | "finish";

export type ReminderPayload = {
  taskTitle: string;
  plannedMinutes: number;
  elapsedSeconds: number;
};

export type ReminderActionPayload = {
  action: ReminderAction;
};
