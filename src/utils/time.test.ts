import { describe, expect, it } from "vitest";
import {
  formatDuration,
  getElapsedSeconds,
  getExtensionMinutes,
} from "./time";

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
  });

  it("recognizes supported reminder extensions", () => {
    expect(getExtensionMinutes("extend_15")).toBe(15);
    expect(getExtensionMinutes("finish")).toBeNull();
  });
});
