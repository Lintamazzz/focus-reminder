import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeTaskSession,
  discardTaskSession,
  getRunningSession,
  startTaskSession,
} from "../services/taskService";
import type {
  CompletionDraft,
  ReminderActionPayload,
  TaskSession,
} from "../types/task";
import { getElapsedSeconds } from "../utils/time";

export function useTaskTimer() {
  const [session, setSession] = useState<TaskSession | null>(null);
  const [recoverySession, setRecoverySession] = useState<TaskSession | null>(
    null,
  );
  const [completionDraft, setCompletionDraft] =
    useState<CompletionDraft | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [initializing, setInitializing] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reminderOpenRef = useRef(false);
  const sessionRef = useRef<TaskSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const beginCompletion = useCallback((task: TaskSession) => {
    const endedAt = Date.now();
    reminderOpenRef.current = false;
    setSession(null);
    setElapsedSeconds(0);
    setCompletionDraft({
      session: task,
      endedAt,
      elapsedSeconds: getElapsedSeconds(task.startedAt, endedAt),
    });
  }, []);

  useEffect(() => {
    let active = true;

    getRunningSession()
      .then((runningSession) => {
        if (active && runningSession) {
          setRecoverySession(runningSession);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(String(cause));
        }
      })
      .finally(() => {
        if (active) {
          setInitializing(false);
        }
      });

    return () => {
      active = false;
    };
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
        const current = sessionRef.current;
        if (current) {
          beginCompletion(current);
        }
        return;
      }

      if (payload.nextReminderAt !== null) {
        setSession((current) =>
          current
            ? {
                ...current,
                nextReminderAt: payload.nextReminderAt!,
                updatedAt: Date.now(),
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
  }, [beginCompletion]);

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
            sessionId: session.id,
            taskTitle: session.title,
            plannedMinutes: session.plannedMinutes,
            elapsedSeconds: nextElapsedSeconds,
          }).catch((cause) => {
            reminderOpenRef.current = false;
            setError(String(cause));
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

  const startTask = useCallback(
    async (title: string, plannedMinutes: number) => {
      setPending(true);
      setError(null);
      try {
        const startedSession = await startTaskSession(title, plannedMinutes);
        setSession(startedSession);
        setElapsedSeconds(0);
        reminderOpenRef.current = false;
      } catch (cause) {
        setError(String(cause));
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const requestFinish = useCallback(() => {
    if (!session) {
      return;
    }

    if (isTauri()) {
      invoke("hide_reminder").catch((cause) => setError(String(cause)));
    }
    beginCompletion(session);
  }, [beginCompletion, session]);

  const saveCompletion = useCallback(
    async (note: string, recordSkipped: boolean) => {
      if (!completionDraft) {
        return;
      }

      setPending(true);
      setError(null);
      try {
        if (isTauri()) {
          await completeTaskSession(
            completionDraft.session.id,
            note,
            recordSkipped,
            completionDraft.endedAt,
          );
        }
        setCompletionDraft(null);
      } catch (cause) {
        setError(String(cause));
      } finally {
        setPending(false);
      }
    },
    [completionDraft],
  );

  const continueRecovery = useCallback(() => {
    if (!recoverySession) {
      return;
    }
    setSession(recoverySession);
    setElapsedSeconds(getElapsedSeconds(recoverySession.startedAt));
    setRecoverySession(null);
    setError(null);
  }, [recoverySession]);

  const finishRecovery = useCallback(() => {
    if (!recoverySession) {
      return;
    }
    beginCompletion(recoverySession);
    setRecoverySession(null);
    setError(null);
  }, [beginCompletion, recoverySession]);

  const discardRecovery = useCallback(async () => {
    if (!recoverySession) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      await discardTaskSession(recoverySession.id);
      setRecoverySession(null);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(false);
    }
  }, [recoverySession]);

  return {
    session,
    recoverySession,
    completionDraft,
    elapsedSeconds,
    initializing,
    pending,
    error,
    startTask,
    requestFinish,
    saveCompletion,
    continueRecovery,
    finishRecovery,
    discardRecovery,
  };
}
