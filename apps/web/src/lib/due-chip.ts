// Due-date countdown chips (Stage 5 · Q23): "Due in 40 min", "Due in 5 h", "2 days left" on work
// that isn't handed in, for the coming week; redder as it gets closer. Pure, for the lists.

export type DueTone = 'soon' | 'today' | 'week';

/** The chip for a due date, or null when it's past (the list says Overdue) or more than a week away. */
export function dueChip(dueMs: number, nowMs: number): { label: string; tone: DueTone } | null {
  const left = dueMs - nowMs;
  if (!nowMs || left <= 0 || left > 7 * 86_400_000) return null;
  const min = Math.ceil(left / 60_000);
  if (min < 60) return { label: `Due in ${min} min`, tone: 'soon' };
  const hours = Math.floor(left / 3_600_000);
  if (hours < 24) return { label: `Due in ${hours} h`, tone: hours < 6 ? 'soon' : 'today' };
  const days = Math.floor(left / 86_400_000);
  return { label: days === 1 ? '1 day left' : `${days} days left`, tone: 'week' };
}
