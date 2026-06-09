import { FormEvent, useState } from "react";
import type { CompletionDraft } from "../types/task";
import { formatDuration } from "../utils/time";

type CompletionFormProps = {
  draft: CompletionDraft;
  pending: boolean;
  onSave: (note: string, recordSkipped: boolean) => void;
};

export default function CompletionForm({
  draft,
  pending,
  onSave,
}: CompletionFormProps) {
  const [note, setNote] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(note, false);
  };

  return (
    <main className="app-shell completion-shell">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">
          F
        </span>
        <span>Focus Reminder</span>
      </header>

      <section className="completion-content">
        <p className="eyebrow">任务已结束</p>
        <h1>刚才你完成了什么？</h1>
        <p className="completion-summary">
          {draft.session.title}
          <span>{formatDuration(draft.elapsedSeconds)}</span>
        </p>

        <form className="completion-form" onSubmit={handleSubmit}>
          <label htmlFor="completion-note">完成记录</label>
          <textarea
            autoFocus
            id="completion-note"
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：完成项目 A 方案初稿"
            rows={5}
            value={note}
          />

          <div className="completion-actions">
            <button
              className="skip-button"
              disabled={pending}
              onClick={() => onSave("", true)}
              type="button"
            >
              跳过记录
            </button>
            <button className="primary-action" disabled={pending} type="submit">
              {pending ? "保存中…" : "保存记录"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
