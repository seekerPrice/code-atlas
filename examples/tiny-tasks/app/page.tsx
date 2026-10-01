// Learning example only. No dependencies need to be installed or run.
import { TaskForm } from '../components/TaskForm';

export default function HomePage() {
  return (
    <main>
      <h1>A little room for your next idea</h1>
      <p>Create a task and take the first step.</p>
      <TaskForm />
    </main>
  );
}
