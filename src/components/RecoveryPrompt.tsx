import type { TaskSession } from "../types/task";
import { formatDuration, getElapsedSeconds } from "../utils/time";

type RecoveryPromptProps = {
  session: TaskSession;
  pending: boolean;
  onContinue: () => void;
  onFinish: () => void;
  onDiscard: () => void;
};

export default function RecoveryPrompt({
  session,
  pending,
  onContinue,
  onFinish,
  onDiscard,
}: RecoveryPromptProps) {
  return (
    <main className="app-shell recovery-shell">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">
          F
        </span>
        <span>Focus Reminder</span>
      </header>

      <section className="recovery-content">
        <p className="eyebrow">发现未结束任务</p>
        <h1>上次的时间盒还没有收尾。</h1>

        <div className="recovery-card">
          <span>任务</span>
          <strong>{session.title}</strong>
          <dl>
            <div>
              <dt>预计时间</dt>
              <dd>{session.plannedMinutes} 分钟</dd>
            </div>
            <div>
              <dt>已经过</dt>
              <dd>{formatDuration(getElapsedSeconds(session.startedAt))}</dd>
            </div>
          </dl>
        </div>

        <p className="recovery-note">
          继续会沿用原来的计时；如果已经完成，可以直接补一条完成记录。
        </p>

        <div className="recovery-actions">
          <button
            className="primary-action"
            disabled={pending}
            onClick={onContinue}
            type="button"
          >
            继续计时
          </button>
          <button
            className="secondary-button"
            disabled={pending}
            onClick={onFinish}
            type="button"
          >
            结束并记录
          </button>
          <button
            className="danger-text-button"
            disabled={pending}
            onClick={onDiscard}
            type="button"
          >
            丢弃任务
          </button>
        </div>
      </section>
    </main>
  );
}
