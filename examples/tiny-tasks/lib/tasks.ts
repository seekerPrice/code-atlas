type Task = {
  id: string;
  title: string;
  createdAt: string;
};

// This intentionally simple example stores tasks in memory.
// A real application would need a durable store and ownership rules.
const tasks: Task[] = [];

export function saveTask(title: string): Task {
  const task = {
    id: crypto.randomUUID(),
    title,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
}

export function listTasks(): Task[] {
  return [...tasks];
}
