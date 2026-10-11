// The files hub's search (Stage 5 · B9.13): the words kept from a file, and a short bit of them
// around a match to show under the file's name.

/** Words from a file for search, tidied and at most 20,000 characters (undefined when not sent). */
export const searchWords = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 20_000) || null : undefined);

/** About 140 characters around the first match (case doesn't matter), or null. */
export function snippet(text: string | null, q: string) {
  if (!text || !q) return null;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const from = Math.max(0, i - 60), to = i + q.length + 80;
  return `${from ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`;
}
