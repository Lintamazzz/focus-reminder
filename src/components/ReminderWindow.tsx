import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type {
  ReminderAction,
  ReminderPayload,
} from "../types/task";
import { formatDuration } from "../utils/time";

const EXTENSION_OPTIONS: Array<{ action: ReminderAction; label: string }> = [
  { action: "extend_5", label: "继续 5 分钟" },
  { action: "extend_15", label: "继续 15 分钟" },
  { action: "extend_30", label: "继续 30 分钟" },
];

export default function ReminderWindow() {
  const [payload, setPayload] = useState<ReminderPayload | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    listen<ReminderPayload>("reminder-data", ({ payload: nextPayload }) => {
      if (mounted) {
        setPayload(nextPayload);
        setPending(false);
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
  }, []);

  const submitAction = async (action: ReminderAction) => {
    setPending(true);
    try {
      await invoke("submit_reminder_action", { action });
    } catch (error) {
      setPending(false);
      console.error("无法处理提醒操作", error);
    }
  };

  return (
    <main className="reminder-shell">
      <div className="warning-icon" aria-hidden="true">
        !
      </div>
      <p className="eyebrow">时间到了</p>
      <h1>请停一下，决定下一步。</h1>
      <p className="reminder-task">{payload?.taskTitle ?? "当前任务"}</p>

      <dl className="reminder-stats">
        <div>
          <dt>计划用时</dt>
          <dd>{payload?.plannedMinutes ?? 0} 分钟</dd>
        </div>
        <div>
          <dt>现在已用</dt>
          <dd>{formatDuration(payload?.elapsedSeconds ?? 0)}</dd>
        </div>
      </dl>

      <div className="extension-grid">
        {EXTENSION_OPTIONS.map((option) => (
          <button
            disabled={pending}
            key={option.action}
            onClick={() => submitAction(option.action)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <button
        className="finish-button"
        disabled={pending}
        onClick={() => submitAction("finish")}
        type="button"
      >
        结束任务
      </button>
    </main>
  );
}
