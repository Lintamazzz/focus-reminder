import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppSettings, TaskSession } from "../types/task";

export const DEFAULT_SETTINGS: AppSettings = {
  defaultPlannedMinutes: 30,
  reminderOptions: [5, 15, 30],
  alwaysOnTop: true,
  theme: "system",
};

function createBrowserSession(
  title: string,
  plannedMinutes: number,
): TaskSession {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: title.trim() || "未命名任务",
    plannedMinutes,
    startedAt: now,
    nextReminderAt: now + plannedMinutes * 60_000,
    endedAt: null,
    status: "running",
    note: null,
    recordSkipped: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function startTaskSession(
  title: string,
  plannedMinutes: number,
): Promise<TaskSession> {
  if (!isTauri()) {
    return createBrowserSession(title, plannedMinutes);
  }

  return invoke<TaskSession>("start_task", { title, plannedMinutes });
}

export async function getRunningSession(): Promise<TaskSession | null> {
  if (!isTauri()) {
    return null;
  }

  return invoke<TaskSession | null>("get_running_session");
}

export async function completeTaskSession(
  sessionId: string,
  note: string,
  recordSkipped: boolean,
  endedAt: number,
): Promise<TaskSession> {
  if (!isTauri()) {
    throw new Error("浏览器预览不会保存任务记录");
  }

  return invoke<TaskSession>("complete_task", {
    sessionId,
    note,
    recordSkipped,
    endedAt,
  });
}

export async function discardTaskSession(sessionId: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("discard_task", { sessionId });
}

export async function getTodayLogs(
  startAt: number,
  endAt: number,
): Promise<TaskSession[]> {
  if (!isTauri()) {
    return [];
  }

  return invoke<TaskSession[]>("get_today_logs", { startAt, endAt });
}

export async function deleteCompletedTask(sessionId: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("delete_completed_task", { sessionId });
}

export async function getAppSettings(): Promise<AppSettings> {
  if (!isTauri()) {
    const stored = window.localStorage.getItem("focus-reminder-settings");
    return stored ? (JSON.parse(stored) as AppSettings) : DEFAULT_SETTINGS;
  }

  return invoke<AppSettings>("get_app_settings");
}

export async function saveAppSettings(
  settings: AppSettings,
): Promise<AppSettings> {
  if (!isTauri()) {
    window.localStorage.setItem(
      "focus-reminder-settings",
      JSON.stringify(settings),
    );
    return settings;
  }

  return invoke<AppSettings>("save_app_settings", { settings });
}

export async function exportMarkdown(
  date: string,
  content: string,
): Promise<string> {
  if (!isTauri()) {
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/markdown;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `done-log-${date}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    return anchor.download;
  }

  return invoke<string>("save_markdown_export", { date, content });
}
