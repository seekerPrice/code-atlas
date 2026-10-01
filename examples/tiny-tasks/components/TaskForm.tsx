'use client';

import { useState } from 'react';

export function TaskForm() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage('Saving…');

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(`Created: ${result.task.title}`);
      setTitle('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save.');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={title} onChange={e => setTitle(e.target.value)} />
      <button type="submit">Add task</button>
      <p role="status">{message}</p>
    </form>
  );
}
