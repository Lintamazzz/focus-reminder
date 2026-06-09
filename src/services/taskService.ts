import { invoke, isTauri } from "@tauri-apps/api/core";
import type { TaskSession } from "../types/task";

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
