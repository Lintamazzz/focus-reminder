import CompletionForm from "./components/CompletionForm";
import RecoveryPrompt from "./components/RecoveryPrompt";
import RunningTask from "./components/RunningTask";
import TaskStartForm from "./components/TaskStartForm";
import { useTaskTimer } from "./hooks/useTaskTimer";

export default function App() {
  const {
    session,
    recoverySession,
    completionDraft,
    elapsedSeconds,
    initializing,
    pending,
    error,
    startTask,
    requestFinish,
    saveCompletion,
    continueRecovery,
    finishRecovery,
    discardRecovery,
  } = useTaskTimer();

  let content;

  if (initializing) {
    content = (
      <main className="app-shell loading-shell">
        <div className="loading-mark">F</div>
        <p>正在读取本地任务…</p>
      </main>
    );
  } else if (recoverySession) {
    content = (
      <RecoveryPrompt
        onContinue={continueRecovery}
        onDiscard={discardRecovery}
        onFinish={finishRecovery}
        pending={pending}
        session={recoverySession}
      />
    );
  } else if (completionDraft) {
    content = (
      <CompletionForm
        draft={completionDraft}
        onSave={saveCompletion}
        pending={pending}
      />
    );
  } else if (session) {
    content = (
      <RunningTask
        elapsedSeconds={elapsedSeconds}
        onFinish={requestFinish}
        session={session}
      />
    );
  } else {
    content = <TaskStartForm onStart={startTask} pending={pending} />;
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      {content}
    </>
  );
}
