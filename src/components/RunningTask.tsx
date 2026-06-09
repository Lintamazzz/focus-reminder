import type { TaskSession } from "../types/task";
import { formatDuration } from "../utils/time";

type RunningTaskProps = {
  session: TaskSession;
  elapsedSeconds: number;
  onFinish: () => void;
};

export default function RunningTask({
  session,
  elapsedSeconds,
  onFinish,
}: RunningTaskProps) {
  const plannedSeconds = session.plannedMinutes * 60;
  const progress = Math.min(100, (elapsedSeconds / plannedSeconds) * 100);

  return (
    <main className="app-shell running-shell">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">
          F
        </span>
        <span>Focus Reminder</span>
        <span className="live-badge">进行中</span>
      </header>

      <section className="running-content">
        <p className="eyebrow">当前任务</p>
        <h1>{session.title}</h1>

        <div className="timer-card">
          <div className="timer-meta">
            <span>已用时间</span>
            <span>预计 {session.plannedMinutes} 分钟</span>
          </div>
          <strong>{formatDuration(elapsedSeconds)}</strong>
          <div
            aria-label={`计时进度 ${Math.round(progress)}%`}
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <p className="running-note">
          你可以继续专注。到点时，提醒窗口会出现在其他窗口上方。
        </p>

        <button className="secondary-button" onClick={onFinish} type="button">
          结束任务
        </button>
      </section>
    </main>
  );
}
