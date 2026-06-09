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
  const match = /^extend_(5|15|30)$/.exec(action);
  return match ? Number(match[1]) : null;
}
