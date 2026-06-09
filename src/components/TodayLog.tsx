import { useState } from "react";
import type { TaskSession } from "../types/task";
import {
  formatClock,
  formatCompactDuration,
  getSessionDurationSeconds,
  summarizeSessions,
} from "../utils/time";

type TodayLogProps = {
  date: string;
  sessions: TaskSession[];
  loading: boolean;
  exporting: boolean;
  deletingSessionId: string | null;
  exportResult: string | null;
  onExport: () => void;
  onDelete: (sessionId: string) => Promise<boolean>;
};

export default function TodayLog({
  date,
  sessions,
  loading,
  exporting,
  deletingSessionId,
  exportResult,
  onExport,
  onDelete,
}: TodayLogProps) {
  const summary = summarizeSessions(sessions);
  const [confirmingSessionId, setConfirmingSessionId] = useState<string | null>(
    null,
  );

  const confirmDelete = async (sessionId: string) => {
    if (await onDelete(sessionId)) {
      setConfirmingSessionId(null);
    }
  };

  return (
    <section className="today-log">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Done Log</p>
          <h2>今日记录</h2>
        </div>
        <time dateTime={date}>{date}</time>
      </div>

      {loading ? (
        <p className="empty-log">正在读取本地记录…</p>
      ) : sessions.length === 0 ? (
        <p className="empty-log">今天还没有完成记录。第一条会从这里开始。</p>
      ) : (
        <div className="log-list">
          {sessions.map((session) => {
            const actualSeconds = getSessionDurationSeconds(session);
            const differenceSeconds =
              actualSeconds - session.plannedMinutes * 60;
            return (
              <article className="log-card" key={session.id}>
                <div className="log-card-header">
                  <div className="log-time">
                    {formatClock(session.startedAt)} -{" "}
                    {formatClock(session.endedAt!)}
                  </div>
                  <button
                    aria-label={`删除记录：${session.note?.trim() || session.title}`}
                    className="log-delete-button"
                    disabled={deletingSessionId !== null}
                    onClick={() => setConfirmingSessionId(session.id)}
                    type="button"
                  >
                    删除
                  </button>
                </div>
                <h3>{session.note?.trim() || session.title}</h3>
                <p className="log-task">{session.title}</p>
                <div className="log-meta">
                  <span>预计 {session.plannedMinutes} 分钟</span>
                  <span>实际 {formatCompactDuration(actualSeconds)}</span>
                  <span className={differenceSeconds > 0 ? "overtime" : ""}>
                    {differenceSeconds > 0
                      ? `超时 ${formatCompactDuration(differenceSeconds)}`
                      : differenceSeconds < 0
                        ? `提前 ${formatCompactDuration(-differenceSeconds)}`
                        : "准时完成"}
                  </span>
                </div>
                {confirmingSessionId === session.id && (
                  <div className="delete-confirmation" role="alert">
                    <p>确定删除这条完成记录吗？此操作无法撤销。</p>
                    <div>
                      <button
                        className="cancel-delete-button"
                        disabled={deletingSessionId === session.id}
                        onClick={() => setConfirmingSessionId(null)}
                        type="button"
                      >
                        取消
                      </button>
                      <button
                        className="confirm-delete-button"
                        disabled={deletingSessionId === session.id}
                        onClick={() => confirmDelete(session.id)}
                        type="button"
                      >
                        {deletingSessionId === session.id
                          ? "正在删除…"
                          : "确认删除"}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="summary-grid">
        <div>
          <span>完成任务</span>
          <strong>{summary.completedCount}</strong>
        </div>
        <div>
          <span>专注时间</span>
          <strong>{formatCompactDuration(summary.totalFocusSeconds)}</strong>
        </div>
        <div>
          <span>超时任务</span>
          <strong>{summary.overtimeCount}</strong>
        </div>
        <div>
          <span>平均超时</span>
          <strong>
            {formatCompactDuration(summary.averageOvertimeSeconds)}
          </strong>
        </div>
      </div>

      <div className="export-row">
        <button
          className="secondary-button"
          disabled={exporting}
          onClick={onExport}
          type="button"
        >
          {exporting ? "正在导出…" : "导出今日 Markdown"}
        </button>
        {exportResult && <p title={exportResult}>已保存：{exportResult}</p>}
      </div>
    </section>
  );
}
