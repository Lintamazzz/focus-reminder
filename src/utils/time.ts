import type { DailySummary, TaskSession } from "../types/task";

export function getElapsedSeconds(startedAt: number, now = Date.now()): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分 ${seconds} 秒`;
  }

  return `${minutes} 分 ${seconds.toString().padStart(2, "0")} 秒`;
}

export function getExtensionMinutes(action: string): number | null {
  const match = /^extend_(\d+)$/.exec(action);
  return match ? Number(match[1]) : null;
}

export function getLocalDayBounds(now = new Date()): {
  date: string;
  startAt: number;
  endAt: number;
} {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const date = [
    start.getFullYear(),
    String(start.getMonth() + 1).padStart(2, "0"),
    String(start.getDate()).padStart(2, "0"),
  ].join("-");
  return { date, startAt: start.getTime(), endAt: end.getTime() };
}

export function getSessionDurationSeconds(session: TaskSession): number {
  return session.endedAt
    ? getElapsedSeconds(session.startedAt, session.endedAt)
    : 0;
}

export function summarizeSessions(sessions: TaskSession[]): DailySummary {
  const overtimeSeconds = sessions
    .map((session) =>
      Math.max(
        0,
        getSessionDurationSeconds(session) - session.plannedMinutes * 60,
      ),
    )
    .filter((seconds) => seconds > 0);

  return {
    completedCount: sessions.length,
    totalFocusSeconds: sessions.reduce(
      (total, session) => total + getSessionDurationSeconds(session),
      0,
    ),
    overtimeCount: overtimeSeconds.length,
    averageOvertimeSeconds:
      overtimeSeconds.length > 0
        ? Math.round(
            overtimeSeconds.reduce((total, seconds) => total + seconds, 0) /
              overtimeSeconds.length,
          )
        : 0,
  };
}

export function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

export function formatCompactDuration(totalSeconds: number): string {
  const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
  }
  return `${minutes} 分钟`;
}

export function buildDailyMarkdown(
  date: string,
  sessions: TaskSession[],
): string {
  const summary = summarizeSessions(sessions);
  const lines = [`# Done Log - ${date}`, "", "## 今日完成", ""];

  if (sessions.length === 0) {
    lines.push("- 今日暂无完成记录");
  } else {
    for (const session of [...sessions].reverse()) {
      const duration = getSessionDurationSeconds(session);
      const note = session.note?.trim() || session.title;
      lines.push(
        `- ${formatClock(session.startedAt)}-${formatClock(session.endedAt!)} ${note}（${formatCompactDuration(duration)}，预计 ${session.plannedMinutes} 分钟）`,
      );
    }
  }

  lines.push(
    "",
    "## 汇总",
    "",
    `- 完成任务数：${summary.completedCount}`,
    `- 总专注时间：${formatCompactDuration(summary.totalFocusSeconds)}`,
    `- 超时任务数：${summary.overtimeCount}`,
  );
  return `${lines.join("\n")}\n`;
}
