import { FormEvent, useState } from "react";

const PLANNED_TIME_OPTIONS = [1, 5, 15, 30, 45, 60];

type TaskStartFormProps = {
  onStart: (title: string, plannedMinutes: number) => void;
};

export default function TaskStartForm({ onStart }: TaskStartFormProps) {
  const [title, setTitle] = useState("");
  const [plannedMinutes, setPlannedMinutes] = useState(30);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onStart(title, plannedMinutes);
  };

  return (
    <main className="app-shell start-shell">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">
          F
        </span>
        <span>Focus Reminder</span>
      </header>

      <section className="start-content">
        <p className="eyebrow">开始一个时间盒</p>
        <h1>这段时间，只做一件事。</h1>
        <p className="intro">
          写下此刻要推进的任务。到达预计时间时，我们会认真提醒你停下来做决定。
        </p>

        <form className="task-form" onSubmit={handleSubmit}>
          <label>
            <span>当前任务</span>
            <input
              autoFocus
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：完成项目方案初稿"
              type="text"
              value={title}
            />
          </label>

          <label>
            <span>预计时间</span>
            <div className="select-wrap">
              <select
                onChange={(event) =>
                  setPlannedMinutes(Number(event.target.value))
                }
                value={plannedMinutes}
              >
                {PLANNED_TIME_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} 分钟
                  </option>
                ))}
              </select>
            </div>
          </label>

          <button className="primary-button" type="submit">
            开始任务
            <span aria-hidden="true">→</span>
          </button>
        </form>
      </section>

      <footer className="app-footer">
        <span className="status-dot" />
        提醒窗口将在到点后保持置顶
      </footer>
    </main>
  );
}
