import { describe, expect, it } from "vitest";
import {
  buildDailyMarkdown,
  formatCompactDuration,
  formatDuration,
  getElapsedSeconds,
  getExtensionMinutes,
  summarizeSessions,
} from "./time";
import type { TaskSession } from "../types/task";

function completedSession(overrides: Partial<TaskSession> = {}): TaskSession {
  return {
    id: "session-1",
    title: "整理方案",
    plannedMinutes: 30,
    startedAt: new Date(2026, 5, 9, 9, 0).getTime(),
    nextReminderAt: new Date(2026, 5, 9, 9, 30).getTime(),
    endedAt: new Date(2026, 5, 9, 9, 42).getTime(),
    status: "completed",
    note: "完成方案初稿",
    recordSkipped: false,
    createdAt: new Date(2026, 5, 9, 9, 0).getTime(),
    updatedAt: new Date(2026, 5, 9, 9, 42).getTime(),
    ...overrides,
  };
}

describe("time utilities", () => {
  it("calculates elapsed time from timestamps", () => {
    expect(getElapsedSeconds(1_000, 66_999)).toBe(65);
  });

  it("never returns negative elapsed time", () => {
    expect(getElapsedSeconds(2_000, 1_000)).toBe(0);
  });

  it("formats minute and hour durations", () => {
    expect(formatDuration(65)).toBe("1 分 05 秒");
    expect(formatDuration(3_725)).toBe("1 小时 2 分 5 秒");
    expect(formatCompactDuration(3_599)).toBe("1 小时");
  });

  it("recognizes supported reminder extensions", () => {
    expect(getExtensionMinutes("extend_20")).toBe(20);
    expect(getExtensionMinutes("finish")).toBeNull();
  });

  it("summarizes completed focus sessions", () => {
    const summary = summarizeSessions([
      completedSession(),
      completedSession({
        id: "session-2",
        plannedMinutes: 20,
        endedAt: new Date(2026, 5, 9, 9, 18).getTime(),
      }),
    ]);

    expect(summary.completedCount).toBe(2);
    expect(summary.totalFocusSeconds).toBe(60 * 60);
    expect(summary.overtimeCount).toBe(1);
    expect(summary.averageOvertimeSeconds).toBe(12 * 60);
  });

  it("builds the daily Markdown export", () => {
    const markdown = buildDailyMarkdown("2026-06-09", [completedSession()]);

    expect(markdown).toContain("# Done Log - 2026-06-09");
    expect(markdown).toContain("完成方案初稿");
    expect(markdown).toContain("- 完成任务数：1");
    expect(markdown).toContain("- 超时任务数：1");
  });
});
