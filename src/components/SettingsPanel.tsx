import { FormEvent, useEffect, useRef, useState } from "react";
import type { AppSettings, ThemePreference } from "../types/task";

type SettingsPanelProps = {
  settings: AppSettings;
  pending: boolean;
  onSave: (settings: AppSettings) => void;
};

export default function SettingsPanel({
  settings,
  pending,
  onSave,
}: SettingsPanelProps) {
  const [draft, setDraft] = useState(settings);
  const savedThemeRef = useRef(settings.theme);

  useEffect(() => {
    setDraft(settings);
    savedThemeRef.current = settings.theme;
  }, [settings]);

  useEffect(
    () => () => {
      document.documentElement.dataset.theme = savedThemeRef.current;
    },
    [],
  );

  const updateReminderOption = (index: number, value: number) => {
    setDraft((current) => ({
      ...current,
      reminderOptions: current.reminderOptions.map((minutes, optionIndex) =>
        optionIndex === index ? value : minutes,
      ),
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(draft);
  };

  const handleThemeChange = (theme: ThemePreference) => {
    document.documentElement.dataset.theme = theme;
    setDraft((current) => ({ ...current, theme }));
  };

  return (
    <section className="settings-panel">
      <p className="eyebrow">本地偏好</p>
      <h1>让提醒按你的节奏工作。</h1>
      <p className="intro">
        这些设置只保存在本机，并会应用到下一次任务和提醒窗口。
      </p>

      <form className="settings-form" onSubmit={handleSubmit}>
        <label>
          <span>默认预计时间</span>
          <div className="number-field">
            <input
              max={1440}
              min={1}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  defaultPlannedMinutes: Number(event.target.value),
                }))
              }
              required
              type="number"
              value={draft.defaultPlannedMinutes}
            />
            <span>分钟</span>
          </div>
        </label>

        <div
          aria-labelledby="reminder-options-label"
          className="settings-field-group"
          role="group"
        >
          <span id="reminder-options-label">提醒延长选项</span>
          <div className="reminder-option-fields">
            {draft.reminderOptions.map((minutes, index) => (
              <div className="number-field" key={index}>
                <input
                  aria-label={`第 ${index + 1} 个提醒延长选项`}
                  max={1440}
                  min={1}
                  onChange={(event) =>
                    updateReminderOption(index, Number(event.target.value))
                  }
                  required
                  type="number"
                  value={minutes}
                />
                <span>分钟</span>
              </div>
            ))}
          </div>
        </div>

        <label className="toggle-row">
          <span>
            <strong>提醒窗口置顶</strong>
            <small>关闭后提醒仍不会自动消失，但可以被其他窗口遮挡。</small>
          </span>
          <input
            checked={draft.alwaysOnTop}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                alwaysOnTop: event.target.checked,
              }))
            }
            type="checkbox"
          />
        </label>

        <label>
          <span>主题</span>
          <div className="select-wrap">
            <select
              onChange={(event) =>
                handleThemeChange(event.target.value as ThemePreference)
              }
              value={draft.theme}
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>
        </label>

        <button className="primary-action" disabled={pending} type="submit">
          {pending ? "保存中…" : "保存设置"}
        </button>
      </form>
    </section>
  );
}
