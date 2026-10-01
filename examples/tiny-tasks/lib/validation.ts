/** Keep input rules together so every caller uses the same rules. */
export function validateTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('A task needs a title.');
  }

  const title = value.trim();
  if (title.length === 0) throw new Error('A task needs a title.');
  if (title.length > 120) throw new Error('Keep the title under 121 characters.');

  return title;
}
