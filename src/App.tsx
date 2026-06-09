import { invoke, isTauri } from "@tauri-apps/api/core";
import RunningTask from "./components/RunningTask";
import TaskStartForm from "./components/TaskStartForm";
import { useTaskTimer } from "./hooks/useTaskTimer";

export default function App() {
  const { session, elapsedSeconds, startTask, finishTask } = useTaskTimer();

  const handleFinish = () => {
    if (isTauri()) {
      invoke("hide_reminder").catch(console.error);
    }
    finishTask();
  };

  if (session) {
    return (
      <RunningTask
        elapsedSeconds={elapsedSeconds}
        onFinish={handleFinish}
        session={session}
      />
    );
  }

  return <TaskStartForm onStart={startTask} />;
}
