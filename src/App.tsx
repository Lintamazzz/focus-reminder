import { useCallback, useEffect, useState } from "react";
import CompletionForm from "./components/CompletionForm";
import IdleDashboard from "./components/IdleDashboard";
import RecoveryPrompt from "./components/RecoveryPrompt";
import RunningTask from "./components/RunningTask";
import { useTaskTimer } from "./hooks/useTaskTimer";
import {
  DEFAULT_SETTINGS,
  deleteCompletedTask,
  exportMarkdown,
  getAppSettings,
  getTodayLogs,
  saveAppSettings,
} from "./services/taskService";
import type { AppSettings, TaskSession } from "./types/task";
import { buildDailyMarkdown, getLocalDayBounds } from "./utils/time";

export default function App() {
  const {
    session,
    recoverySession,
    completionDraft,
    elapsedSeconds,
    initializing,
    pending,
    error,
    completionVersion,
    startTask,
    requestFinish,
    saveCompletion,
    continueRecovery,
    finishRecovery,
    discardRecovery,
  } = useTaskTimer();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [todaySessions, setTodaySessions] = useState<TaskSession[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [settingsPending, setSettingsPending] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dayBounds, setDayBounds] = useState(getLocalDayBounds);
  const { date, startAt, endAt } = dayBounds;

  const refreshTodayLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      setTodaySessions(await getTodayLogs(startAt, endAt));
    } catch (cause) {
      setLocalError(String(cause));
    } finally {
      setLogsLoading(false);
    }
  }, [endAt, startAt]);

  useEffect(() => {
    getAppSettings()
      .then(setSettings)
      .catch((cause) => setLocalError(String(cause)));
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const nextBounds = getLocalDayBounds();
      setDayBounds((current) =>
        current.date === nextBounds.date ? current : nextBounds,
      );
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    refreshTodayLogs();
  }, [completionVersion, refreshTodayLogs]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const handleSaveSettings = useCallback(async (nextSettings: AppSettings) => {
    setSettingsPending(true);
    setLocalError(null);
    try {
      setSettings(await saveAppSettings(nextSettings));
    } catch (cause) {
      setLocalError(String(cause));
    } finally {
      setSettingsPending(false);
    }
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportResult(null);
    setLocalError(null);
    try {
      const content = buildDailyMarkdown(date, todaySessions);
      setExportResult(await exportMarkdown(date, content));
    } catch (cause) {
      setLocalError(String(cause));
    } finally {
      setExporting(false);
    }
  }, [date, todaySessions]);

  const handleDeleteLog = useCallback(async (sessionId: string) => {
    setDeletingSessionId(sessionId);
    setLocalError(null);
    try {
      await deleteCompletedTask(sessionId);
      setTodaySessions((sessions) =>
        sessions.filter((session) => session.id !== sessionId),
      );
      setExportResult(null);
      return true;
    } catch (cause) {
      setLocalError(String(cause));
      return false;
    } finally {
      setDeletingSessionId(null);
    }
  }, []);

  let content;

  if (initializing) {
    content = (
      <main className="app-shell loading-shell">
        <div className="loading-mark">F</div>
        <p>正在读取本地任务…</p>
      </main>
    );
  } else if (recoverySession) {
    content = (
      <RecoveryPrompt
        onContinue={continueRecovery}
        onDiscard={discardRecovery}
        onFinish={finishRecovery}
        pending={pending}
        session={recoverySession}
      />
    );
  } else if (completionDraft) {
    content = (
      <CompletionForm
        draft={completionDraft}
        onSave={saveCompletion}
        pending={pending}
      />
    );
  } else if (session) {
    content = (
      <RunningTask
        elapsedSeconds={elapsedSeconds}
        onFinish={requestFinish}
        session={session}
      />
    );
  } else {
    content = (
      <IdleDashboard
        date={date}
        deletingSessionId={deletingSessionId}
        exporting={exporting}
        exportResult={exportResult}
        logsLoading={logsLoading}
        onDeleteLog={handleDeleteLog}
        onExport={handleExport}
        onSaveSettings={handleSaveSettings}
        onStart={startTask}
        sessions={todaySessions}
        settings={settings}
        settingsPending={settingsPending}
        taskPending={pending}
      />
    );
  }

  return (
    <>
      {(error || localError) && (
        <div className="error-banner">{error || localError}</div>
      )}
      {content}
    </>
  );
}
