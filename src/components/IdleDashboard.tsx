import { useState } from "react";
import type { AppSettings, TaskSession } from "../types/task";
import SettingsPanel from "./SettingsPanel";
import TaskStartForm from "./TaskStartForm";
import TodayLog from "./TodayLog";

type IdleDashboardProps = {
  settings: AppSettings;
  sessions: TaskSession[];
  date: string;
  logsLoading: boolean;
  taskPending: boolean;
  settingsPending: boolean;
  deletingSessionId: string | null;
  exporting: boolean;
  exportResult: string | null;
  onStart: (title: string, plannedMinutes: number) => void;
  onSaveSettings: (settings: AppSettings) => void;
  onExport: () => void;
  onDeleteLog: (sessionId: string) => Promise<boolean>;
};

export default function IdleDashboard({
  settings,
  sessions,
  date,
  logsLoading,
  taskPending,
  settingsPending,
  deletingSessionId,
  exporting,
  exportResult,
  onStart,
  onSaveSettings,
  onExport,
  onDeleteLog,
}: IdleDashboardProps) {
  const [view, setView] = useState<"today" | "settings">("today");

  return (
    <main className="app-shell dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>Focus Reminder</span>
        </div>
        <nav aria-label="主导航">
          <button
            aria-current={view === "today" ? "page" : undefined}
            onClick={() => setView("today")}
            type="button"
          >
            今天
          </button>
          <button
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => setView("settings")}
            type="button"
          >
            设置
          </button>
        </nav>
      </header>

      {view === "today" ? (
        <div className="dashboard-content">
          <TaskStartForm
            defaultPlannedMinutes={settings.defaultPlannedMinutes}
            onStart={onStart}
            pending={taskPending}
          />
          <TodayLog
            date={date}
            deletingSessionId={deletingSessionId}
            exporting={exporting}
            exportResult={exportResult}
            loading={logsLoading}
            onDelete={onDeleteLog}
            onExport={onExport}
            sessions={sessions}
          />
        </div>
      ) : (
        <SettingsPanel
          onSave={onSaveSettings}
          pending={settingsPending}
          settings={settings}
        />
      )}

      <footer className="dashboard-footer">
        <span className="status-dot" />
        数据保存在本机
      </footer>
    </main>
  );
}
