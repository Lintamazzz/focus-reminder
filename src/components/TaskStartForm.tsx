import { FormEvent, useEffect, useMemo, useState } from "react";

const PLANNED_TIME_OPTIONS = [1, 5, 15, 30, 45, 60];

type TaskStartFormProps = {
  onStart: (title: string, plannedMinutes: number) => void;
  defaultPlannedMinutes: number;
  pending?: boolean;
};

export default function TaskStartForm({
  onStart,
  defaultPlannedMinutes,
  pending = false,
}: TaskStartFormProps) {
  const [title, setTitle] = useState("");
  const [plannedMinutes, setPlannedMinutes] = useState(defaultPlannedMinutes);
  const plannedTimeOptions = useMemo(
    () =>
      [...new Set([...PLANNED_TIME_OPTIONS, defaultPlannedMinutes])].sort(
        (a, b) => a - b,
      ),
    [defaultPlannedMinutes],
  );

  useEffect(() => {
    setPlannedMinutes(defaultPlannedMinutes);
  }, [defaultPlannedMinutes]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onStart(title, plannedMinutes);
  };

  return (
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
              {plannedTimeOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} 分钟
                </option>
              ))}
            </select>
          </div>
        </label>

        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "正在开始…" : "开始任务"}
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </section>
  );
}
