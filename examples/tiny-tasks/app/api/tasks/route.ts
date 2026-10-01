import { validateTitle } from '../../../lib/validation';
import { saveTask } from '../../../lib/tasks';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = validateTitle(body.title);
    const task = saveTask(title);
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return Response.json({ error: message }, { status: 400 });
  }
}
