import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ReminderActionPayload,
  TaskSession,
} from "../types/task";
import {
  getElapsedSeconds,
  getExtensionMinutes,
} from "../utils/time";

export function useTaskTimer() {
  const [session, setSession] = useState<TaskSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const reminderOpenRef = useRef(false);

  const finishTask = useCallback(() => {
    reminderOpenRef.current = false;
    setSession(null);
    setElapsedSeconds(0);
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let mounted = true;
    let unlisten: (() => void) | undefined;

    listen<ReminderActionPayload>("reminder-action", ({ payload }) => {
      if (!mounted) {
        return;
      }

      if (payload.action === "finish") {
        finishTask();
        return;
      }

      const extensionMinutes = getExtensionMinutes(payload.action);
      if (extensionMinutes !== null) {
        setSession((current) =>
          current
            ? {
                ...current,
                nextReminderAt: Date.now() + extensionMinutes * 60_000,
              }
            : current,
        );
        reminderOpenRef.current = false;
      }
    }).then((stopListening) => {
      if (mounted) {
        unlisten = stopListening;
      } else {
        stopListening();
      }
    });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [finishTask]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const nextElapsedSeconds = getElapsedSeconds(session.startedAt, now);
      setElapsedSeconds(nextElapsedSeconds);

      if (now >= session.nextReminderAt && !reminderOpenRef.current) {
        reminderOpenRef.current = true;
        if (isTauri()) {
          invoke("show_reminder", {
            taskTitle: session.title,
            plannedMinutes: session.plannedMinutes,
            elapsedSeconds: nextElapsedSeconds,
          }).catch((error) => {
            reminderOpenRef.current = false;
            console.error("无法显示提醒窗口", error);
          });
        } else {
          reminderOpenRef.current = false;
        }
      }
    };

    updateTimer();
    const intervalId = window.setInterval(updateTimer, 1_000);
    window.addEventListener("focus", updateTimer);
    document.addEventListener("visibilitychange", updateTimer);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", updateTimer);
      document.removeEventListener("visibilitychange", updateTimer);
    };
  }, [session]);

  const startTask = useCallback((title: string, plannedMinutes: number) => {
    const now = Date.now();
    setSession({
      title: title.trim() || "未命名任务",
      plannedMinutes,
      startedAt: now,
      nextReminderAt: now + plannedMinutes * 60_000,
    });
    setElapsedSeconds(0);
    reminderOpenRef.current = false;
  }, []);

  return {
    session,
    elapsedSeconds,
    startTask,
    finishTask,
  };
}
